#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# build-assets.sh — Convert Guit95 CD assets for web delivery.
# Usage: bash scripts/build-assets.sh [slug ...]
#   slug defaults to "heyjoe" if no arguments supplied.
# ---------------------------------------------------------------------------

FFMPEG=/opt/homebrew/bin/ffmpeg
CD_ROOT=/Volumes/Guitar
VIDEO_SRC="$CD_ROOT/VIDEO"
GUITAR_SRC="$CD_ROOT/GUITAR"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_ASSETS="$SCRIPT_DIR/../public/assets"
mkdir -p "$PUBLIC_ASSETS"
PUBLIC_ASSETS="$(cd "$PUBLIC_ASSETS" && pwd)"

SLUGS=("${@:-heyjoe}")

START_TIME=$SECONDS

# ── Sanity checks ─────────────────────────────────────────────────────────────
if [[ ! -d "$CD_ROOT" ]]; then
  echo "ERROR: CD not found at $CD_ROOT — mount the Guitar CD and retry." >&2
  exit 1
fi

if [[ ! -x "$FFMPEG" ]]; then
  echo "ERROR: ffmpeg not found at $FFMPEG" >&2
  echo "  Install with: brew install ffmpeg" >&2
  exit 1
fi

# ── Helper: lowercase a string ────────────────────────────────────────────────
lc() { echo "$1" | tr '[:upper:]' '[:lower:]'; }

# ── Per-slug processing ───────────────────────────────────────────────────────
for SLUG in "${SLUGS[@]}"; do
  case "$SLUG" in
    heyjoe)
      AVI_SRC="$VIDEO_SRC/HJOE.AVI"
      GUITAR_DIR="$GUITAR_SRC/HEYJOE"
      ;;
    *)
      echo "WARNING: Unknown slug '$SLUG' — skipping." >&2
      continue
      ;;
  esac

  DEST="$PUBLIC_ASSETS/$SLUG"
  mkdir -p "$DEST"

  # ── 1. Video conversion ────────────────────────────────────────────────────
  MP4_DST="$DEST/hjoe.mp4"
  echo "==> $SLUG: video"
  if [[ -f "$MP4_DST" && "$MP4_DST" -nt "$AVI_SRC" ]]; then
    echo "    (skipped — $MP4_DST is up-to-date)"
  else
    "$FFMPEG" -y -i "$AVI_SRC" \
      -c:v libx264 -preset slow -crf 22 \
      -c:a aac -b:a 128k \
      -movflags +faststart \
      "$MP4_DST"
    echo "    -> $MP4_DST"
  fi

  # ── 2. Raw data (HEYJOE/ subtree → raw/, lowercased) ─────────────────────
  echo "==> $SLUG: data"
  RAW_DEST="$DEST/raw"
  mkdir -p "$RAW_DEST"

  # Use find + install to copy with lowercased names.
  # We recreate the directory tree first, then copy files.
  find "$GUITAR_DIR" -type d | while IFS= read -r DIR; do
    REL="${DIR#"$GUITAR_DIR"}"
    LC_REL=$(lc "$REL")
    mkdir -p "$RAW_DEST$LC_REL"
  done

  find "$GUITAR_DIR" -type f | while IFS= read -r FILE; do
    REL="${FILE#"$GUITAR_DIR"}"
    LC_REL=$(lc "$REL")
    DST_FILE="$RAW_DEST$LC_REL"
    if [[ ! -f "$DST_FILE" || "$DST_FILE" -ot "$FILE" ]]; then
      cp "$FILE" "$DST_FILE"
    fi
  done

  echo "    -> $RAW_DEST"

done

ELAPSED=$(( SECONDS - START_TIME ))
echo "==> done in ${ELAPSED}s"
