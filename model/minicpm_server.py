"""
Local HTTP bridge so Lavande (Node/TS) can talk to MiniCPM5-1B.

Runs on http://127.0.0.1:8088 by default. One endpoint:

    POST /chat   { "messages": [...], "system": "...", "max_new_tokens": 512 }
         -> { "text": "...", "tokens": N, "elapsed_ms": M }

Lavande's minicpm provider posts to /chat. The MiniCPM prompt format
(tool-call syntax, few-shot examples) lives ENTIRELY on the Lavande side
in src/llm/providers/minicpm.ts — this server is just a dumb inference
backend and stays model-agnostic. That keeps prompt iteration fast: no
Python restart needed when you tweak the format.

Run:
    pip install -r requirements.txt
    python minicpm_server.py
"""

from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from typing import Any

import torch
import uvicorn
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_ID = os.environ.get("MINICPM_MODEL", "openbmb/MiniCPM5-1B")
HOST = os.environ.get("MINICPM_HOST", "127.0.0.1")
PORT = int(os.environ.get("MINICPM_PORT", "8088"))


def pick_device() -> tuple[str, torch.dtype]:
    if torch.cuda.is_available():
        return "cuda", torch.float16
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps", torch.float16
    return "cpu", torch.float32


state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    device, dtype = pick_device()
    print(f"[setup] device={device} dtype={dtype}")
    print(f"[setup] loading {MODEL_ID}...")
    t0 = time.time()
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, torch_dtype=dtype, trust_remote_code=True
    ).to(device)
    model.eval()
    state["tokenizer"] = tokenizer
    state["model"] = model
    state["device"] = device
    print(f"[setup] ready in {time.time() - t0:.1f}s on http://{HOST}:{PORT}")
    yield
    state.clear()


app = FastAPI(lifespan=lifespan)


class Message(BaseModel):
    role: str = Field(..., description="user | assistant | system")
    content: str


class ChatRequest(BaseModel):
    messages: list[Message]
    system: str | None = None
    max_new_tokens: int = 512
    temperature: float = 0.6
    top_p: float = 0.9
    # Stop generation when any of these strings appears. The Lavande
    # provider sets ["</tool_call>"] so we cut cleanly after a tool call.
    stop: list[str] | None = None


class ChatResponse(BaseModel):
    text: str
    tokens: int
    elapsed_ms: int


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "model": MODEL_ID, "device": state.get("device", "?")}


@app.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest) -> ChatResponse:
    tokenizer = state.get("tokenizer")
    model = state.get("model")
    device = state.get("device")
    if tokenizer is None or model is None:
        raise HTTPException(503, "model not ready")

    msgs: list[dict[str, str]] = []
    if req.system:
        msgs.append({"role": "system", "content": req.system})
    for m in req.messages:
        msgs.append({"role": m.role, "content": m.content})

    inputs = tokenizer.apply_chat_template(
        msgs,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt",
    ).to(device)

    t0 = time.time()
    with torch.inference_mode():
        outputs = model.generate(
            **inputs,
            max_new_tokens=req.max_new_tokens,
            do_sample=req.temperature > 0,
            temperature=max(req.temperature, 1e-5),
            top_p=req.top_p,
            repetition_penalty=1.05,
            pad_token_id=tokenizer.eos_token_id,
        )

    gen_ids = outputs[0][inputs["input_ids"].shape[-1]:]
    # Keep special tokens so we can see MiniCPM's tool-call control markers
    # (e.g. <|function_call|>). The Lavande provider parses them.
    text = tokenizer.decode(gen_ids, skip_special_tokens=False)

    # Loud server-side log so format issues are debuggable without poking the
    # client. Trim repr to keep the terminal usable on long generations.
    preview = text if len(text) < 600 else text[:600] + "...<truncated>"
    print(f"[gen] {len(gen_ids)} tok | raw={preview!r}")

    # Apply stop strings manually — generate() doesn't support arbitrary
    # multi-token stops reliably, so we truncate after decoding.
    if req.stop:
        cut = len(text)
        for s in req.stop:
            i = text.find(s)
            if i != -1:
                cut = min(cut, i + len(s))
        text = text[:cut]

    return ChatResponse(
        text=text.strip(),
        tokens=int(gen_ids.shape[0]),
        elapsed_ms=int((time.time() - t0) * 1000),
    )


if __name__ == "__main__":
    uvicorn.run("minicpm_server:app", host=HOST, port=PORT, reload=False)
