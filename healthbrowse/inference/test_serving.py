"""Private API contract tests. These do not load or certify Llama weights."""
import asyncio
import importlib.util
import os
import threading
import unittest
from unittest.mock import patch
AVAILABLE=bool(importlib.util.find_spec('fastapi') and importlib.util.find_spec('httpx'))
if AVAILABLE:
    import serve
    from fastapi import HTTPException
    from fastapi.testclient import TestClient

KEY='test-only-key-with-at-least-thirty-two-characters'


@unittest.skipUnless(AVAILABLE,'Install fastapi and httpx for serving contract tests')
class ServingTests(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict(os.environ,{'INFERENCE_API_KEY':KEY});self.env.start();self.addCleanup(self.env.stop)
        serve.state.clear();serve.state.update(model_id='adapter',base_alias='base-review',medical=False,research_only=True)
        serve.lock=asyncio.Lock()
        self.client=TestClient(serve.app)
        self.addCleanup(self.client.close);self.addCleanup(serve.state.clear)
        self.body={'model':'adapter','messages':[{'role':'user','content':'synthetic API test'}],'max_tokens':16}
        self.headers={'Authorization':'Bearer '+KEY}

    def test_requires_auth_and_enforces_streaming_body_limit(self):
        self.assertEqual(self.client.post('/v1/chat/completions',json=self.body).status_code,401)
        r=self.client.post('/v1/chat/completions',headers=self.headers,content=b'x'*100001)
        self.assertEqual(r.status_code,413)
        with patch.dict(os.environ,{'INFERENCE_API_KEY':''}):
            self.assertEqual(self.client.post('/v1/chat/completions',headers={'Authorization':'Bearer '},json=self.body).status_code,401)

    def test_adapter_and_base_aliases_are_distinct_and_research_is_labeled(self):
        with patch.object(serve,'generate',return_value=('{}',False)) as gen:
            for alias in ['adapter','base-review']:
                r=self.client.post('/v1/chat/completions',headers=self.headers,json={**self.body,'model':alias})
                self.assertEqual(r.status_code,200);self.assertEqual(r.json()['model'],alias)
                self.assertTrue(r.json()['research_only']);self.assertEqual(gen.call_args.args[0].model,alias)
            self.assertEqual(self.client.post('/v1/chat/completions',headers=self.headers,json={**self.body,'model':'other'}).status_code,400)

    def test_json_schema_requests_and_busy_health_are_supported(self):
        schema={'type':'object','properties':{'ok':{'type':'boolean'}},'required':['ok'],'additionalProperties':False}
        body={**self.body,'response_format':{'type':'json_schema','json_schema':{'name':'test','strict':True,'schema':schema}}}
        with patch.object(serve,'generate',return_value=('{"ok":true}',False)):
            self.assertEqual(self.client.post('/v1/chat/completions',headers=self.headers,json=body).status_code,200)
        body['response_format']['json_schema']['schema']={'$ref':'https://invalid.example/schema'}
        self.assertEqual(self.client.post('/v1/chat/completions',headers=self.headers,json=body).status_code,400)
        self.assertFalse(self.client.get('/healthz').json()['busy'])

    def test_failure_and_context_overflow_do_not_disclose_internal_details(self):
        for error,code in [(ValueError('secret context detail'),413),(RuntimeError('secret failure detail'),503)]:
            with patch.object(serve,'generate',side_effect=error):
                r=self.client.post('/v1/chat/completions',headers=self.headers,json=self.body)
                self.assertEqual(r.status_code,code);self.assertNotIn('secret',r.text)
        with patch.object(serve,'generate',return_value=('{}',True)):
            r=self.client.post('/v1/chat/completions',headers=self.headers,json=self.body)
            self.assertEqual(r.json()['choices'][0]['finish_reason'],'length')


@unittest.skipUnless(AVAILABLE,'Install fastapi and httpx')
class CancellationTests(unittest.IsolatedAsyncioTestCase):
    async def test_cancelled_client_keeps_gpu_busy_until_generation_finishes(self):
        serve.state.clear();serve.state.update(model_id='adapter',medical=False)
        serve.lock=asyncio.Lock();started=threading.Event();release=threading.Event()
        def generate(body):
            started.set();release.wait(timeout=3);return '{}',False
        body=serve.Completion(model='adapter',messages=[serve.Message(role='user',content='synthetic test')])
        with patch.object(serve,'generate',side_effect=generate):
            caller=asyncio.create_task(serve.completion(body))
            await asyncio.to_thread(started.wait,1)
            caller.cancel()
            with self.assertRaises(asyncio.CancelledError):await caller
            self.assertTrue(serve.lock.locked())
            with self.assertRaises(HTTPException) as error:await serve.completion(body)
            self.assertEqual(error.exception.status_code,429)
            release.set()
            for _ in range(30):
                if not serve.lock.locked():break
                await asyncio.sleep(.01)
            self.assertFalse(serve.lock.locked())
        serve.state.clear()


if __name__=='__main__':unittest.main()
