"""Single-GPU, authenticated OpenAI-compatible text endpoint. No prompt logging.

Run one process/replica per model. TLS, service ingress and durable weights cache
belong to the hosting platform. Requires an operator-provided model and token.
"""
import asyncio
import hmac
import os
from contextlib import nullcontext
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from model_settings import validate_base, validate_adapter
from structured_output import schema_from_format, prefix_function, validate_output, prepare_tokenizer_data

state = {}
lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app):
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    from peft import PeftModel
    model_id = os.environ["MODEL_ID"]
    if len(os.environ.get("INFERENCE_API_KEY", "")) < 32:
        raise RuntimeError("Set a random INFERENCE_API_KEY of at least 32 characters")
    if not torch.cuda.is_available():
        raise RuntimeError("A CUDA GPU is required for this serving profile")
    revision = os.environ.get("MODEL_REVISION")
    validate_base(model_id, revision)
    adapter = os.environ.get("ADAPTER_PATH")
    manifest = validate_adapter(adapter, model_id, revision) if adapter else {}
    research_only = bool(adapter) and manifest.get("clinical_release_approved") is not True
    if research_only and os.environ.get("ALLOW_RESEARCH_ADAPTER") != "1":
        raise RuntimeError("This unreviewed adapter requires explicit ALLOW_RESEARCH_ADAPTER=1 on a private research host")
    kwargs = {"revision": revision, "token": os.environ.get("HF_TOKEN"), "trust_remote_code": False}
    medical = "medgemma" in model_id.lower()
    if medical:
        from transformers import AutoModelForImageTextToText, AutoProcessor
    dtype = torch.bfloat16 if torch.cuda.get_device_capability()[0] >= 8 and torch.cuda.is_bf16_supported() else torch.float16
    quant = BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type="nf4",bnb_4bit_use_double_quant=True,
                              bnb_4bit_compute_dtype=dtype) if os.environ.get("LOAD_IN_4BIT") == "1" else None
    processor = (AutoProcessor if medical else AutoTokenizer).from_pretrained(model_id, **kwargs)
    model = (AutoModelForImageTextToText if medical else AutoModelForCausalLM).from_pretrained(
        model_id, torch_dtype=dtype, quantization_config=quant, device_map={"":0}, **kwargs)
    if adapter:
        model = PeftModel.from_pretrained(model, adapter)
    model.eval()
    # Cache vocabulary indexing during startup; each request gets a fresh parser.
    prepare_tokenizer_data(processor.tokenizer if medical else processor)
    text_config = getattr(model.config, "text_config", model.config)
    served_id = os.environ.get("SERVED_MODEL_ID",model_id)
    base_alias = os.environ.get("BASE_MODEL_ALIAS") if adapter else None
    if base_alias == served_id:
        raise RuntimeError("Base reviewer and adapter aliases must differ")
    state.update(model=model, processor=processor, model_id=served_id, medical=medical,
                 base_alias=base_alias, research_only=research_only,
                 context_tokens=text_config.max_position_embeddings)
    yield
    state.clear()


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: str
    content: str = Field(min_length=1,max_length=65000)


class Completion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str
    messages: list[Message] = Field(min_length=1, max_length=4)
    max_tokens: int = Field(default=2048, ge=1, le=6000)
    temperature: float = Field(default=0, ge=0, le=0)
    stream: bool = False
    response_format: dict = Field(default_factory=lambda: {"type": "json_object"})


@app.middleware("http")
async def auth_and_size(request: Request, call_next):
    from fastapi.responses import JSONResponse
    if request.url.path != "/healthz":
        key = os.environ.get("INFERENCE_API_KEY", "")
        expected = "Bearer " + key
        if len(key) < 32 or not hmac.compare_digest(request.headers.get("authorization", ""), expected):
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
    return {"ready": True, "busy": lock.locked()}


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
    use_base = body.model == state.get("base_alias")
    adapter_context = state["model"].disable_adapter() if use_base else nullcontext()
    schema = schema_from_format(body.response_format)
    generation_options = {"prefix_allowed_tokens_fn": prefix_function(processor.tokenizer if state["medical"] else processor, schema)} if schema else {}
    with adapter_context, torch.inference_mode():
        result = state["model"].generate(**inputs, max_new_tokens=body.max_tokens, do_sample=False,
                                       pad_token_id=processor.tokenizer.eos_token_id if state["medical"] else processor.eos_token_id, **generation_options)
    tokens = result[0, inputs["input_ids"].shape[-1]:]
    text = processor.decode(tokens, skip_special_tokens=True)
    truncated = len(tokens) >= body.max_tokens
    if not truncated:
        try:
            validate_output(text, schema)
        except Exception as exc:
            raise RuntimeError("Generated output failed schema validation") from exc
    return text, truncated


@app.post("/v1/chat/completions")
async def completion(body: Completion):
    if not state:
        raise HTTPException(503,"Model loading")
    allowed = {state["model_id"]}
    if state.get("base_alias"):
        allowed.add(state["base_alias"])
    try:
        schema_from_format(body.response_format)
    except Exception:
        raise HTTPException(400,"Unsupported or invalid response schema") from None
    if (body.model not in allowed or body.stream
            or any(m.role not in {"system","user","assistant"} for m in body.messages)
            or (state["medical"] and len(body.messages)==1 and body.messages[0].role=="system")):
        raise HTTPException(400,"Unsupported model or request")
    if lock.locked():
        raise HTTPException(429,"Model busy")
    await lock.acquire()
    # A disconnected client must not release the GPU while its worker is still
    # generating (especially while the PEFT adapter is disabled for review).
    task = asyncio.create_task(asyncio.to_thread(generate,body))
    def finished(done):
        lock.release()
        if not done.cancelled():
            done.exception()
    task.add_done_callback(finished)
    try:
        text,truncated = await asyncio.shield(task)
    except ValueError:
        raise HTTPException(413,"Context too large") from None
    except Exception:
        raise HTTPException(503,"Inference unavailable") from None
    return {"model":body.model,"research_only":state.get("research_only",False),
            "choices":[{"message":{"role":"assistant","content":text},
                        "finish_reason":"length" if truncated else "stop"}]}
