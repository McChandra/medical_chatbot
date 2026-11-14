"""Source preparation tests, requiring no GPU or Hugging Face credentials."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from prepare_research_data import POLICY, build_splits, prepare, eligible_passage
from train_adapter import load_examples


def snapshot():
    topics = []
    for i in range(30):
        topics.append({"title": f"Topic {i}", "url": f"https://medlineplus.gov/topic{i}.html", "aliases": [],
                       "knowledge": [{"id": str(i), "deck": 3, "overview": False,
                                      "text": f"This intact source passage describes the educational topic number {i}."}]})
    # Different names/pages with identical selected text must stay in one partition.
    duplicate = copy.deepcopy(topics[0]); duplicate.update(title="Alternate name", url="https://medlineplus.gov/alternate.html")
    topics.append(duplicate)
    return {"sourceUrl": "https://medlineplus.gov/xml/mplus_topics_2026-11-05.xml", "licenseUrl": POLICY,
            "feedDate": "2026-11-05", "topics": topics}


class ResearchDataTests(unittest.TestCase):
    def test_three_splits_are_deterministic_and_do_not_share_selected_source_text(self):
        first = build_splits(snapshot())
        self.assertEqual(first, build_splits(snapshot()))
        self.assertEqual(set(first), {"train", "validation", "test"})
        seen = {}
        for split, rows in first.items():
            self.assertTrue(rows)
            for row in rows:
                payload = json.loads(row['messages'][1]['content'])
                for source in payload['evidence']:
                    self.assertEqual(seen.setdefault(source['text'], split), split)
                self.assertIs(row['clinical_reviewed'], False)
                answer = json.loads(row['messages'][2]['content'])
                self.assertEqual([d['id'] for d in answer['decks']], [1,2,3,4,5,6] if payload['mode']=='search' else [])

    def test_prescriptive_or_dose_passages_are_excluded_intact(self):
        for text in ("You should take this medicine for these symptoms.", "This example contains 10 mg of a substance."):
            self.assertFalse(eligible_passage({"id": "p", "deck": 4, "text": text}))

    def test_excludes_unapproved_content_scope(self):
        bad = snapshot(); bad['sourceUrl'] = 'https://medlineplus.gov/ency/index.html'
        with self.assertRaises(ValueError):
            build_splits(bad)
        feed = snapshot(); feed['topics'][0]['url'] = 'https://medlineplus.gov/druginfo/meds/example.html'
        self.assertNotIn('Topic 0', {r['topic'] for rows in build_splits(feed).values() for r in rows})

    def test_token_filter_excludes_whole_rows(self):
        rows = build_splits(snapshot(), token_count=lambda r: 9999 if r['topic']=='Topic 0' else 100, max_tokens=2048)
        self.assertNotIn('Topic 0', {r['topic'] for values in rows.values() for r in values})

    def test_preparation_is_repeatable_and_cannot_overwrite_changed_data(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory, 'snapshot.json'); source.write_text(json.dumps(snapshot()))
            target = Path(directory, 'data')
            manifest = prepare(source, target)
            self.assertEqual(manifest, prepare(source, target))
            with self.assertRaises(ValueError):
                load_examples(target/'train.jsonl')
            rows = load_examples(target/'train.jsonl', research_only=True)
            self.assertTrue(rows)
            row = copy.deepcopy(rows[0]); answer = json.loads(row['messages'][2]['content'])
            answer['answer']['claims'][0]['text'] = 'An unsupported diagnosis despite a valid citation.'
            row['messages'][2]['content'] = json.dumps(answer)
            corrupt = Path(directory, 'corrupt.jsonl'); corrupt.write_text(json.dumps(row)+'\n')
            with self.assertRaises(ValueError):
                load_examples(corrupt, research_only=True)
            row = copy.deepcopy(rows[0]); row['license_reviewed'] = False
            corrupt.write_text(json.dumps(row)+'\n')
            with self.assertRaises(ValueError):
                load_examples(corrupt, research_only=True)
            (target/'train.jsonl').write_text('changed')
            with self.assertRaises(ValueError):
                prepare(source, target)
            self.assertEqual((target/'train.jsonl').read_text(), 'changed')


if __name__ == '__main__':
    unittest.main()
