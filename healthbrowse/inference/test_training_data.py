import copy
import json
import tempfile
import unittest
from pathlib import Path
from train_adapter import load_examples, validate_split
from model_settings import GENERAL_BASE, validate_base, validate_adapter


def example(topic="Topic A", url="https://medlineplus.gov/topic-a.html"):
    text = "A public source passage with enough exact supporting text."
    payload = {"role": "General reader", "mode": "chat", "evidence": [{"id": "S1", "text": text}]}
    answer = {"answer": {"claims": [{"text": text, "support": [{"id": "S1", "quote": text}]}]}, "decks": []}
    return {"topic": topic, "source_urls": [url], "license_reviewed": True, "clinical_reviewed": True,
            "messages": [{"role": "system", "content": "Test instructions"},
                         {"role": "user", "content": json.dumps(payload)},
                         {"role": "assistant", "content": json.dumps(answer)}]}


class TrainingDataTests(unittest.TestCase):
    def test_base_model_and_context_match_requested_llama(self):
        sha = "a" * 40
        validate_base(GENERAL_BASE, sha, 8192)
        for model, revision, length in [(GENERAL_BASE + ":featherless-ai", sha, 8192),
                                        (GENERAL_BASE, "main", 8192),
                                        (GENERAL_BASE, sha, 16384)]:
            with self.assertRaises(ValueError):
                validate_base(model, revision, length)

    def test_adapter_requires_matching_base_and_revision(self):
        sha = "a" * 40
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "adapter_config.json").write_text(json.dumps({"base_model_name_or_path": GENERAL_BASE}))
            manifest = {"base_model": GENERAL_BASE, "revision": sha}
            Path(directory, "training-manifest.json").write_text(json.dumps(manifest))
            self.assertEqual(validate_adapter(directory, GENERAL_BASE, sha), manifest)
            with self.assertRaises(ValueError):
                validate_adapter(directory, "google/medgemma-4b-it", sha)
            with self.assertRaises(ValueError):
                validate_adapter(directory, GENERAL_BASE, "b" * 40)

    def load(self, row):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory, "data.jsonl")
            path.write_text(json.dumps(row) + "\n")
            return load_examples(path)

    def test_requires_reviewed_cited_targets(self):
        self.assertEqual(len(self.load(example())), 1)
        for field in ("clinical_reviewed", "license_reviewed"):
            row = example()
            row[field] = False
            with self.assertRaises(ValueError):
                self.load(row)

    def test_fabricated_target_quotes_fail(self):
        row = example()
        answer = json.loads(row["messages"][-1]["content"])
        answer["answer"]["claims"][0]["support"][0]["quote"] = "This unsupported quote was invented."
        row["messages"][-1]["content"] = json.dumps(answer)
        with self.assertRaises(ValueError):
            self.load(row)

    def test_source_and_disease_leakage_fail(self):
        a = example()
        for b in [example("Topic A", "https://medlineplus.gov/different.html"),
                  example("Topic B", "https://medlineplus.gov/topic-a.html#summary")]:
            with self.assertRaises(ValueError):
                validate_split([a], [b])
        validate_split([a], [example("Topic B", "https://medlineplus.gov/topic-b.html")])

    def test_search_requires_six_decks(self):
        row = example()
        payload = json.loads(row["messages"][1]["content"])
        payload["mode"] = "search"
        row["messages"][1]["content"] = json.dumps(payload)
        with self.assertRaises(ValueError):
            self.load(row)


if __name__ == "__main__":
    unittest.main()
