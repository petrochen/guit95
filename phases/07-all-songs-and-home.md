# Phase 7 — All 7 Songs + Home Screen + Hash Router

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> This phase generalises the app from "Hey Joe only" to all 7 songs of
> the original CD, with a home screen song picker and hash-based
> routing.

## Context

Personal-use web app for learning guitar. Stack: Vite + TypeScript +
vanilla DOM. Working directory: `/Users/apetrochenko/src/guitar/`.

Read in order:
1. `../SPEC.md` — original CD data formats. §2.1 (per-song
   inventory), §3.3 (CHD), §3.4 (SCO), §6 (content map).
2. `../ROADMAP.md` — overall plan; you're doing Phase 7.
3. Prior phase specs `00`..`04e`.

State recap:
- The app currently hard-codes Hey Joe everywhere — paths in `main.ts`
  start with `/assets/heyjoe/raw/...`, asset pipeline only converts
  Hey Joe video and exercise videos.
- All Phase 4 features (NOW/NEXT, exercise pane, hotspots, dropdown,
  exercise renumbering) are stable.
- Phases 5 (tuner) and 6 (metronome) are deferred — not part of this
  phase.

## Goal of Phase 7

After this phase, the user opens `localhost:5173/` and sees a home
screen listing 7 songs as cards. Clicking a card opens that song's
player (which has the same UX as Hey Joe today). A "← Back to library"
button on the player returns to home. Routing is via `location.hash`
so reload preserves position.

## Per-song metadata (you don't need to investigate — given here)

| Slug      | Title                  | Artist               | Source folder | Source video | SCO file          | Score BMP        | Exercises (folders) |
| --------- | ---------------------- | -------------------- | ------------- | ------------ | ----------------- | ---------------- | ------------------- |
| `heyjoe`  | Hey Joe                | Jimi Hendrix         | HEYJOE        | HJOE.AVI     | HEYJOE/PLAY/HJOE.SCO    | HEYJ-B2.BMP      | 16 (0 = list)       |
| `life`    | Life by the Drop       | Stevie Ray Vaughan   | LIFE          | LBTD.AVI     | LIFE/PLAY/LIFE.SCO      | LBTDBAR3.BMP     | 7                   |
| `woman`   | No Woman, No Cry       | Bob Marley           | WOMAN         | NWNC.AVI     | WOMAN/PLAY/NWNC.SCO     | NWNC-B2.BMP      | 13                  |
| `blowin`  | Blowin' in the Wind    | Bob Dylan            | BLOWIN        | BITW.AVI     | BLOWIN/PLAY/BITW.SCO    | BITW-B2.BMP      | 7                   |
| `dust`    | Dust in the Wind       | Kansas               | DUST          | DITW.AVI     | DUST/PLAY/DITW.SCO      | DITW-B2.BMP      | 9                   |
| `sweet`   | Sweet Home Alabama     | Lynyrd Skynyrd       | SWEET         | SHA.AVI      | SWEET/PLAY/SHA.SCO      | SHA-B4.BMP       | 12                  |
| `wild`    | Wild World             | Cat Stevens          | WILD          | WW.AVI       | WILD/PLAY/WW.SCO        | WW-B3.BMP        | 10                  |

Notes:
- All folder/file names lowercase after our pipeline.
- The SCO header references the actual `scorefile=` filename — your
  parser already reads this.
- Each song has its own `chords/chords.chd` (auto-loaded via SCO header
  pointer).
- Exercise folder count includes folder `0` which is the entry/list
  scene (skip it, real exercises are 1..N where N = count - 1).

The CD's main video files all live in `/Volumes/Guitar/VIDEO/` —
already mounted/copied to `assets/raw/` only for Hey Joe so far.

## Asset pipeline extension

Update `scripts/build-assets.sh` to handle ALL songs.

Pseudocode:
```sh
SONGS=("heyjoe:HEYJOE:HJOE" "life:LIFE:LBTD" "woman:WOMAN:NWNC" \
       "blowin:BLOWIN:BITW" "dust:DUST:DITW" "sweet:SWEET:SHA" \
       "wild:WILD:WW")

for entry in "${SONGS[@]}"; do
  IFS=':' read -r slug folder video <<< "$entry"
  # 1. Convert main video AVI -> MP4
  src="/Volumes/Guitar/VIDEO/${video}.AVI"
  dst="public/assets/${slug}/${slug}.mp4"
  if [ ! -f "$dst" ] || [ "$src" -nt "$dst" ]; then
    mkdir -p "$(dirname "$dst")"
    ffmpeg -y -i "$src" -c:v libx264 -preset slow -crf 22 \
           -c:a aac -b:a 128k -movflags +faststart "$dst"
  fi
  # 2. Copy raw data folder lowercased
  rsync_or_find_copy "/Volumes/Guitar/GUITAR/${folder}/" \
                     "public/assets/${slug}/raw/"
  # 3. Convert chord BMPs to PNG (sips loop)
  # 4. Convert score BMP to PNG
  # 5. Convert exercise AVIs in raw/exercice/N/ to MP4 (skip N=0 list scene)
  # 6. Convert exercise tab BMPs (sco*.bmp) in raw/exercice/N/ to PNG
done
```

Reuse existing helpers from the current script (the conversion logic
for Hey Joe is already there; just generalise to take a slug). Print
clear progress: `==> heyjoe: video / data / chord BMPs / exercise videos`.

The file accept `npm run assets <slug1> <slug2> ...` to convert only
specific songs (default: all 7). This stays compatible with the
existing `npm run assets heyjoe`.

Total expected output: ~250–400 MB across all 7 songs (videos +
exercise videos). Acceptable.

## Code changes

### `src/songs.ts` — new file

```ts
export type SongMeta = {
  slug: string;
  title: string;
  artist: string;
  videoUrl: string;          // /assets/<slug>/<slug>.mp4
  rawDir: string;            // /assets/<slug>/raw/
  scoUrl: string;            // /assets/<slug>/raw/play/<sco>.sco
  chdUrl: string;            // /assets/<slug>/raw/chords/chords.chd
  chordImageUrl: string;     // /assets/<slug>/raw/chords/<picturefile>.png
  exerciseCount: number;     // real exercises only (folder 0 excluded)
};

export const SONGS: SongMeta[] = [
  { slug: "heyjoe", title: "Hey Joe", artist: "Jimi Hendrix",
    videoUrl: "/assets/heyjoe/heyjoe.mp4",
    rawDir: "/assets/heyjoe/raw/",
    scoUrl: "/assets/heyjoe/raw/play/hjoe.sco",
    chdUrl: "/assets/heyjoe/raw/chords/chords.chd",
    chordImageUrl: "/assets/heyjoe/raw/chords/heyjoe2.png",
    exerciseCount: 15 },
  // ... etc for all 7
];

export function getSongBySlug(slug: string): SongMeta | undefined {
  return SONGS.find(s => s.slug === slug);
}
```

For each song's `chordImageUrl`, peek at the CHD file's `PictureFile=`
header to get the right master image filename — most are
`<song>2.bmp` or similar. Either hard-code in the table after looking
once, or load lazily by reading CHD header. **Recommend hard-coding**
to avoid load order coupling; if a value is wrong it's easy to fix.

The `videoUrl` is the converted mp4. Note that for Hey Joe today the
file is `hjoe.mp4`; rename it to `heyjoe.mp4` in the build script
for consistency (or keep as `hjoe.mp4` and adjust SongMeta — your
choice; spec writer recommends standardising on `<slug>.mp4`).

### `src/main.ts` — refactor for multi-song

The current `main.ts` initialises Hey Joe directly. Refactor to:

1. **On load**: parse `location.hash`. Routes:
   - `""` or `"#/"` → render home.
   - `"#/song/<slug>"` → load that song.
   - Anything else → redirect to `#/`.
2. **`renderHome()`**: build a grid of song cards in the page body.
   Hide all song-player UI elements while home is shown.
3. **`renderSong(meta: SongMeta)`**: do everything `init()` currently
   does, but parameterise paths from `meta`. Show song-player UI.
4. **Hash change listener**: rebuild on `hashchange` event.

**Crucial:** `renderSong()` must clean up state from a previous song
before initialising new one (dispose TabScroller, clear DOM injected
elements like chord buttons, drop event listeners, etc.). The
existing TabScroller has a `dispose()` method (Phase 2 hygiene).

### Home screen

Add a new `<div id="home-view">` to `index.html` (initially hidden).
Its content is generated by `renderHome()`.

Layout: simple grid of cards.
```html
<div id="home-view" hidden>
  <h1 class="home-title">Guit95 — Choose a song</h1>
  <div class="song-grid">
    <!-- 7 cards injected -->
  </div>
</div>
```

Card structure:
```html
<button class="song-card" data-slug="heyjoe">
  <div class="song-card-title">Hey Joe</div>
  <div class="song-card-artist">Jimi Hendrix</div>
  <div class="song-card-meta">15 exercises</div>
</button>
```

CSS:
```css
#home-view {
  padding: 32px;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
}
#home-view[hidden] { display: none; }
.home-title { font-size: 1.4rem; margin-bottom: 24px; }
.song-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}
.song-card {
  display: flex; flex-direction: column; gap: 4px;
  padding: 18px;
  background: var(--btn-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  text-align: left;
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
}
.song-card:hover { background: var(--btn-hover); border-color: #666; }
.song-card-title { font-size: 1.1rem; font-weight: 700; }
.song-card-artist { font-size: 0.9rem; color: var(--text-dim); }
.song-card-meta { font-size: 0.8rem; color: var(--text-dim); margin-top: 6px; }
```

Click handler: `location.hash = "#/song/" + slug`.

### Player header — back button

Modify the song-player `#header` to add a "← Library" button on the
left, then the song title (from meta), the existing exercise dropdown,
and Vert/Horiz toggle:
```html
<header id="header">
  <button id="back-to-home" type="button" class="chord-btn">← Library</button>
  <h1 id="song-title">—</h1>
  <select id="exercise-select">...</select>
  <div id="orientation-toggle">...</div>
</header>
```

`back-to-home` click: `location.hash = "#/"`.

The `<h1>` text comes from current song meta.

### Show/hide rules

- When hash = `#/`: `#home-view.hidden = false`; hide everything else
  (`#header`, `#main`, `#playback-controls`, `#tab-row`).
- When hash = `#/song/<slug>`: `#home-view.hidden = true`; show
  song-player elements.
- An exercise being open (Phase 4c logic) is a sub-state of song
  view; doesn't change here.

### State per song

Each time the user navigates to a song:
- Pause and clear any previous video src.
- Dispose previous TabScroller.
- Clear NOW/NEXT preview state.
- Clear A/B/Loop state.
- Re-render All-chords row with new chord set.
- Reset speed to 1.0 (or keep persisted? — keep persisted since
  Speed lives in localStorage).

### Exercise dropdown per song

Number of exercises varies by song (7..15 real). Generate the dropdown
options from `meta.exerciseCount`.

Renumbering algorithm (Phase 4d) reuses score.difficulties — works
per song.

## What you DO NOT need to do

- ❌ Tuner (Phase 5 — deferred).
- ❌ Metronome (Phase 6 — deferred).
- ❌ Toolkit's 10 generic exercises.
- ❌ Multi-arrangement support (each song has `<song>1.sng` and
  `<song>2.sng`; only the first is used).
- ❌ Multi-segment exercise playback (still segment 1 only per Phase 4b).
- ❌ Settings, hotkey help overlay, prefs UI (Phase 8).
- ❌ `chords2.cho` alternate chord sets (some songs have them).
- ❌ Persist last-opened song (the URL hash is enough).

## Definition of Done

- [ ] `scripts/build-assets.sh` extended; running `npm run assets`
      converts main video + exercise videos + chord BMPs + tab BMP
      for ALL 7 songs. Re-running is idempotent (existing files
      skipped). Accepts optional slug args to limit scope.
- [ ] `src/songs.ts` exists with `SongMeta[]` for all 7 songs and a
      `getSongBySlug` helper.
- [ ] On `localhost:5173/` (no hash): home screen with 7 cards.
- [ ] Click any card → URL becomes `#/song/<slug>`, song player opens
      with all Phase 1–4 features working for that song.
- [ ] "← Library" button (top left of player header) returns to home.
- [ ] Song title shown in player header.
- [ ] Exercise dropdown populated according to that song's exercise
      count.
- [ ] Reload on a `#/song/<slug>` URL: page rebuilds the player for
      that song (no flash of home screen).
- [ ] Hash change in any direction (home → song, song → song, song
      → home) cleans up old state and renders new state without
      stale DOM nodes.
- [ ] All 7 songs play correctly: video plays, score syncs, hotspots
      render, NOW/NEXT updates, hotkeys work, Loop here works,
      exercises open and play.
- [ ] No console errors during navigation between songs.
- [ ] Phase 4e behaviours intact: exercise tab replaces song tab in
      bottom area, voice/video mutex.
- [ ] `git status` clean; commit `phase 7:`.

## Demo (mandatory — verbatim in your final report)

```
1. cd ~/src/guitar
2. npm run assets   (converts ~6 main videos + 50+ exercise videos
                    + chord/tab BMPs; first run takes 5-10 minutes,
                    subsequent runs near-instant)
3. npm run dev
4. Open http://localhost:5173/
5. Home screen appears: title "Guit95 — Choose a song" + 7 cards:
   Hey Joe / Life by the Drop / No Woman, No Cry / Blowin' in the
   Wind / Dust in the Wind / Sweet Home Alabama / Wild World.
   Each card shows artist + exercise count.
6. Click "Hey Joe" card:
   - URL becomes http://localhost:5173/#/song/heyjoe
   - Player opens with familiar Hey Joe view (header has
     "← Library" + "Hey Joe" + dropdown + Vert/Horiz, plus video,
     side panel NOW/NEXT, all-chords, tab strip with hotspots,
     playback controls).
7. Verify all features work for Hey Joe (Space play/pause, hotspot
   click → exercise opens with renumbered exercises, etc.).
8. Click "← Library":
   - URL becomes http://localhost:5173/#/ and home is back.
9. Click "Sweet Home Alabama":
   - URL becomes #/song/sweet
   - Player opens with Sweet Home Alabama: SHA.SCO data,
     exercise count from this song's data (12 exercises in dropdown),
     its own tab strip and chord set.
10. Verify a hotspot works on Sweet Home Alabama too — opens its
    own exercise content (different voice + video files).
11. Open another song (e.g. "Life by the Drop") and confirm same.
12. Reload the page on a #/song/woman URL → opens directly to "No
    Woman, No Cry" without flash of home.
13. Stop the dev server.
```

## Reporting

Final report (≤500 words):
1. Demo block, verbatim, first.
2. What was built (≤10 bullets).
3. Files touched.
4. Asset footprint: `du -sh public/assets` before and after.
5. Any per-song quirks you encountered (e.g. weird CHD picture file
   name, non-standard exercise folder layout).
6. Deviations from spec, with reason. "None" if you stuck to it.
7. Known issues / TODOs deferred.
