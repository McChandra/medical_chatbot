"""Prepare a review-only change to the MedlinePlus index. Run from any directory."""
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path
import re
from tempfile import TemporaryDirectory
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
import zipfile
from datetime import date, datetime, timezone

import build_medline_topics as importer

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "dist" / "medline-topics.json"
MANIFEST = ROOT / "docs" / "source-provenance.json"
POLICY = Path(__file__).with_name("maintenance_source_policy.json")
ARCHIVE_PATTERN = re.compile(r"/xml/mplus_topics_compressed_(\d{4}-\d{2}-\d{2})\.zip")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def approved_url(url):
    parts = urlsplit(url)
    return parts.scheme == "https" and parts.netloc == "medlineplus.gov" and not parts.query and not parts.fragment


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Upstream redirect requires manual review")


def download(url, maximum, timeout=45):
    if not approved_url(url):
        raise ValueError("Unapproved publisher URL")
    request = Request(url, headers={"User-Agent": "HealthBrowse weekly research feed check"})
    with build_opener(NoRedirect()).open(request, timeout=timeout) as response:
        if response.status != 200:
            raise ValueError("Unexpected publisher status")
        payload = response.read(maximum + 1)
    if not payload or len(payload) > maximum:
        raise ValueError("Publisher response missing or exceeds size limit")
    return payload


class RightsPolicy(HTMLParser):
    """Hash substantive publisher terms, including link destinations, without navigation."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        fields = dict(attrs)
        if tag == "div" and (self.depth or "mp-content" in (fields.get("class") or "").split()):
            self.depth += 1
        if self.depth and tag == "a":
            self.parts.append(fields.get("href") or "")

    def handle_endtag(self, tag):
        if self.depth and tag == "div":
            self.depth -= 1

    def handle_data(self, data):
        if self.depth:
            self.parts.append(data)


def rights_digest(html):
    parser = RightsPolicy()
    parser.feed(html.decode("utf-8"))
    text = " ".join(" ".join(parser.parts).split())
    if "Summaries on health topic pages" not in text or "Copyrighted content" not in text:
        raise ValueError("Publisher usage terms format changed")
    return sha(text.encode())


def latest_archive(html):
    links = re.findall(r'href=["\']([^"\']+)["\']', html.decode("utf-8"))
    candidates = []
    for link in links:
        url = urljoin(importer.INDEX_URL, link)
        match = ARCHIVE_PATTERN.fullmatch(urlsplit(url).path)
        if match and approved_url(url):
            candidates.append((date.fromisoformat(match[1]), url))
    if not candidates:
        raise ValueError("No approved, dated MedlinePlus ZIP was listed")
    return max(candidates)


def validate_topics(new, old):
    if not (500 <= len(new) <= 4000):
        raise ValueError("Topic count outside approved bounds")
    if len(new) < .90 * len(old):
        raise ValueError("Topic count fell by more than 10%; inspect upstream first")
    urls = set()
    for row in new:
        url = row["url"]
        if url in urls or not re.fullmatch(r"https://medlineplus\.gov/[\w-]+\.html", url):
            raise ValueError("Invalid or duplicate topic source")
        urls.add(url)
        if not row["title"] or set(row["sections"]) - {"1", "2", "5", "6"}:
            raise ValueError("Topic shape changed")
        if any(len(value) > 560 or not value for value in row["sections"].values()):
            raise ValueError("Invalid section extract")
        if any(not importer.allowed_link(item["url"]) for item in row["links"].values()):
            raise ValueError("Unapproved linked resource")
    previous = {r["url"]: r for r in old}
    current = {r["url"]: r for r in new}
    return {
        "added": sorted(current.keys() - previous.keys()),
        "removed": sorted(previous.keys() - current.keys()),
        "updated": sorted(url for url in previous.keys() & current.keys() if previous[url] != current[url]),
    }


def prepare(root=ROOT, fetch=download, today=None):
    today = today or datetime.now(timezone.utc).date()
    policy = json.loads(POLICY.read_text())
    terms = rights_digest(fetch(importer.RIGHTS_URL, 600_000))
    if terms != policy["rights_sha256"]:
        raise ValueError("Publisher terms changed; source-owner review required before ingestion")
    feed_day, archive_url = latest_archive(fetch(importer.INDEX_URL, 1_000_000))
    index_path = root / "dist" / INDEX.name
    manifest_path = root / "docs" / MANIFEST.name
    baseline = json.loads(index_path.read_bytes())
    if not date.fromisoformat(baseline["feedDate"]) <= feed_day <= today:
        raise ValueError("Refusing a backdated or future feed")
    archive = fetch(archive_url, 12_000_000)
    xml_name = f"mplus_topics_{feed_day.isoformat()}.xml"
    with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
        if bundle.namelist() != [xml_name] or bundle.getinfo(xml_name).file_size > 60_000_000:
            raise ValueError("Archive shape or uncompressed size changed")
        if b"<!ENTITY" in bundle.read(xml_name).upper():
            raise ValueError("Embedded XML entity declarations are not accepted")
    with TemporaryDirectory() as tmp:
        archive_path = Path(tmp) / "publisher.zip"
        archive_path.write_bytes(archive)
        xml, name = importer.read_source(archive_path)
    xml_day = datetime.strptime(xml.attrib["date-generated"], "%m/%d/%Y %H:%M:%S").date()
    if xml_day != feed_day or name != xml_name:
        raise ValueError("Source dates disagree")
    topics = [row for el in xml.findall("health-topic") if (row := importer.topic_record(el))]
    changes = validate_topics(topics, baseline["topics"])
    previous_manifest = json.loads(manifest_path.read_bytes()) if manifest_path.exists() else {}
    if (baseline["feedDate"] == feed_day.isoformat() and not any(changes.values()) and
            previous_manifest.get("archive_sha256") == sha(archive) and
            previous_manifest.get("index_sha256") == sha(index_path.read_bytes())):
        print("Same approved source and index; no review needed.")
        return False
    next_index = {"provider": "MedlinePlus, National Library of Medicine",
                  "sourceUrl": f"https://medlineplus.gov/xml/{name}", "feedDate": feed_day.isoformat(),
                  "retrievedAt": today.isoformat(), "licenseUrl": importer.RIGHTS_URL, "topics": topics}
    packed = json.dumps(next_index, ensure_ascii=False, separators=(",", ":")).encode()
    if len(packed) > 4_000_000:
        raise ValueError("Index exceeds artifact size budget")
    manifest = {"source": archive_url, "feed_date": feed_day.isoformat(), "checked_on": today.isoformat(),
                "archive_sha256": sha(archive), "index_sha256": sha(packed),
                "rights_url": importer.RIGHTS_URL, "rights_sha256": terms,
                "topic_count": len(topics), "changed_topic_urls": changes}
    # Only the two expected paths leave this scratch candidate; Git applies them as one commit.
    index_path.write_bytes(packed)
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Prepared {len(topics)} topics, {sum(map(len, changes.values()))} changed URLs. Human review required.")
    return True


if __name__ == "__main__":
    prepare()
