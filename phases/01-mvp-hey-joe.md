# Phase 1 — Hey Joe MVP (video + 11 chord buttons)

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> Read `../SPEC.md` (full reverse-engineered spec of the original CD) and
> `../ROADMAP.md` (overall plan; you only do Phase 1) for background.
> Read `00-asset-pipeline.md` to understand what already exists.

## Context

Phase 0 has built:
- Vite + TypeScript skeleton at `/Users/apetrochenko/src/guitar/`.
- `src/parsers/ini.ts` — generic INI parser. **Reuse it**, don't duplicate.
- Asset pipeline: `scripts/build-assets.sh`. Hey Joe video is at
  `public/assets/heyjoe/hjoe.mp4`. Hey Joe data (lowercased) is at
  `public/assets/heyjoe/raw/`.
- The Phase 0 sanity-check page at `index.html` will be **replaced** by
  the Phase 1 page in this phase.

This phase builds the first user-facing deliverable: a single page where
the user can watch the Hey Joe video and click any of the 11 chords to
see its diagram and hear its sample. **No tab scrolling yet** (Phase 2),
**no slow-down/loop yet** (Phase 3), **no exercises yet** (Phase 4).

## Goal of this phase

The user opens the app, sees the Hey Joe video and a row of 11 chord
buttons. They can press play to watch the lesson and click any chord
button to:

1. Display the chord's diagram in a side panel.
2. Hear the chord's sample played.

A toggle switches the diagram between vertical and horizontal (US) view.

## Files & data

Source data files (already lowercased by Phase 0):
- Chord database: `public/assets/heyjoe/raw/chords/chords.chd`
- Master chord image: `public/assets/heyjoe/raw/chords/heyjoe2.bmp`
- Sample WAVs: `public/assets/heyjoe/raw/chords/hj_*.wav`
- Hand close-up BMPs: `public/assets/heyjoe/raw/chords/<a|c|d|e|...>.bmp`
  (not used in Phase 1; mentioned for future reference).
- Video: `public/assets/heyjoe/hjoe.mp4`.

### CHD format reminder

Each `[chord]` entry has (see `../SPEC.md` §3.3 for full detail):

| Field            | Type           | Use in Phase 1                      |
| ---------------- | -------------- | ----------------------------------- |
| `chord`          | int id         | internal key                        |
| `name`           | string         | button label (e.g., "C", "Go")      |
| `pic_rect`       | x1,y1,x2,y2    | crop of `heyjoe2.bmp` for **vertical** view |
| `pic_rect_us`    | x1,y1,x2,y2    | crop of `heyjoe2.bmp` for **horizontal (US)** view |
| `sound`          | filename       | WAV to play on click (relative to `chords/`) |
| `comments`       | string         | French label (e.g., "DO", "RE") — show as small caption |
| `rgbHighlight`   | r g b          | (ignore in Phase 1; Phase 2 uses it for active-chord highlight) |
| Other fields     | …              | ignore in Phase 1                   |

Hey Joe has 11 chords: C, Go, D, A, E, C_3, G_3, D_5, A_5, E_7, E7#9.

### File-loading wrapper

Because the CHD file is **Windows-1252** encoded (it has French
characters like `é`, `è` in `comments`), you need a tiny wrapper that:
1. `fetch()` the URL.
2. Reads body as `ArrayBuffer`.
3. Decodes via `new TextDecoder("windows-1252")`.
4. Passes the resulting string to `parseIni()` from `src/parsers/ini.ts`.

Add this wrapper at `src/parsers/load.ts`:
```ts
export async function loadIni(url: string): Promise<IniFile> {
  const buf = await fetch(url).then(r => r.arrayBuffer());
  const text = new TextDecoder("windows-1252").decode(buf);
  return parseIni(text);
}
```

## Scope — IN

1. **CHD parser** at `src/parsers/chd.ts`:
   - Builds on `parseIni()` + `loadIni()`.
   - Exports a typed result:
     ```ts
     export type Rect = { x: number; y: number; w: number; h: number };
     export type Chord = {
       id: number;
       name: string;
       picRect: Rect;          // from pic_rect
       picRectUS: Rect;        // from pic_rect_us
       sound: string;          // relative path, lowercase, no whitespace
       comments: string;       // may be empty
       rgbHighlight: [number, number, number];  // default [255,0,0]
     };
     export type ChordDb = {
       pictureFile: string;    // relative to the CHD file
       chords: Chord[];        // in source order
     };
     export async function loadChordDb(chdUrl: string): Promise<ChordDb>;
     ```
   - Note CHD `pic_rect=x1,y1,x2,y2` is `[left,top,right,bottom]`
     — convert to `{ x, y, w, h }` (`w = x2-x1`, `h = y2-y1`).
   - Trim whitespace from all string fields (sound paths in source have
     trailing spaces).
   - Default `rgbHighlight` to `[255, 0, 0]` if missing or malformed.
   - Skip `[chord]` entries that are missing required fields (`name`,
     `pic_rect`, `pic_rect_us`, `sound`); log to console.

2. **Hey Joe page** — replaces `index.html` from Phase 0.

   Layout (CSS grid; pixel-perfect not required, just legible):
   ```
   ┌──────────────────────────────────────────────────────────┐
   │ Header:  Guit95 — Hey Joe        [Vert] [Horiz]          │
   ├────────────────────────────┬─────────────────────────────┤
   │                            │  Active chord:  C (DO)      │
   │   <video> 640×… controls   │                             │
   │                            │   ┌──────────────────────┐  │
   │                            │   │   chord diagram      │  │
   │                            │   │   (cropped from BMP) │  │
   │                            │   └──────────────────────┘  │
   │                            │                             │
   │                            │   [▶ Play sample]           │
   │                            │                             │
   ├────────────────────────────┴─────────────────────────────┤
   │ [C] [Go] [D] [A] [E] [C_3] [G_3] [D_5] [A_5] [E_7] [E7#9]│
   └──────────────────────────────────────────────────────────┘
   ```
   - 11 chord buttons in a row, evenly spaced. On hover: highlight.
     On click:
     1. Mark this button "active" (visual: brighter background or border).
     2. Update side panel: name, French comment, diagram, samples enabled.
     3. Play the chord's sample exactly once (don't loop).
   - "Play sample" button in side panel re-plays the sample.
   - Vert/Horiz toggle (top right): switches all rendered diagrams to
     use `picRect` (Vert) or `picRectUS` (Horiz). Persist choice in
     `localStorage` under key `chord-orientation` (`"vert"` or `"horiz"`).
     Default: vert.
   - Initial state: no chord selected; side panel shows "Click a chord".

3. **Diagram rendering** at `src/components/ChordDiagram.ts`:
   - One `<canvas>` per side panel (single canvas redrawn on chord change).
   - Loads `heyjoe2.bmp` once via `<img>` (or via `Image()` constructor
     — set `img.src`, await `img.decode()`).
   - On chord render: `ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, dstW, dstH)`
     where src rect comes from chosen orientation.
   - Render at 2× device-pixel ratio for sharpness (set canvas
     `width = dstW * dpr; height = dstH * dpr`, scale ctx).
   - **BMP fallback:** First try loading `heyjoe2.bmp` directly. If
     `img.decode()` throws (test in Safari + Chrome), add a one-time
     conversion step to `scripts/build-assets.sh` that converts
     `heyjoe/raw/chords/*.bmp` → `*.png` via `sips` (macOS built-in) or
     `ffmpeg`, and load the PNG instead. **Do not assume — actually run
     the dev server and check.**

4. **Sample playback** at `src/audio/sample.ts`:
   - Use a single `HTMLAudioElement` reused across plays:
     ```ts
     let el: HTMLAudioElement | null = null;
     export function playSample(url: string) {
       if (!el) el = new Audio();
       el.src = url;
       el.currentTime = 0;
       void el.play();
     }
     ```
   - This is intentionally simple; Phase 6 (metronome) will introduce
     `AudioContext` if needed.

5. **Minimal handwritten CSS** in `src/styles.css`:
   - Dark theme (matches Phase 0 sanity page).
   - System font stack (no web fonts).
   - Buttons have 8px padding and visible border.
   - Active chord button has distinct background (e.g., `#4a8`).
   - No animations.
   - **Do not** install Tailwind, no PostCSS plugins, no preprocessing.

## Scope — OUT (explicitly do NOT do)

- ❌ Tab scrolling (Phase 2).
- ❌ Slow-down / loop / playbackRate UI (Phase 3).
- ❌ Exercises panel (Phase 4).
- ❌ Tuner, metronome (Phase 5–6).
- ❌ Hand close-up images (`hand=`) display.
- ❌ Routing or multiple pages.
- ❌ "Practice mode" / progress tracking.
- ❌ Chord set switching (`chordsetswitch` keyboard shortcut from SPEC).
- ❌ Strumming pattern playback (per-string `A=0 2920` timing). Phase 1
  plays the whole `sound=` WAV as one event.

## Toolchain

Already installed: node v26, npm 11, ffmpeg 8.1.1, sips (macOS built-in).

If you need to convert BMP → PNG, prefer `sips` because it's a single
command:
```
sips -s format png input.bmp --out output.png
```

## Definition of Done

Verify each yourself before reporting completion:

- [ ] `src/parsers/chd.ts` exists, exports `loadChordDb(url)`, parses
      Hey Joe's `chords.chd` returning exactly 11 chords with all
      required fields populated.
- [ ] `src/parsers/load.ts` exists with `loadIni(url)` using
      Windows-1252 decoder.
- [ ] Inline self-test in `main.ts` for CHD parsing replaced or extended
      from Phase 0's INI test. Console shows "CHD parser self-test: 11 chords loaded".
- [ ] `index.html` replaced; old "sanity check" content removed.
- [ ] Page loads with no errors in browser console.
- [ ] All 11 chord buttons render with chord names.
- [ ] Clicking each of the 11 chords shows the correct diagram and
      plays the corresponding `hj_*.wav`. Verify audibly for at least
      3 chords (C, A, E7#9).
- [ ] Vert/Horiz toggle switches the rendered diagram between two
      different crops of `heyjoe2.bmp`. Choice persists across reload.
- [ ] French comment renders correctly (e.g., "DO", "barré III") — no
      mojibake (no `Ã©` for `é`).
- [ ] Video still plays (don't break what worked in Phase 0).
- [ ] If BMP loading required PNG conversion: `scripts/build-assets.sh`
      includes the new step and is still idempotent.
- [ ] `git status` clean; new commit "phase 1: hey joe mvp".

## Demo (mandatory — include in your final report verbatim)

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/
4. Expected:
   - Header: "Guit95 — Hey Joe"  with [Vert] [Horiz] toggle
   - Video player on the left (Hey Joe poster)
   - Side panel on the right: "Click a chord"
   - Bottom row: 11 chord buttons: C, Go, D, A, E, C_3, G_3, D_5, A_5, E_7, E7#9
5. Click button "C":
   - Side panel shows "C (DO)" with a chord diagram drawn from heyjoe2.bmp
   - Hear the C chord sample play once
6. Click "Horiz" toggle:
   - The same diagram redraws using a different crop (looks different shape)
7. Click button "A":
   - Diagram updates to A chord
   - Hear the A chord sample
8. Click button "E7#9":
   - Diagram updates to E7#9
   - Hear E7#9 sample
9. Reload the page (Cmd+R):
   - Horiz orientation is still selected (persisted)
10. Click play on the video:
    - Hey Joe lesson plays with sound, side panel and chord row stay usable
11. Stop the dev server (Ctrl+C).
```

## Reporting

After completion, write a final report (≤400 words):

1. **Demo block** (above) — verbatim, first.
2. **What was built** — files created/modified, ≤10 bullets.
3. **Deviations** — anything different from the spec, with reason.
   "None" if you stuck to it.
4. **BMP rendering decision** — did Safari/Chrome read `heyjoe2.bmp`
   directly, or did you add PNG conversion? State explicitly.
5. **Known issues / TODOs deferred** — flag anything Phase 2 needs to
   know.

The user runs the demo to approve before Phase 2 starts.
