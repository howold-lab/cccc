#!/usr/bin/env python3
"""Minimal OpenAI-compatible image generation against AIMODELHUB.

Env:
  AIMODELHUB_API_KEY   required (never hard-code it)
  AIMODELHUB_BASE_URL  default https://aimodelhub-inet.kimstoo.com/v1

Usage:
  python3 scripts/aimodelhub_image.py models
  python3 scripts/aimodelhub_image.py image <model> "<prompt>" out.png [size]
"""
import base64
import json
import os
import sys
import urllib.request

BASE = os.environ.get("AIMODELHUB_BASE_URL", "https://aimodelhub-inet.kimstoo.com/v1").rstrip("/")
KEY = os.environ.get("AIMODELHUB_API_KEY")


def call(method, path, body=None, timeout=300):
    req = urllib.request.Request(
        BASE + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.load(resp)


def main():
    if not KEY:
        sys.exit("AIMODELHUB_API_KEY is not set")
    if sys.argv[1:2] == ["models"]:
        for m in call("GET", "/models")["data"]:
            print(m["id"])
        return
    if len(sys.argv) < 5 or sys.argv[1] != "image":
        sys.exit(__doc__)
    model, prompt, out = sys.argv[2:5]
    size = sys.argv[5] if len(sys.argv) > 5 else "1024x1024"
    body = {"model": model, "prompt": prompt, "n": 1, "size": size}
    data = call("POST", "/images/generations", body)["data"][0]
    if data.get("b64_json"):
        img = base64.b64decode(data["b64_json"])
    else:
        img = urllib.request.urlopen(data["url"], timeout=120).read()
    with open(out, "wb") as fh:
        fh.write(img)
    print(f"saved {out} ({len(img)} bytes)")


if __name__ == "__main__":
    main()
