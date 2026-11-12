"""Refresh the MedlinePlus index with Python's standard library.

python scripts/build_medline_topics.py [--archive /path/to/publisher.zip]
Only the English health topic full-summary, publisher vocabulary, and first-party
link metadata are copied. The feed timestamp is not an article review date.
"""
import argparse
import hashlib
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree

INDEX_URL = "https://medlineplus.gov/xml.html"
RIGHTS_URL = "https://medlineplus.gov/about/using/usingcontent/"
CATEGORIES = {
    "1": ["Start Here", "Videos and Tutorials"],
    "2": ["Diagnosis and Tests"],
    "3": ["Statistics and Research", "Clinical Trials", "Journal Articles"],
    "5": ["Genetics", "Prevention and Risk Factors"],
    "6": ["Symptoms", "Treatments and Therapies"],
    "7": ["Find an Expert"],
}
ALLOWED_HOSTS = ("nih.gov", "cancer.gov", "medlineplus.gov", "cdc.gov",
                 "clinicaltrials.gov", "fda.gov", "hrsa.gov", "genome.gov")


def clean(value):
    return " ".join(value.split())


class Summary(HTMLParser):
    """Read one block at a time, preserving the heading associated with each block."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tag, self.pending, self.heading, self.blocks = "", [], "", []

    def finish(self):
        text = clean("".join(self.pending))
        if text:
            if self.tag in ("h2", "h3", "h4"):
                self.heading = text
            elif self.tag in ("p", "li"):
                self.blocks.append((self.heading, self.tag, text))
        self.tag, self.pending = "", []

    def handle_starttag(self, tag, attrs):
        if tag in ("h2", "h3", "h4", "p", "li"):
            self.finish()
            self.tag = tag
        elif tag == "br":
            self.pending.append(" ")

    def handle_endtag(self, tag):
        if tag == self.tag:
            self.finish()

    def handle_data(self, data):
        if self.tag:
            self.pending.append(data)


def excerpt(blocks, matches):
    for position, (heading, tag, text) in enumerate(blocks):
        if tag != "p" or not matches(heading.lower()) or text.lower().startswith("nih:"):
            continue
        if text.endswith(":"):
            # Never leave the reader with a list introduction and no answer.
            items = []
            for h, kind, item in blocks[position + 1:]:
                if h != heading or kind != "li":
                    break
                items.append(item)
            if not items:
                continue
            examples = ". ".join(item.rstrip(".") for item in items[:3]) + "."
            if len(items) > 3:
                examples += " See the source for the full list."
            text += " " + examples
        if len(text) <= 560:
            return text
        # Do not truncate mid-clause, in a dosage, or inside a qualifier.
        if text.endswith(("?", ".")):
            sentence = re.match(r"(.{35,350}?[.!?])\s+(?=[A-Z])", text)
            if sentence:
                return sentence.group(1)
    return ""


def allowed_link(url):
    parsed = urlsplit(url)
    return (parsed.scheme == "https" and parsed.hostname and
            any(parsed.hostname == host or parsed.hostname.endswith("." + host)
                for host in ALLOWED_HOSTS) and not parsed.path.startswith("/ency/"))


def knowledge_blocks(blocks):
    """Keep every summary paragraph and its complete list, with publisher headings.

    The legacy four previews stay available. This richer index prevents a symptom
    preview from swallowing the treatment section in the same source summary.
    """
    groups = []
    for heading, kind, text in blocks:
        if text.lower().startswith("nih:"):
            continue
        if kind == "li" and groups and groups[-1][0] == heading:
            groups[-1][1].append("• " + text)
        else:
            groups.append([heading, [text]])
    result = []
    for position, (heading, parts) in enumerate(groups):
        text = "\n".join(parts)
        h, t = heading.lower(), text.lower()
        rules = [
            (r"(?:what should|target|goal).*(?:ldl|cholesterol|blood pressure|level)|(?:ldl|cholesterol).*(?:target|goal)", 4, "therapy"),
            (r"complication|prognos|outlook|survival", 5, "prognosis"),
            (r"prevent|incidence|prevalence|how common", 6, "public-health"),
            (r"treat|therap|manag|living with", 4, "therapy"),
            (r"diagnos|screen|test", 3, "identify"),
            (r"symptom|signs", 3, "symptoms"),
            (r"caus|etiolog", 1, "risk"),
            (r"risk|more likely", 1, "risk"),
            (r"progress|course|untreated|over time", 2, "course"),
            (r"types|classif", 1, "classification"),
            (r"genetic|inherit", 1, "genes"),
        ]
        matched = next(((deck, intent) for pattern, deck, intent in rules if re.search(pattern, h)), None)
        if matched:
            deck, intent = matched
        elif position == 0:
            deck, intent = 1, "definition"
        elif re.search(r"what (?:is|are)|overview", h):
            if position == 0 or groups[position - 1][0] != heading:
                deck, intent = 1, "definition"
            elif re.search(r"cells|insulin|immune|inflam|causes?|crowd|narrow|tissues|organs", t):
                deck, intent = 1, "mechanism"
            else:
                deck, intent = 1, "context"
        else:
            # Unheaded paragraphs use narrow content cues; a missing category is
            # left out rather than assigning every paragraph to a default deck.
            matched = next(((deck, intent) for pattern, deck, intent in rules if re.search(pattern, t)), None)
            if not matched:
                continue
            deck, intent = matched
        result.append({"heading": heading, "text": text, "deck": deck, "intent": intent,
                       "overview": intent == "definition",
                       "id": hashlib.sha256((heading + "\n" + text).encode()).hexdigest()[:16]})
        # A subtype description can explicitly establish progression. Preserve
        # the complete source scope and do not infer a duration or untreated state.
        if intent == "classification" and re.search(r"grows? quickly|grows? slowly|fast growing|slow growing|gets worse", t):
            result.append({**result[-1], "deck": 2, "intent": "course"})
    return result


def topic_record(row):
    url = row.get("url", "")
    if row.get("language") != "English" or not re.fullmatch(r"https://medlineplus\.gov/[\w-]+\.html", url):
        return None
    summary = Summary()
    summary.feed(row.findtext("full-summary", ""))
    summary.finish()
    sections = {}
    for section, matcher in [
        ("1", lambda h: not h or h.startswith(("what is ", "what are ", "overview"))),
        ("2", lambda h: any(k in h for k in ("diagnos", "screen", "test for", "identified", "identif", "types of"))),
        ("5", lambda h: any(k in h for k in ("genetic", "inherit", "at risk", "risk factor", "early sign", "early warning", "who is more likely"))),
        ("6", lambda h: any(k in h for k in ("symptom", "signs of", "treated", "treatment", "affect the", "affect my"))),
    ]:
        text = excerpt(summary.blocks, matcher)
        if text and text not in sections.values():
            sections[section] = text
    links = {}
    for section, categories in CATEGORIES.items():
        for category in categories:
            for site in row.findall("site"):
                link = site.get("url", "")
                if site.findtext("information-category") == category and allowed_link(link):
                    links[section] = {
                        "title": site.get("title"), "url": link,
                        "publisher": site.findtext("organization", urlsplit(link).hostname),
                        "category": category,
                    }
                    break
            if section in links:
                break
    # MeSH descriptors index the publisher page; they are not ICD/SNOMED mappings.
    descriptors = [{"id": d.get("id"), "label": clean(d.text or "")}
                   for d in row.findall("mesh-heading/descriptor")
                   if re.fullmatch(r"D[0-9]+", d.get("id", "")) and d.text]
    return {
        "title": row.get("title"), "url": url, "mesh": descriptors,
        "aliases": [clean(x.text) for x in row.findall("also-called") if x.text],
        "sections": sections, "links": links, "knowledge": knowledge_blocks(summary.blocks),
    }


def read_source(archive=None):
    if archive:
        data = Path(archive).read_bytes()
    else:
        with urlopen(Request(INDEX_URL, headers={"User-Agent": "HealthBrowse research index"}), timeout=30) as response:
            listing = response.read().decode("utf-8")
        files = re.findall(r'href="([^"]*mplus_topics_compressed_\d{4}-\d{2}-\d{2}\.zip)"', listing)
        if not files:
            raise ValueError("No dated compressed feed found")
        url = urljoin(INDEX_URL, sorted(files)[-1])
        if urlsplit(url).hostname != "medlineplus.gov":
            raise ValueError("Unexpected download host")
        with urlopen(Request(url, headers={"User-Agent": "HealthBrowse research index"}), timeout=60) as response:
            data = response.read(12_000_001)
    if len(data) > 12_000_000:
        raise ValueError("Unexpected feed size")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = [n for n in z.namelist() if re.fullmatch(r"mplus_topics_\d{4}-\d{2}-\d{2}\.xml", n)]
        if len(names) != 1 or z.getinfo(names[0]).file_size > 60_000_000:
            raise ValueError("Unexpected XML archive structure")
        return ElementTree.fromstring(z.read(names[0])), names[0]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive")
    parser.add_argument("--output", type=Path,
                        default=Path(__file__).resolve().parents[1] / "dist/medline-topics.json")
    args = parser.parse_args()
    root, name = read_source(args.archive)
    date = datetime.strptime(root.attrib["date-generated"], "%m/%d/%Y %H:%M:%S").date().isoformat()
    rows = [record for row in root.findall("health-topic") if (record := topic_record(row))]
    if len(rows) < 500:
        raise ValueError("Incomplete English topic feed")
    data = {"provider": "MedlinePlus, National Library of Medicine",
            "sourceUrl": "https://medlineplus.gov/xml/" + name,
            "feedDate": date, "retrievedAt": datetime.now(timezone.utc).date().isoformat(),
            "licenseUrl": RIGHTS_URL, "topics": rows}
    args.output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
