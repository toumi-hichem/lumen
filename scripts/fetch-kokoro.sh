#!/usr/bin/env bash
# Download Kokoro on-device TTS assets into public/kokoro so the KokoroEngine
# can load them at runtime (web, Android, iOS all serve from the same
# bundled web assets). Mirrors fetch-supertonic.sh.
#
# Layout produced:
#   public/kokoro/onnx/model_fp16.onnx
#   public/kokoro/voices/{af_heart,af_bella,af_nicole,af_sarah,af_kore,
#                         am_michael,am_fenrir,am_puck,am_onyx,am_echo}.bin
#   public/kokoro/lexicon/{us_gold,us_silver}.json
set -euo pipefail

DEST="public/kokoro"
# Keep in sync with HF_BASE (src/tts/kokoro/assets.ts) and REMOTE_BASE
# (KokoroModelStore.java).
HF_REPO="https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main"
# Pinned commit: keep in sync with MISAKI_BASE (src/tts/kokoro/assets.ts).
MISAKI_COMMIT="fba1236595f2d2bf21d414ba6e57d25256afada3"
MISAKI_BASE="https://raw.githubusercontent.com/hexgrad/misaki/${MISAKI_COMMIT}/misaki/data"
VOICE_IDS=(af_heart af_bella af_nicole af_sarah af_kore am_michael am_fenrir am_puck am_onyx am_echo)

mkdir -p "$DEST/onnx" "$DEST/voices" "$DEST/lexicon"

echo "Fetching Kokoro model (~163MB)..."
curl -fL "$HF_REPO/onnx/model_fp16.onnx" -o "$DEST/onnx/model_fp16.onnx"

echo "Fetching voice packs..."
for id in "${VOICE_IDS[@]}"; do
  curl -fL "$HF_REPO/voices/${id}.bin" -o "$DEST/voices/${id}.bin"
done

echo "Fetching Misaki English lexicons (Apache-2.0)..."
curl -fL "$MISAKI_BASE/us_gold.json" -o "$DEST/lexicon/us_gold.json"
curl -fL "$MISAKI_BASE/us_silver.json" -o "$DEST/lexicon/us_silver.json"

echo "Done. Assets in $DEST"
