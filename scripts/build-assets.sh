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

JINGLES_SRC="$GUITAR_SRC/TITLE"
JINGLES_DEST="$PUBLIC_ASSETS/jingles"

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

# ── Jingles: copy JGL-*.WAV from CD (runs regardless of slug args) ───────────
echo "==> jingles"
mkdir -p "$JINGLES_DEST"
for WAV in "$JINGLES_SRC"/JGL-*.WAV; do
  [[ -f "$WAV" ]] || continue
  BASE=$(basename "$WAV")
  LC_BASE=$(lc "$BASE")
  DST="$JINGLES_DEST/$LC_BASE"
  if [[ ! -f "$DST" || "$DST" -ot "$WAV" ]]; then
    cp "$WAV" "$DST"
    echo "    copied: $BASE -> $LC_BASE"
  else
    echo "    (skipped — $LC_BASE up-to-date)"
  fi
done

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

# ── Words BMP → PNG (disc 1) — ensures reproducibility ─────────────────────
for SLUG in "${SLUGS[@]}"; do
  DEF=$(get_song_def "$SLUG") || continue
  IFS=':' read -r slug _ _ _ <<< "$DEF"
  WORDS_RAW="$PUBLIC_ASSETS/$slug/raw/words"
  [[ -d "$WORDS_RAW" ]] || continue
  echo "==> $slug: bmp→png (words)"
  for BMP in "$WORDS_RAW"/*.bmp; do
    [[ -f "$BMP" ]] || continue
    PNG="${BMP%.bmp}.png"
    if [[ ! -f "$PNG" || "$PNG" -ot "$BMP" ]]; then
      /usr/bin/sips -s format png "$BMP" --out "$PNG" >/dev/null 2>&1 || {
        echo "    WARNING: sips failed for $(basename "$BMP") — skipping"; continue
      }
      echo "    converted: $(basename "$BMP") → $(basename "$PNG")"
    else
      echo "    (skipped — $(basename "$PNG") up-to-date)"
    fi
  done
done

# ── Guitar Hits Vol. 2 — The Beatles (Guitar2.ISO) ───────────────────────────
CD2_ROOT=/Volumes/Guitar2
GUITAR2_SRC="$CD2_ROOT/GUITAR2"

# slug:FOLDER:VIDEO_STEM:EX_COUNT:EXR_PREFIX
# EXR_PREFIX = first letter of the song's EXR filename (e.g. 'm' for M-EX1.EXR)
SONG_DEFS_2=(
  "michelle:MICHELLE:MICHELLE:6:m"
  "yesterday:YESTERD:YESTERD:9:y"
  "letitbe:LET:LET:15:l"
  "norwegian:NORWEGIA:NOR:14:n"
  "gottaget:GOT:GOT:5:g"
  "universe:UNIVERSE:UNIVER:9:u"
  "blackbird:BLACK:BLACK:6:b"
)

if [[ ! -d "$CD2_ROOT" ]]; then
  echo "==> Guitar2 CD not found at $CD2_ROOT — skipping disc 2 (mount Guitar2.ISO to build Beatles songs)"
else
  echo "==> Guitar Hits Vol. 2 — The Beatles"

  # Jingles: MENU/J-<letter>.WAV (J-M.WAV, J-Y.WAV, ...)
  echo "==> disc2: jingles"
  for WAV in "$GUITAR2_SRC/MENU"/J-*.WAV; do
    [[ -f "$WAV" ]] || continue
    BASE=$(basename "$WAV")
    LC_BASE=$(lc "$BASE")
    DST="$JINGLES_DEST/$LC_BASE"
    if [[ ! -f "$DST" || "$DST" -ot "$WAV" ]]; then
      cp "$WAV" "$DST"
      echo "    copied: $BASE -> $LC_BASE"
    else
      echo "    (skipped — $LC_BASE up-to-date)"
    fi
  done

  for DEF2 in "${SONG_DEFS_2[@]}"; do
    IFS=':' read -r slug2 FOLDER2 VIDEO_STEM2 EX_COUNT2 EXR_PREFIX2 <<< "$DEF2"

    GUITAR_DIR2="$GUITAR2_SRC/$FOLDER2"
    AVI_SRC2="$GUITAR_DIR2/MUSIC/${VIDEO_STEM2}.AVI"
    DEST2="$PUBLIC_ASSETS/$slug2"
    mkdir -p "$DEST2"

    # ── 1. Main video: AVI (inside MUSIC/) → slug.mp4 ──────────────────────
    MP4_DST2="$DEST2/${slug2}.mp4"
    echo "==> $slug2: video"
    if [[ -f "$MP4_DST2" && "$MP4_DST2" -nt "$AVI_SRC2" ]]; then
      echo "    (skipped — ${slug2}.mp4 is up-to-date)"
    else
      "$FFMPEG" -y -i "$AVI_SRC2" \
        -c:v libx264 -preset slow -crf 22 \
        -c:a aac -b:a 128k \
        -movflags +faststart \
        "$MP4_DST2"
      echo "    -> $MP4_DST2"
    fi

    # ── 2. Raw data: copy entire FOLDER/ subtree, lowercased ────────────────
    echo "==> $slug2: data"
    RAW_DEST2="$DEST2/raw"
    mkdir -p "$RAW_DEST2"
    find "$GUITAR_DIR2" -type d | while IFS= read -r DIR; do
      REL="${DIR#"$GUITAR_DIR2"}"
      mkdir -p "$RAW_DEST2$(lc "$REL")"
    done
    find "$GUITAR_DIR2" -type f | while IFS= read -r FILE; do
      REL="${FILE#"$GUITAR_DIR2"}"
      DST_FILE="$RAW_DEST2$(lc "$REL")"
      if [[ ! -f "$DST_FILE" || "$DST_FILE" -ot "$FILE" ]]; then
        cp "$FILE" "$DST_FILE"
      fi
    done
    echo "    -> $RAW_DEST2"

    # ── 3. BMP → PNG: chords/ ───────────────────────────────────────────────
    CHORDS_RAW2="$RAW_DEST2/chords"
    if [[ -d "$CHORDS_RAW2" ]]; then
      echo "==> $slug2: bmp→png (chords)"
      for BMP in "$CHORDS_RAW2"/*.bmp; do
        [[ -f "$BMP" ]] || continue
        PNG="${BMP%.bmp}.png"
        if [[ ! -f "$PNG" || "$PNG" -ot "$BMP" ]]; then
          /usr/bin/sips -s format png "$BMP" --out "$PNG" >/dev/null 2>&1 || {
            echo "    WARNING: sips failed for $(basename "$BMP") — skipping"; continue
          }
          echo "    converted: $(basename "$BMP") → $(basename "$PNG")"
        else
          echo "    (skipped — $(basename "$PNG") up-to-date)"
        fi
      done
    fi

    # ── 4. BMP → PNG: music/ (disc 2 uses MUSIC/ not PLAY/) ────────────────
    MUSIC_RAW2="$RAW_DEST2/music"
    if [[ -d "$MUSIC_RAW2" ]]; then
      echo "==> $slug2: bmp→png (music / tab strip)"
      for BMP in "$MUSIC_RAW2"/*.bmp; do
        [[ -f "$BMP" ]] || continue
        PNG="${BMP%.bmp}.png"
        if [[ ! -f "$PNG" || "$PNG" -ot "$BMP" ]]; then
          /usr/bin/sips -s format png "$BMP" --out "$PNG" >/dev/null 2>&1 || {
            echo "    WARNING: sips failed for $(basename "$BMP") — skipping"; continue
          }
          SIZE=$(du -k "$PNG" 2>/dev/null | cut -f1 || echo "?")
          echo "    converted: $(basename "$BMP") → $(basename "$PNG") (${SIZE} KB)"
        else
          SIZE=$(du -k "$PNG" 2>/dev/null | cut -f1 || echo "?")
          echo "    (skipped — $(basename "$PNG") up-to-date, ${SIZE} KB)"
        fi
      done
    fi

    # ── 4b. BMP → PNG: words/ (single page on disc 2) ──────────────────────
    WORDS_RAW2="$RAW_DEST2/words"
    if [[ -d "$WORDS_RAW2" ]]; then
      echo "==> $slug2: bmp→png (words)"
      for BMP in "$WORDS_RAW2"/*.bmp; do
        [[ -f "$BMP" ]] || continue
        PNG="${BMP%.bmp}.png"
        if [[ ! -f "$PNG" || "$PNG" -ot "$BMP" ]]; then
          /usr/bin/sips -s format png "$BMP" --out "$PNG" >/dev/null 2>&1 || {
            echo "    WARNING: sips failed for $(basename "$BMP") — skipping"; continue
          }
          echo "    converted: $(basename "$BMP") → $(basename "$PNG")"
        else
          echo "    (skipped — $(basename "$PNG") up-to-date)"
        fi
      done
    fi

    # ── 4c. Exercise folder un-pad: 01..09 → 1..9 ──────────────────────────
    # Songs with ≥10 exercises (letitbe=15, norwegian=14) have zero-padded
    # folder names on CD. App expects unpadded numbering ("exercice/1/"...).
    # Idempotent: on re-runs the raw-copy step recreates "01/" from CD, so
    # if "1/" also exists (carries our MP4 + renamed EXR), drop the padded
    # duplicate. Otherwise rename.
    EXERCICE_RAW2="$RAW_DEST2/exercice"
    if [[ -d "$EXERCICE_RAW2" ]]; then
      for N in 1 2 3 4 5 6 7 8 9; do
        ZPAD=$(printf "%02d" "$N")
        SRC="$EXERCICE_RAW2/$ZPAD"
        DST="$EXERCICE_RAW2/$N"
        if [[ -d "$SRC" ]]; then
          if [[ -d "$DST" ]]; then
            rm -rf "$SRC"
            echo "    dropped duplicate: $ZPAD (kept unpadded $N)"
          else
            mv "$SRC" "$DST"
            echo "    unpadded: $ZPAD → $N"
          fi
        fi
      done
    fi

    # ── 5. Exercise videos: AVI → MP4 ───────────────────────────────────────
    if [[ -d "$EXERCICE_RAW2" ]]; then
      echo "==> $slug2: exercise videos (AVI → MP4)"
      for N in $(seq 1 "$EX_COUNT2"); do
        EX_DIR2="$EXERCICE_RAW2/$N"
        [[ -d "$EX_DIR2" ]] || continue
        for AVI in "$EX_DIR2"/*.avi; do
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

    # ── 6. EXR rename: <prefix>-ex<N>.exr → ex<N>.exr ──────────────────────
    # Disc 2 EXR files are named e.g. m-ex1.exr; parser expects ex1.exr.
    if [[ -d "$EXERCICE_RAW2" ]]; then
      echo "==> $slug2: EXR rename (${EXR_PREFIX2}-exN.exr → exN.exr)"
      for N in $(seq 1 "$EX_COUNT2"); do
        EX_DIR2="$EXERCICE_RAW2/$N"
        [[ -d "$EX_DIR2" ]] || continue
        SRC_EXR="$EX_DIR2/${EXR_PREFIX2}-ex${N}.exr"
        DST_EXR="$EX_DIR2/ex${N}.exr"
        if [[ -f "$SRC_EXR" && ! -f "$DST_EXR" ]]; then
          cp "$SRC_EXR" "$DST_EXR"
          echo "    renamed: $(basename "$SRC_EXR") → $(basename "$DST_EXR")"
        fi
      done
    fi

  done
fi

ELAPSED=$(( SECONDS - START_TIME ))
echo "==> done in ${ELAPSED}s"
