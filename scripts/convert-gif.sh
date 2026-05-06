#!/usr/bin/env bash
set -euo pipefail
IN="scripts/.demo-video/demo.webm"
OUT="docs/demo.gif"
mkdir -p docs
PALETTE=$(mktemp -t palette).png
# Skip the first 2.5s where the page is still painting.
ffmpeg -y -ss 2.5 -i "$IN" -vf "fps=12,scale=900:-1:flags=lanczos,palettegen" "$PALETTE" >/dev/null 2>&1
ffmpeg -y -ss 2.5 -i "$IN" -i "$PALETTE" -lavfi "fps=12,scale=900:-1:flags=lanczos [x]; [x][1:v] paletteuse" "$OUT" >/dev/null 2>&1
echo "Wrote $OUT ($(du -h "$OUT" | cut -f1))"
