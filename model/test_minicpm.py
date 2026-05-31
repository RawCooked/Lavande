"""
Standalone test for MiniCPM5-1B on your local machine.

Run once to verify the model loads, generates, and responds sensibly.
Auto-detects CUDA -> MPS -> CPU. First run downloads ~2 GB of weights
from Hugging Face to ~/.cache/huggingface.

Usage:
    pip install -r requirements.txt
    python test_minicpm.py
    # then type messages, Ctrl-C to quit
"""

from __future__ import annotations

import sys
import time

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_ID = "openbmb/MiniCPM5-1B"


def pick_device() -> tuple[str, torch.dtype]:
    if torch.cuda.is_available():
        return "cuda", torch.float16
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps", torch.float16
    return "cpu", torch.float32


def main() -> None:
    device, dtype = pick_device()
    print(f"[setup] device={device} dtype={dtype}")
    print(f"[setup] loading {MODEL_ID} (first run downloads ~2 GB)...")
    t0 = time.time()

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=dtype,
        trust_remote_code=True,
    ).to(device)
    model.eval()

    print(f"[setup] loaded in {time.time() - t0:.1f}s. Type a message, Ctrl-C to quit.\n")

    history: list[dict[str, str]] = []

    while True:
        try:
            user = input("you > ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not user:
            continue

        history.append({"role": "user", "content": user})

        inputs = tokenizer.apply_chat_template(
            history,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        ).to(device)

        t_gen = time.time()
        with torch.inference_mode():
            outputs = model.generate(
                **inputs,
                max_new_tokens=256,
                do_sample=True,
                temperature=0.7,
                top_p=0.9,
                repetition_penalty=1.05,
                pad_token_id=tokenizer.eos_token_id,
            )

        gen_ids = outputs[0][inputs["input_ids"].shape[-1]:]
        reply = tokenizer.decode(gen_ids, skip_special_tokens=True).strip()
        history.append({"role": "assistant", "content": reply})

        dt = time.time() - t_gen
        tok_per_s = len(gen_ids) / dt if dt > 0 else 0.0
        print(f"bot > {reply}")
        print(f"      [{len(gen_ids)} tok in {dt:.1f}s, {tok_per_s:.1f} tok/s]\n")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[error] {type(exc).__name__}: {exc}", file=sys.stderr)
        sys.exit(1)
