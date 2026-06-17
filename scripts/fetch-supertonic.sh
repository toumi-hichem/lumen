#!/usr/bin/env bash
# Download Supertonic on-device TTS assets into public/supertonic so the
# SupertonicEngine can load them at runtime (web, Android, iOS all serve from
# the same bundled web assets). Requires git with LFS support.
#
# Layout produced:
#   public/supertonic/onnx/{duration_predictor,text_encoder,vector_estimator,vocoder}.onnx
#   public/supertonic/onnx/{tts.json,unicode_indexer.json}
#   public/supertonic/voice_styles/{M1..M5,F1..F5}.json
set -euo pipefail

DEST="public/supertonic"
TMP="$(mktemp -d)"
REPO="https://huggingface.co/Supertone/supertonic"

echo "Cloning Supertonic assets (this downloads ~100MB of models)..."
git clone --depth 1 "$REPO" "$TMP/supertonic"

mkdir -p "$DEST/onnx" "$DEST/voice_styles"

# The repo serves onnx/ and voice_styles/ at its root.
cp -rv "$TMP"/supertonic/onnx/* "$DEST/onnx/" 2>/dev/null || true
cp -rv "$TMP"/supertonic/voice_styles/* "$DEST/voice_styles/" 2>/dev/null || true

echo "Done. Assets in $DEST"
echo "If files are missing, inspect $TMP/supertonic and adjust paths above."
