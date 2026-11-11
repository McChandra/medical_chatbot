"""Pinned source ingestion, stable identities, connected-group splitting and chunking."""
from collections import Counter, defaultdict
from hashlib import sha256
import io
import json
import random
import re
import subprocess
import tarfile
import unicodedata
import xml.etree.ElementTree as ET

MEDQUAD_REVISION = "577bd37b96c02d1833b2c9eed2de9f96964e96cb"


def normalize(value):
    return " ".join(unicodedata.normalize("NFKC", str(value)).casefold().split())


def digest(value):
    return sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                             separators=(",", ":")).encode()).hexdigest()


def load_medquad(repo):
    # Read immutable Git objects, never a possibly modified working tree.
    raw = subprocess.check_output(["git", "-C", str(repo), "archive", MEDQUAD_REVISION])
    rows, excluded = [], 0
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        for member in sorted(archive.getmembers(), key=lambda m: m.name):
            if not member.name.endswith(".xml"):
                continue
            if member.name.split("_", 1)[0] not in {str(i) for i in range(1, 10)}:
                excluded += 1  # answers removed upstream for copyright reasons
                continue
            document = ET.fromstring(archive.extractfile(member).read())
            for pair in document.findall(".//QAPair"):
                question = pair.find("Question")
                rows.append({"record_id": member.name + "#" + question.get("qid"),
                             "question": question.text or "", "answer": pair.findtext("Answer") or "",
                             "focus_area": document.findtext("Focus") or "",
                             "source": member.name.split("/", 1)[0],
                             "source_url": document.get("url") or "",
                             "question_type": question.get("qtype") or "unknown"})
    return rows, {"revision": MEDQUAD_REVISION, "raw_records": len(rows),
                  "excluded_copyright_xml_files": excluded, "archive_sha256": sha256(raw).hexdigest()}


def clean_records(rows):
    """Deduplicate normalized Q/A/focus; preserve every original ID as an alias."""
    unique, dropped = {}, []
    for row in sorted(rows, key=lambda r: r["record_id"]):
        r = dict(row)
        for field in ("question", "answer", "focus_area"):
            r[field] = " ".join(r[field].split())
        if not all(r[f] for f in ("question", "answer", "focus_area")):
            dropped.append(r["record_id"])
            continue
        key = digest([normalize(r[f]) for f in ("question", "answer", "focus_area")])
        if key in unique:
            unique[key]["aliases"].append(r["record_id"])
        else:
            unique[key] = {**r, "aliases": [r["record_id"]]}
    records = sorted(unique.values(), key=lambda r: r["record_id"])
    return records, {"missing_required_ids": dropped,
                     "duplicate_records_removed": sum(len(r["aliases"]) - 1 for r in records)}


def grouped_split(rows, fractions=(.8, .1, .1), seed=42):
    """Union focus, question and answer duplicates before assigning entire components.

    Fractions target group counts, not rows. Exact/normalized duplicates only;
    ontology aliases, paraphrases and pretraining contamination remain unmeasured.
    """
    if len(fractions) != 3 or any(x <= 0 for x in fractions) or abs(sum(fractions) - 1) > 1e-8:
        raise ValueError("Three positive fractions must sum to one")
    rows = sorted(rows, key=lambda r: r["record_id"])
    if len({r['record_id'] for r in rows}) != len(rows):
        raise ValueError("record_id must be unique")
    parents = list(range(len(rows)))

    def root(i):
        while i != parents[i]:
            parents[i] = parents[parents[i]]
            i = parents[i]
        return i

    seen = {}
    for i, row in enumerate(rows):
        for field in ("focus_area", "question", "answer"):
            value = normalize(row[field])
            if not value or (field == "focus_area" and value in {"unknown", "nan", "none"}):
                raise ValueError("Grouped splits require nonempty question, answer and known focus_area")
            key = (field, digest(value))
            if key in seen:
                parents[root(i)] = root(seen[key])
            else:
                seen[key] = i
    components = defaultdict(list)
    for i, row in enumerate(rows):
        components[root(i)].append(row)
    groups = sorted(components.values(), key=lambda g: g[0]["record_id"])
    if len(groups) < 3:
        raise ValueError("Need at least three independent focus/answer/question components")
    random.Random(seed).shuffle(groups)
    ntrain = min(len(groups) - 2, max(1, int(len(groups) * fractions[0])))
    nvalid = min(len(groups) - ntrain - 1, max(1, int(len(groups) * fractions[1])))
    assignments, clusters = {}, {}
    for i, group in enumerate(groups):
        split = "train" if i < ntrain else "validation" if i < ntrain + nvalid else "test"
        cluster = digest(sorted(r["record_id"] for r in group))[:20]
        for row in group:
            assignments[row["record_id"]] = split
            clusters[row["record_id"]] = cluster
    counts = Counter(assignments.values())
    overlaps = {}
    for field in ("focus_area", "question", "answer"):
        values = {name: {normalize(r[field]) for r in rows if assignments[r["record_id"]] == name}
                  for name in ("train", "validation", "test")}
        overlaps[field] = {a + "/" + b: len(values[a] & values[b])
                           for a, b in (("train", "validation"), ("train", "test"), ("validation", "test"))}
    return {"protocol": "connected-focus-question-answer-v1", "seed": seed,
            "target_group_fractions": fractions, "records_sha256": digest(rows),
            "record_count": len(rows), "component_count": len(groups),
            "largest_component_records": max(map(len, groups)), "counts": dict(counts),
            "normalized_overlap_counts": overlaps, "assignments": assignments, "clusters": clusters}


def chunk_records(records, words=160):
    """Sentence-aware bounded word chunks; long sentences split, no overlap.

    Offsets address whitespace-normalized answers. Context prefix is NOT part of
    the source quote and is varied at retrieval time without changing passage IDs.
    """
    if words < 20:
        raise ValueError("Chunk size must be at least 20 words")
    passages = []
    for r in records:
        tokens = list(re.finditer(r"\S+", r["answer"]))
        start = 0
        while start < len(tokens):
            end = min(start + words, len(tokens))
            if end < len(tokens):
                boundaries = [i + 1 for i in range(start + words // 2, end)
                              if tokens[i].group().endswith((".", "?", "!"))]
                if boundaries:
                    end = boundaries[-1]
            a, b = tokens[start].start(), tokens[end - 1].end()
            text = r["answer"][a:b]
            passages.append({"passage_id": r["record_id"] + f"@{a}:{b}",
                             "record_id": r["record_id"], "focus_area": r["focus_area"],
                             "source_url": r["source_url"], "text": text, "start": a, "end": b,
                             "quote_sha256": sha256(text.encode()).hexdigest()})
            start = end
    return passages


def provenance_valid(passage, records):
    record = records.get(passage.get("record_id"))
    if not record:
        return False
    a, b = passage.get("start"), passage.get("end")
    return (type(a) is int and type(b) is int and 0 <= a < b <= len(record["answer"])
            and passage.get("text") == record["answer"][a:b]
            and passage.get("source_url") == record["source_url"]
            and normalize(passage.get("focus_area", "")) == normalize(record["focus_area"])
            and passage.get("quote_sha256") == sha256(passage["text"].encode()).hexdigest())
