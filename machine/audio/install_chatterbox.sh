#!/usr/bin/env bash
# One-time install of the Chatterbox voice (venv models/cbx + model files, ~3.5 GB).
# Needs network access to PyPI and HuggingFace (huggingface.co, us.aws.cdn.hf.co, cas-server.xethub.hf.co).
set -e
cd "$(dirname "$0")/.."
if [ ! -x models/cbx/bin/python ]; then python3 -m venv models/cbx; fi
models/cbx/bin/pip install -q --upgrade pip
models/cbx/bin/pip install -q chatterbox-tts "setuptools<80"
HF_HUB_DISABLE_XET=1 HF_HUB_DOWNLOAD_TIMEOUT=120 models/cbx/bin/python - <<'PY'
import time
from huggingface_hub import hf_hub_download
for f in ["ve.safetensors", "t3_cfg.safetensors", "s3gen.safetensors", "tokenizer.json", "conds.pt"]:
    for attempt in range(10):
        try:
            hf_hub_download("ResembleAI/chatterbox", f); print("ok", f); break
        except Exception as e:
            print("retry", f, attempt, str(e)[:100]); time.sleep(5)
    else:
        raise SystemExit(f"could not download {f}")
PY
echo "chatterbox ready"
