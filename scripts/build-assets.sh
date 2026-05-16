#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# build-assets.sh — Convert Guit95 CD assets for web delivery.
# Usage: bash scripts/build-assets.sh [slug ...]
#   slug defaults to all 7 songs if no arguments supplied.
# ---------------------------------------------------------------------------

FFMPEG=/opt/homebrew/bin/ffmpeg
CD_ROOT=/Volumes/Guitar
VIDEO_SRC="$CD_ROOT/VIDEO"
GUITAR_SRC="$CD_ROOT/GUITAR"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_ASSETS="$SCRIPT_DIR/../public/assets"
mkdir -p "$PUBLIC_ASSETS"
PUBLIC_ASSETS="$(cd "$PUBLIC_ASSETS" && pwd)"

# All 7 songs: slug:FOLDER:VIDEO_STEM:EXERCISE_COUNT
SONG_DEFS=(
  "heyjoe:HEYJOE:HJOE:16"
  "life:LIFE:LBTD:7"
  "woman:WOMAN:NWNC:13"
  "blowin:BLOWIN:BITW:7"
  "dust:DUST:DITW:9"
  "sweet:SWEET:SHA:12"
  "wild:WILD:WW:10"
)

ALL_SLUGS=()
for DEF in "${SONG_DEFS[@]}"; do
  IFS=':' read -r S _ _ _ <<< "$DEF"
  ALL_SLUGS+=("$S")
done

# Use args if provided, otherwise all 7
SLUGS=("${@:-${ALL_SLUGS[@]}}")

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

# ── Helper: lookup song definition by slug ────────────────────────────────────
get_song_def() {
  local target="$1"
  for DEF in "${SONG_DEFS[@]}"; do
    IFS=':' read -r S _ _ _ <<< "$DEF"
    if [[ "$S" == "$target" ]]; then
      echo "$DEF"
      return 0
    fi
  done
  return 1
}

# ── Per-slug processing ───────────────────────────────────────────────────────
for SLUG in "${SLUGS[@]}"; do
  DEF=$(get_song_def "$SLUG") || {
    echo "WARNING: Unknown slug '$SLUG' — skipping." >&2
    continue
  }

  IFS=':' read -r slug FOLDER VIDEO_STEM EX_COUNT <<< "$DEF"
  AVI_SRC="$VIDEO_SRC/${VIDEO_STEM}.AVI"
  GUITAR_DIR="$GUITAR_SRC/$FOLDER"

  DEST="$PUBLIC_ASSETS/$SLUG"
  mkdir -p "$DEST"

  # ── 1. Video conversion: AVI → slug.mp4 ──────────────────────────────────
  MP4_DST="$DEST/${SLUG}.mp4"
  echo "==> $SLUG: video"
  if [[ -f "$MP4_DST" && "$MP4_DST" -nt "$AVI_SRC" ]]; then
    echo "    (skipped — ${SLUG}.mp4 is up-to-date)"
  else
    "$FFMPEG" -y -i "$AVI_SRC" \
      -c:v libx264 -preset slow -crf 22 \
      -c:a aac -b:a 128k \
      -movflags +faststart \
      "$MP4_DST"
    echo "    -> $MP4_DST"
  fi

  # ── 2. Raw data (FOLDER/ subtree → raw/, lowercased) ─────────────────────
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

  # ── 3. BMP → PNG conversion for chord sprite sheet ────────────────────────
  CHORDS_RAW="$RAW_DEST/chords"
  if [[ -d "$CHORDS_RAW" ]]; then
    echo "==> $SLUG: bmp→png (chords)"
    for BMP in "$CHORDS_RAW"/*.bmp; do
      [[ -f "$BMP" ]] || continue
      PNG="${BMP%.bmp}.png"
      if [[ ! -f "$PNG" || "$PNG" -ot "$BMP" ]]; then
        /usr/bin/sips -s format png "$BMP" --out "$PNG" >/dev/null 2>&1 || {
          echo "    WARNING: sips failed for $(basename "$BMP") — skipping"
          continue
        }
        echo "    converted: $(basename "$BMP") → $(basename "$PNG")"
      else
        echo "    (skipped — $(basename "$PNG") up-to-date)"
      fi
    done
  fi

  # ── 4. BMP → PNG conversion for tab strip ──────────────────────────────────
  PLAY_RAW="$RAW_DEST/play"
  if [[ -d "$PLAY_RAW" ]]; then
    echo "==> $SLUG: bmp→png (tab strip)"
    for BMP in "$PLAY_RAW"/*.bmp; do
      [[ -f "$BMP" ]] || continue
      PNG="${BMP%.bmp}.png"
      if [[ ! -f "$PNG" || "$PNG" -ot "$BMP" ]]; then
        /usr/bin/sips -s format png "$BMP" --out "$PNG" >/dev/null 2>&1 || {
          echo "    WARNING: sips failed for $(basename "$BMP") — skipping"
          continue
        }
        SIZE=$(du -k "$PNG" 2>/dev/null | cut -f1 || echo "?")
        echo "    converted: $(basename "$BMP") → $(basename "$PNG") (${SIZE} KB)"
      else
        SIZE=$(du -k "$PNG" 2>/dev/null | cut -f1 || echo "?")
        echo "    (skipped — $(basename "$PNG") up-to-date, ${SIZE} KB)"
      fi
    done
  fi

  # ── 5. Exercise videos: AVI → MP4 ────────────────────────────────────────
  EXERCICE_RAW="$RAW_DEST/exercice"
  if [[ -d "$EXERCICE_RAW" ]]; then
    echo "==> $SLUG: exercise videos (AVI → MP4)"
    for N in $(seq 1 "$EX_COUNT"); do
      EX_DIR="$EXERCICE_RAW/$N"
      [[ -d "$EX_DIR" ]] || continue
      for AVI in "$EX_DIR"/*.avi; do
        [[ -f "$AVI" ]] || continue
        MP4="${AVI%.avi}.mp4"
        if [[ -f "$MP4" && "$MP4" -nt "$AVI" ]]; then
          echo "    (skipped — $(basename "$MP4") up-to-date)"
        else
          echo "    encoding: $(basename "$AVI") → $(basename "$MP4")"
          "$FFMPEG" -y -i "$AVI" \
            -c:v libx264 -preset slow -crf 22 \
            -c:a aac -b:a 128k \
            -movflags +faststart \
            "$MP4" 2>/dev/null
          echo "    -> $(basename "$MP4")"
        fi
      done
    done
  fi

  # ── 6. Exercise tab BMPs → PNG ────────────────────────────────────────────
  if [[ -d "$EXERCICE_RAW" ]]; then
    echo "==> $SLUG: exercise tab images (BMP → PNG)"
    for N in $(seq 1 "$EX_COUNT"); do
      EX_DIR="$EXERCICE_RAW/$N"
      [[ -d "$EX_DIR" ]] || continue
      for BMP in "$EX_DIR"/sco*.bmp; do
        [[ -f "$BMP" ]] || continue
        PNG="${BMP%.bmp}.png"
        if [[ -f "$PNG" && "$PNG" -nt "$BMP" ]]; then
          echo "    (skipped — $(basename "$PNG") up-to-date)"
        else
          /usr/bin/sips -s format png "$BMP" --out "$PNG" >/dev/null 2>&1 || {
            echo "    WARNING: sips failed for $(basename "$BMP") — skipping"
            continue
          }
          echo "    converted: $(basename "$BMP") → $(basename "$PNG")"
        fi
      done
    done
  fi

done

ELAPSED=$(( SECONDS - START_TIME ))
echo "==> done in ${ELAPSED}s"
