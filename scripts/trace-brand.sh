#!/usr/bin/env bash
# Re-trace the wordmark and lockup from the master artwork in brand-assets/ (needs ffmpeg + potrace).
# Output SVGs land in $OUT; apps/web/app/_components/brand/Wordmark.tsx embeds their paths and bboxes.
set -euo pipefail
OUT=${OUT:-/tmp/marque-trace}; mkdir -p "$OUT"; cd "$(dirname "$0")/.."
ffmpeg -y -loglevel error -i "brand-assets/Marque dark logo text only on light theme.png" \
  -vf "crop=960:260:250:420,scale=3840:-1:flags=lanczos,format=gray" -c:v pgm "$OUT/wordmark.pgm"
ffmpeg -y -loglevel error -i "brand-assets/Marque  dark logo design and logo text on light theme.png" \
  -vf "crop=940:220:255:415,scale=3760:-1:flags=lanczos,format=gray" -c:v pgm "$OUT/lockup.pgm"
for n in wordmark lockup; do potrace "$OUT/$n.pgm" -s -k 0.5 -t 20 -a 1.0 -O 0.4 -o "$OUT/$n.svg"; done
echo "traced to $OUT"
