import json
from datetime import date
from pathlib import Path
import tempfile
import unittest

from maintenance_refresh import latest_archive, rights_digest, validate_topics, prepare


class RefreshChecks(unittest.TestCase):
    def test_select_latest_only_on_approved_host(self):
        html = b"""<a href="//example.org/xml/mplus_topics_compressed_2099-01-01.zip">
        <a href="/xml/mplus_topics_compressed_2026-10-28.zip">
        <a href="/xml/mplus_topics_compressed_2026-10-31.zip">"""
        day, url = latest_archive(html)
        self.assertEqual(day.isoformat(), "2026-10-31")
        self.assertEqual(url, "https://medlineplus.gov/xml/mplus_topics_compressed_2026-10-31.zip")

    def test_policy_change_blocks_fetch_before_index_or_archive(self):
        requested = []
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "dist").mkdir()
            old = root / "dist/medline-topics.json"
            old.write_text(json.dumps({"feedDate": "2026-10-31", "topics": []}))

            def fake(url, maximum):
                requested.append(url)
                return b'<div class="mp-content">Summaries on health topic pages Copyrighted content changed</div>'

            with self.assertRaisesRegex(ValueError, "terms changed"):
                prepare(root, fetch=fake, today=date(2026, 11, 1))
            self.assertEqual(len(requested), 1)
            self.assertEqual(json.loads(old.read_text())["feedDate"], "2026-10-31")

    def test_rights_fingerprint_tracks_href_changes(self):
        html = b'<div class="mp-content">Summaries on health topic pages Copyrighted content<a href="https://example.org/a">terms</a></div>'
        self.assertNotEqual(rights_digest(html), rights_digest(html.replace(b"/a\x22", b"/b\x22")))

    def test_validation_detects_missing_content_and_forbidden_urls(self):
        records = [{"title": str(i), "url": f"https://medlineplus.gov/t{i}.html",
                    "sections": {"1": "Test fixture."}, "links": {}} for i in range(600)]
        self.assertFalse(any(validate_topics(records, records).values()))
        with self.assertRaisesRegex(ValueError, "fell by"):
            validate_topics(records[:501], records)
        with self.assertRaisesRegex(ValueError, "linked resource"):
            validate_topics([*records[:-1], {**records[-1], "links": {"1": {"url": "https://medlineplus.gov/ency/a.html"}}}], records)


if __name__ == "__main__":
    unittest.main()
