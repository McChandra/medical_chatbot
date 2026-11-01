"""Fixture coverage for extractive answers and the authenticated HTTP boundary."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from backend.copilot_engine import answer

ROW = {"deck": 4, "text": "Signs of leukemia vary.", "title": "Symptoms",
       "focus": "Leukemia", "record": "test#1", "url": "http://example.org/original",
       "sourceRecord": "https://example.org/archive", "attribution": "Fixture only",
       "license": "fixture", "vintage": "fixture"}
QUESTION = {"topic": "Leukemia", "deck": 4, "question": "What are the symptoms of leukemia?"}


class EngineTest(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "passages.json"
        self.path.write_text(json.dumps({"Leukemia": [ROW, {**ROW, "deck": 2}],
                                         "Asthma": [{**ROW, "text": "Other topic."}]}))
        setting = patch.dict(os.environ, MEDQUAD_PASSAGES_PATH=str(self.path))
        setting.start()
        self.addCleanup(setting.stop)

    def test_exact_text_scope_and_attribution(self):
        response = answer(**QUESTION)
        self.assertEqual(response["status"], "excerpt")
        self.assertEqual(response["passages"], [ROW])

    def test_missing_context_or_evidence(self):
        self.assertEqual(answer("Leukemia", 8, "What are the symptoms?")["status"], "unsupported")
        self.assertEqual(answer("Leukemia", 4, "What causes leukemia?")["status"], "unsupported")
        self.assertEqual(answer("unknown", 4, "What are the symptoms?")["status"], "invalid_context")
        self.assertEqual(answer("Shingles", 4, "What are the symptoms?")["status"], "unsupported")
        self.path.unlink()
        self.assertEqual(answer(**QUESTION)["status"], "unavailable")

    @patch("backend.copilot_engine.read_passages", side_effect=AssertionError("safety must precede retrieval"))
    def test_safety_precedes_retrieval(self, _reader):
        for question, status in [("My chest pain is severe.", "urgent"),
                                 ("Name is Jane Smith.", "privacy"),
                                 ("Email x@y.com", "privacy"),
                                 ("Can I take this?", "personal"),
                                 ("Does Jane Smith have leukemia?", "unsupported")]:
            self.assertEqual(answer("Leukemia", 4, question)["status"], status)


class EndpointTest(unittest.TestCase):
    def test_http_auth_and_extraction(self):
        try:
            from fastapi.testclient import TestClient
            from backend.main import app
        except ModuleNotFoundError as error:
            self.skipTest("Install repository API dependencies: " + str(error))
        client = TestClient(app)
        self.assertEqual(client.post("/copilot/answer", json=QUESTION).status_code, 401)
        with patch("backend.copilot.create_supabase_client") as auth:
            auth.return_value.auth.get_user.return_value.user = None
            self.assertEqual(client.post("/copilot/answer", json=QUESTION,
                             headers={"Authorization": "Bearer bad"}).status_code, 401)
            auth.return_value.auth.get_user.return_value.user = object()
            with patch("backend.copilot_engine.read_passages", return_value=[ROW]):
                res = client.post("/copilot/answer", json=QUESTION, headers={"Authorization": "Bearer fixture"})
                self.assertEqual(res.status_code, 200)
                self.assertEqual(res.json()["passages"][0]["text"], ROW["text"])
                self.assertEqual(res.headers["Cache-Control"], "no-store")


if __name__ == "__main__":
    unittest.main()
