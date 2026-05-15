# Phase 2 — Synchronized Scrolling Tablature

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> Read these in order before starting:
> 1. `../SPEC.md` — full reverse-engineered spec. **Section §3.4 (Score
>    file)** is critical for this phase.
> 2. `../ROADMAP.md` — overall plan; you only do Phase 2.
> 3. `00-asset-pipeline.md` and `01-mvp-hey-joe.md` — what already exists.

## Context

Phases 0 & 1 built:
- Vite + TS skeleton, asset pipeline (`scripts/build-assets.sh`).
- `src/parsers/ini.ts` — generic INI parser (use it).
- `src/parsers/load.ts` — `loadIni(url)` with Windows-1252 decoding.
- `src/parsers/chd.ts` — CHD parser → `ChordDb { pictureFile, chords }`.
- `src/components/ChordDiagram.ts` — canvas chord-diagram renderer.
- `src/audio/sample.ts` — `playSample(url)`.
- Hey Joe page (`index.html` + `src/main.ts`): video, side panel with
  active chord diagram, chord row of 11 buttons.
- Layout is **responsive** (CSS grid, fluid widths, stacks on ≤800px).
  Do not regress this.

## Goal of this phase

A long horizontal **scrolling tablature strip** appears under the video.
As the video plays, the strip scrolls so a fixed cursor in the strip's
horizontal centre tracks the current note. Bar lines are visible on the
strip and clickable to jump the video. When a chord-change event fires
in the score, the matching chord button in the bottom row glows.

**Out of scope** for this phase: difficulty hot-spots (Phase 4), loop /
slow-down (Phase 3), exercises (Phase 4).

## Files & data

- Score file: `public/assets/heyjoe/raw/play/hjoe.sco`
- Long tab strip (BMP): `public/assets/heyjoe/raw/play/heyj-b2.bmp`
  (390 KB, ~14000 px wide, palette BMP — convert to PNG, see below)
- Background BMP `play1.bmp` is **not used** in Phase 2 (modern UI doesn't
  need the original Win95 background).
- The CHD already loaded by Phase 1 supplies chord names + rgbHighlight.

### SCO file structure (concrete to Hey Joe)

Read from `hjoe.sco`:

```
version=100
videofile=\VIDEO\HJOE.AVI
chordfile=..\CHORDS\CHORDS.CHD
scorefile=HEYJ-B2.BMP
backfile=PLAY1.BMP
playfile=HEYJ-B2.BMP
startingframe=0
endingframe=2139
startingpixel=0
endingpixel=14139

[bar]
pixel=110
pixel=478
pixel=478          ← duplicates can appear; dedupe in parser
pixel=751
…                  ← ~50 entries total

[event]
frame=0
pixel=110
[event]
frame=8
pixel=335
[event]
frame=27
pixel=517
chord=4            ← optional; index into ChordDb.chords by id
[event]
frame=43
pixel=597
manual=1           ← optional flag; ignore in Phase 2
…                  ← 534 entries total

[difficulty]
sound=…            ← Phase 4 only; parse but don't render in Phase 2
rect=886,65,1130,160
index=43
color=219,198,129
exercice=4
…                  ← 41 entries
```

**Important:** the `[bar]` section is **a single section with many
duplicate `pixel=` keys**, not many separate `[bar]` sections. Your INI
parser already returns duplicates as separate entries — use that.

## Scope — IN

### 1. SCO parser (`src/parsers/sco.ts`)

```ts
export type Score = {
  videoFile: string;          // raw value, useful for diagnostics
  scoreFile: string;          // relative filename of long tab strip
  startingFrame: number;
  endingFrame: number;
  startingPixel: number;
  endingPixel: number;
  bars: number[];             // sorted unique pixel positions
  events: Event[];            // sorted by frame ascending
  difficulties: Difficulty[]; // parsed but unused in Phase 2
};
export type Event = {
  frame: number;
  pixel: number;
  chord?: number;             // chord id (matches Chord.id from CHD)
  manual?: boolean;
};
export type Difficulty = {
  rect: { x: number; y: number; w: number; h: number };
  index: number;
  color: [number, number, number];
  exercice: number;
  sound: string;
};

export async function loadScore(url: string): Promise<Score>;
```

- Use `loadIni()` from `src/parsers/load.ts`.
- Sort `events` by `frame` ascending (they already are in the source,
  but enforce).
- Sort and dedupe `bars`.
- For `difficulty`, parse `rect=x1,y1,x2,y2` → `{x, y, w, h}` (same
  convention as CHD `picRect`).
- Skip malformed entries; log to console.

Self-test in `main.ts` (extend the existing parser tests):
```
console.log(`SCO parser self-test: ${score.events.length} events, ${score.bars.length} bars`);
// expect: 534 events, around 49 bars (after dedupe)
```

### 2. Tab-strip PNG conversion

Extend `scripts/build-assets.sh`:
- Convert `heyjoe/raw/play/heyj-b2.bmp` → `heyj-b2.png` via `sips`
  (idempotent — skip if PNG newer than BMP).
- Re-use the existing pattern from chord BMP→PNG step.
- After conversion: `du -k` the PNG and report; should be smaller than
  390 KB BMP.

### 3. `TabScroller` component (`src/components/TabScroller.ts`)

Visual structure (DOM, no canvas):

```html
<div class="tab-viewport">           <!-- overflow:hidden, position:relative -->
  <div class="tab-strip" style="transform: translateX(-Npx)">
    <img src="/assets/.../heyj-b2.png" />
    <div class="bar-marker" style="left:110px"></div>
    <div class="bar-marker" style="left:478px"></div>
    …
  </div>
  <div class="tab-cursor"></div>      <!-- fixed at centre, always visible -->
</div>
```

Constructor:
```ts
new TabScroller(container: HTMLElement, opts: {
  score: Score;
  pngUrl: string;
  video: HTMLVideoElement;
  onActiveChordChange?: (chordId: number | null) => void;
});
```

Behaviour:

- **Strip dimensions:** the strip's width is the natural width of the
  PNG. Image height defines viewport height. The viewport's CSS height
  matches the image height; CSS width is `100%` of its parent
  (responsive layout requirement: never use a fixed pixel viewport width).
- **Cursor position:** fixed at `viewportWidth / 2`. It's a 2-px-wide
  vertical line, full viewport height, semi-transparent accent colour
  (`rgba(74,170,136,0.9)` to match `--accent`).
- **Bar markers:** thin vertical lines (1 px) inside `.tab-strip` at
  each bar's pixel position, full strip height, faint colour
  (`rgba(255,255,255,0.18)`). They are also clickable hit-zones — see
  below.
- **Sync loop:** start a `requestAnimationFrame` loop on construction.
  On each tick:
  1. If `video.paused` and not seeking, do nothing extra (still keep
     the loop running so seek updates render immediately).
  2. Compute `currentFrame = video.currentTime * fps` where
     `fps = score.endingFrame / video.duration` (memoise after metadata
     load; if video duration is `NaN`, skip frame).
  3. Binary-search the `events` array for the largest `event` with
     `frame <= currentFrame`.
  4. Linear-interpolate pixel between this event and the next.
  5. Apply `transform: translateX(-(targetPixel - viewportWidth/2)px)`
     on `.tab-strip`. Clamp to `[startingPixel, endingPixel]` so the
     cursor doesn't run past the strip ends.
  6. Determine current active chord: walk events backwards from the
     current event index to find the most recent one with `chord` set.
     If it changed since last tick, fire `onActiveChordChange(chordId)`.
- **Bar click → seek:** clicking a bar marker computes
  `targetPixel = bar.pixel`, finds the matching event with the closest
  pixel, sets `video.currentTime = event.frame / fps`. Bars must have a
  larger invisible hit area (e.g., 12 px wide, centred on the line) to
  be easy to click.
- **Resize handling:** use `ResizeObserver` on the viewport. When width
  changes, immediately recompute and apply translateX so the cursor
  stays correctly aligned.
- **Cleanup:** expose a `dispose()` method that cancels the RAF loop
  and disconnects observers (not strictly used in Phase 2, but good
  hygiene; Phase 7's router will need it).

### 4. Page wiring (`index.html` + `src/main.ts`)

- Add a row for the tab scroller **between the video and the chord
  row** in the page layout. The video pane keeps its current position
  (left side); the tab strip spans the full main width below the
  video–panel row OR (acceptable alternative) sits **inside the video
  pane below the video element**. Pick whichever fits the responsive
  grid more cleanly. Document your choice.
- On chord-change event from `TabScroller`, find the matching chord
  button by `chord.id`, add an `auto-active` CSS class. Removing the
  class is automatic when the next chord change happens (so only one
  chord has `.auto-active` at a time).
- The existing "click chord → side panel + sample" flow must continue
  to work; the auto-active highlight is a separate visual layer.
- The active highlight uses the chord's `rgbHighlight` from CHD — set
  it via inline style `outline: 2px solid rgb(R,G,B)` on the button.
  This way different chords can glow with different colours (most are
  `255 0 0` red).

### 5. CSS

Minimal additions to `src/styles.css`:
- `.tab-viewport`: `position: relative; overflow: hidden; width: 100%;`
  background `#0f0f0f`, border-top + border-bottom `1px solid var(--border)`.
- `.tab-strip`: `position: relative; will-change: transform;`.
- `.tab-strip img`: `display: block; image-rendering: pixelated;`
  (height auto, width auto — natural size).
- `.bar-marker`: `position: absolute; top:0; bottom:0; width:1px;
  background: rgba(255,255,255,0.18); cursor: pointer;`. Add a
  `::before` pseudo with `content:''; position:absolute; left:-6px;
  right:-6px; top:0; bottom:0;` for the click hit area.
- `.tab-cursor`: `position: absolute; top:0; bottom:0;
  left: calc(50% - 1px); width: 2px; background: rgba(74,170,136,0.9);
  pointer-events: none;`.
- `.chord-btn.auto-active`: visible glow (use `outline` set inline,
  CSS adds `outline-offset: 2px; transition: outline 0.05s linear;`).

## Scope — OUT (do NOT do)

- ❌ Difficulty hot-spots rendering / clickability (Phase 4).
- ❌ Slow-down or A↔B loop (Phase 3).
- ❌ Exercise list / exercise scenes (Phase 4).
- ❌ Tuner, metronome (Phase 5–6).
- ❌ Original 1995 background (`play1.bmp`) — modern UI uses the
  existing dark theme.
- ❌ The cursor.bmp sprite — use the simple CSS line described above.
- ❌ Routing / multiple songs — Hey Joe only for now (Phase 7).
- ❌ Replacing the chord-row click behaviour from Phase 1 — it must
  keep working alongside the auto-highlight.

## Performance acceptance

- Smooth scroll at 60 Hz on a Mac with retina display. No visible
  judder during playback.
- Binary search keeps tick under 1 ms in the steady state.
- Initial PNG load < 1 second (use `<img loading="eager">`; ensure the
  RAF loop doesn't crash if image hasn't decoded yet — guard with a
  ready flag).

## Definition of Done

- [ ] `src/parsers/sco.ts` exists and exports `loadScore` returning the
      typed `Score`. Self-test logs `534 events, ~49 bars`.
- [ ] `scripts/build-assets.sh` converts `heyj-b2.bmp` → `heyj-b2.png`
      idempotently. Re-running the script does NOT redo the conversion.
- [ ] `src/components/TabScroller.ts` exists, renders the scroller,
      handles RAF loop, bar clicks, and resize.
- [ ] Page layout updated. Video, tab strip, side panel, chord row all
      visible together; layout still responsive (no regressions on
      ≤800px viewport).
- [ ] Active chord auto-highlight works during playback.
- [ ] Click any bar marker → video jumps to that bar; tab strip
      translates to centre the cursor on it.
- [ ] No errors / warnings in browser console during a full play of the
      song.
- [ ] All Phase 1 features (chord click → diagram + sample,
      vert/horiz toggle, sample replay button) still work.
- [ ] `git status` clean; commit with message starting `phase 2:`.

## Demo (mandatory — copy verbatim into your final report)

```
1. cd ~/src/guitar
2. npm run assets   (builds the new tab PNG; quick if BMP→PNG already done)
3. npm run dev
4. Open http://localhost:5173/
5. Expected initial view:
   - Header, video, NEW tab strip below video, side panel, chord row.
   - Tab strip shows the long Hey Joe score, vertical centre cursor,
     thin tick marks for each bar.
   - No chord button is auto-highlighted yet (video at frame 0).
6. Press play on the video:
   - The tab strip starts scrolling right-to-left in time with the music.
   - The cursor stays centred; the score moves under it.
   - Around frame 27 (a few seconds in), the chord-row button "E" gets
     a red outline (rgbHighlight=255 0 0). The outline moves to the
     next chord whenever the score advances to a new chord event.
7. Pause the video:
   - The strip stops scrolling immediately. Cursor stays put.
8. Click on the 5th bar marker:
   - Video jumps to ~bar 5. Tab strip jumps so the cursor sits exactly
     on that bar.
9. Click chord button "A" manually:
   - Side panel updates with A diagram + sample plays (Phase 1 behaviour
     intact).
10. Resize the window narrower (drag from right):
    - Tab strip stays full width of its container; cursor remains in
      its visual centre.
11. Resize to <800 px wide:
    - Layout reflows to single column; tab strip remains usable.
12. Stop the dev server (Ctrl+C).
```

## Reporting

Final report (≤400 words):
1. **Demo block** verbatim, first.
2. **What was built** — files created/modified, ≤10 bullets.
3. **Layout decision** — did you put the tab strip below the video pane,
   below the whole video–panel row, or somewhere else? Why?
4. **Performance notes** — observed RAF tick cost, PNG load time, any
   judder you noticed.
5. **Deviations** from this spec, with reason. "None" if you stuck to it.
6. **Known issues / TODOs deferred** — flag anything Phase 3 / 4
   should know.
