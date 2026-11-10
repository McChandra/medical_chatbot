"""Single-GPU, authenticated OpenAI-compatible text endpoint. No prompt logging.

Run one process/replica per model. TLS, service ingress and durable weights cache
belong to the hosting platform. Requires an operator-provided model and token.
"""
import asyncio
import hmac
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from model_settings import validate_base, validate_adapter

state = {}
lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app):
    import torch
    from transformers import AutoModelForCausalLM, AutoModelForImageTextToText, AutoTokenizer, AutoProcessor
    from peft import PeftModel
    model_id = os.environ["MODEL_ID"]
    if len(os.environ.get("INFERENCE_API_KEY", "")) < 32:
        raise RuntimeError("Set a random INFERENCE_API_KEY of at least 32 characters")
    if not torch.cuda.is_available():
        raise RuntimeError("A CUDA GPU is required for this serving profile")
    revision = os.environ.get("MODEL_REVISION")
    validate_base(model_id, revision)
    adapter = os.environ.get("ADAPTER_PATH")
    if adapter:
        validate_adapter(adapter, model_id, revision)
    kwargs = {"revision": revision, "token": os.environ.get("HF_TOKEN"), "trust_remote_code": False}
    medical = "medgemma" in model_id.lower()
    processor = (AutoProcessor if medical else AutoTokenizer).from_pretrained(model_id, **kwargs)
    model = (AutoModelForImageTextToText if medical else AutoModelForCausalLM).from_pretrained(
        model_id, torch_dtype=torch.bfloat16, device_map="auto", **kwargs)
    if adapter:
        model = PeftModel.from_pretrained(model, adapter)
    model.eval()
    text_config = getattr(model.config, "text_config", model.config)
    state.update(model=model, processor=processor, model_id=model_id, medical=medical,
                 context_tokens=text_config.max_position_embeddings)
    yield
    state.clear()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: str
    content: str = Field(max_length=65000)


class Completion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str
    messages: list[Message] = Field(min_length=1, max_length=4)
    max_tokens: int = Field(default=6000, ge=1, le=6000)
    temperature: float = Field(default=0, ge=0, le=0)
    stream: bool = False
    response_format: dict = Field(default_factory=lambda: {"type": "json_object"})


@app.middleware("http")
async def auth_and_size(request: Request, call_next):
    from fastapi.responses import JSONResponse
    if request.url.path != "/healthz":
        expected = "Bearer " + os.environ.get("INFERENCE_API_KEY", "")
        if not hmac.compare_digest(request.headers.get("authorization", ""), expected):
            return JSONResponse({"error": "Unauthorized"}, status_code=401)
        # Reject by streaming byte count before allocating an unbounded body.
        chunks, size = [], 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > 100000:
                return JSONResponse({"error": "Request too large"}, status_code=413)
            chunks.append(chunk)
        request._body = b"".join(chunks)
    return await call_next(request)


@app.get("/healthz")
async def health():
    if not state:
        raise HTTPException(503, "Loading")
    return {"ready": True}


def generate(body):
    import torch
    messages = [m.model_dump() for m in body.messages]
    # Gemma uses user/assistant turns; fold the system instruction into the first
    # user turn, without dropping it. The gateway owns all system instructions.
    if state["medical"] and messages[0]["role"] == "system":
        instruction = messages.pop(0)["content"]
        messages[0]["content"] = instruction + "\n\n" + messages[0]["content"]
    processor = state["processor"]
    if state["medical"]:
        messages = [{**m, "content": [{"type": "text", "text": m["content"]}]} for m in messages]
    inputs = processor.apply_chat_template(messages, tokenize=True, add_generation_prompt=True,
                                          return_dict=True, return_tensors="pt")
    prompt_length = inputs["input_ids"].shape[-1]
    if (prompt_length > int(os.environ.get("MAX_INPUT_TOKENS", str(state["context_tokens"])))
            or prompt_length + body.max_tokens > state["context_tokens"]):
        raise ValueError("Context too large")
    inputs = {k: v.to(state["model"].device) for k, v in inputs.items()}
    with torch.inference_mode():
        result = state["model"].generate(**inputs, max_new_tokens=body.max_tokens, do_sample=False)
    tokens = result[0, inputs["input_ids"].shape[-1]:]
    return processor.decode(tokens, skip_special_tokens=True), len(tokens) >= body.max_tokens


@app.post("/v1/chat/completions")
async def completion(body: Completion):
    if body.model != state["model_id"] or body.stream or any(m.role not in {"system", "user", "assistant"} for m in body.messages):
        raise HTTPException(400, "Unsupported model or request")
    if lock.locked():
        raise HTTPException(429, "Model busy")
    async with lock:
        try:
            text, truncated = await asyncio.to_thread(generate, body)
        except ValueError:
            raise HTTPException(413, "Context too large") from None
        except Exception:
            raise HTTPException(503, "Inference unavailable") from None
    return {"model": body.model, "choices": [{"message": {"role": "assistant", "content": text},
                                             "finish_reason": "length" if truncated else "stop"}]}
