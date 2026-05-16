# Phase 3 — Slow-down + A↔B Loop (the "killer feature")

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.

## Context

Personal-use web app for learning guitar from a 1995 Ubi Soft CD.
Stack: Vite + TypeScript + vanilla DOM. Working directory:
`/Users/apetrochenko/src/guitar/`.

Read in order:
1. `../SPEC.md` — original CD data formats; §3.4 (SCO) is the most
   relevant. SCO header has `endingFrame` and `endingPixel`; the
   `[bar]` section gives bar boundary pixel positions.
2. `../ROADMAP.md` — overall plan; you only do Phase 3.
3. `00-asset-pipeline.md`, `01-mvp-hey-joe.md`, `02-tab-sync.md`,
   `02b-fixes-and-now-next.md`, `02c-page-flip-scroll.md` — prior phases.

This phase adds two related features that, together, are the main
reason the user is building this app:
- **Slow-down**: play the video at 0.25×–1.5× without changing pitch.
- **A↔B Loop**: pick two bar boundaries, loop the video between them.

After this phase the user should be able to take any difficult passage
and practice it endlessly at half speed — the core practice workflow.

## Files & data already in place

- Video: `public/assets/heyjoe/hjoe.mp4`.
- Score: parsed by `src/parsers/sco.ts` as `Score` (header,
  `bars: number[]`, `events: Event[]`).
- TabScroller (`src/components/TabScroller.ts`) renders the strip,
  handles cursor, drag, click-to-seek. It already computes `fps`
  internally and tracks `viewportOffset`.
- Side panel: NOW/NEXT chord previews + 11 chord buttons.
- Layout (body grid rows): `header / main / tabstrip`.

## Goal of this phase

A new playback-control bar sits **between the main row (video + side
panel) and the tab strip**. It contains:

```
┌──────────────────────────────────────────────────────────────────┐
│  Speed: ━━●━━━ 1.0×    [A bar 3]   [B bar 7]   [⟲ Loop]   [✕]   │
└──────────────────────────────────────────────────────────────────┘
```

- **Speed slider**: range 0.25 → 1.5, step 0.05, default 1.0.
- **Speed numeric**: shows current rate (e.g. `1.0×`, `0.5×`).
- **A button**: clicking sets marker A to the bar-marker pixel
  closest to the current playhead frame. Label shows the bar
  number (1-indexed): "A bar 3" or "A —" if unset.
- **B button**: same for marker B.
- **Loop button**: toggle on/off. Visible state: filled background +
  text "Loop ON" when active. Disabled (greyed) if either A or B is
  unset, or A >= B.
- **Clear button (✕)**: clears both A and B and turns Loop off.

Tab strip gets two new vertical markers:
- **A line**: vertical line at A's pixel, colour `#ff9900` (orange),
  3 px wide.
- **B line**: vertical line at B's pixel, colour `#ff00aa` (magenta),
  3 px wide.
- **Loop region overlay**: semi-transparent fill between A and B,
  `rgba(255, 153, 0, 0.12)`. Overlay sits behind bar markers and
  events but above the score image.

Loop logic: while looping is on, playback that crosses B time
immediately seeks back to A time. Implementation uses
`video.timeupdate` plus an extra check on each `requestAnimationFrame`
to keep the loop tight (timeupdate fires only ~4 Hz; RAF gives <100 ms
overshoot at most).

## Layout & DOM changes

### `index.html`

Add a new `<div id="playback-controls">` between `</main>` and the
`<div id="tab-row">`:

```html
<div id="playback-controls">
  <label class="speed-control">
    <span class="ctrl-label">Speed</span>
    <input id="speed-slider" type="range" min="0.25" max="1.5" step="0.05" value="1" />
    <span id="speed-value" class="speed-value">1.00×</span>
  </label>
  <div class="loop-controls">
    <button id="ab-a" type="button" class="ab-btn">A —</button>
    <button id="ab-b" type="button" class="ab-btn">B —</button>
    <button id="loop-toggle" type="button" class="loop-btn" disabled>⟲ Loop</button>
    <button id="loop-clear" type="button" class="loop-clear" title="Clear A/B">✕</button>
  </div>
</div>
```

### `styles.css`

- Body grid becomes 4 rows:
  `grid-template-rows: auto 1fr auto auto;`
  `grid-template-areas: "header" "main" "playback" "tabstrip";`
- New `#playback-controls` grid-area: `playback`. Height: ~44 px.
  Background `#0a0a0a`, top + bottom border `1px solid var(--border)`.
  `display: flex; align-items: center; gap: 12px; padding: 0 16px;`
  `min-width: 0;`. `font-size: 0.85rem;`.
- `.speed-control`: `display: flex; align-items: center; gap: 8px;`
  `flex: 1; max-width: 360px;`. The `<input type="range">` should
  flex-grow to fill available space (`flex: 1`).
- `.speed-value`: monospace, fixed width (`min-width: 3.5em;
  text-align: right;`).
- `.loop-controls`: `display: flex; align-items: center; gap: 6px;
  margin-left: auto;`.
- `.ab-btn`, `.loop-btn`, `.loop-clear`: same base styles as
  `.chord-btn` from prior phases (`padding: 6px 10px`, dark bg,
  border, font 0.85rem). The clear button is square (`width: 28px;
  padding: 0;`).
- `.ab-btn` colour stripe: when A is set, give the A button a 3 px
  left border in `#ff9900`; same idea for B in `#ff00aa`. Use
  inline style or a `.set` class with CSS that targets the right
  colour.
- `.loop-btn[data-on="true"]`: distinct background (e.g.
  `background: #4a8; color: #111`).
- `.loop-btn[disabled]`: `opacity: 0.5; cursor: not-allowed;`.
- Tab strip A/B markers (inside `.tab-strip`):
  `.ab-marker` base: `position: absolute; top: 0; bottom: 0; width: 3px;
   pointer-events: none; z-index: 2;`.
  `.ab-marker.a` colour `#ff9900`. `.ab-marker.b` colour `#ff00aa`.
- Loop region overlay (inside `.tab-strip`):
  `.loop-region`: `position: absolute; top: 0; bottom: 0;
   background: rgba(255, 153, 0, 0.12); pointer-events: none;
   z-index: 1;`.

### Layout fit verification

Adding ~44 px of playback controls slightly reduces the height
available to the main row. Verify it still fits without page scroll
in a typical 800 px tall viewport: video pane should still show its
controls, side panel should still fit NOW/NEXT and chord buttons.

## Code changes

### `src/playback/sync.ts` (new)

A small shared helper, used by TabScroller, the loop logic, and the
A/B button handlers. Avoids duplicating the pixel↔time math.

```ts
import type { Score, Event } from "../parsers/sco.js";

export class ScoreSync {
  constructor(private score: Score, private video: HTMLVideoElement) {}

  get fps(): number | null {
    if (!this.video.duration || isNaN(this.video.duration)) return null;
    return this.score.endingFrame / this.video.duration;
  }

  /** Seconds → source pixel (interpolated through events). */
  timeToPixel(time: number): number {
    const fps = this.fps;
    if (fps === null) return this.score.startingPixel;
    return this.frameToPixel(time * fps);
  }

  /** Source pixel → seconds. */
  pixelToTime(pixel: number): number {
    const fps = this.fps;
    if (fps === null) return 0;
    return this.pixelToFrame(pixel) / fps;
  }

  /** Find bar pixel closest to a source pixel. Returns the bar pixel + its 1-indexed bar number. */
  nearestBar(pixel: number): { pixel: number; index: number } | null {
    const bars = this.score.bars;
    if (bars.length === 0) return null;
    let best = 0;
    let bestDist = Math.abs(bars[0]! - pixel);
    for (let i = 1; i < bars.length; i++) {
      const d = Math.abs(bars[i]! - pixel);
      if (d < bestDist) { best = i; bestDist = d; }
    }
    return { pixel: bars[best]!, index: best + 1 };
  }

  // Internal: binary-search events.
  private frameToPixel(frame: number): number {
    const events = this.score.events;
    if (events.length === 0) return this.score.startingPixel;
    if (frame <= events[0]!.frame) return events[0]!.pixel;
    if (frame >= events[events.length - 1]!.frame) return events[events.length - 1]!.pixel;
    let lo = 0, hi = events.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (events[mid]!.frame <= frame) lo = mid; else hi = mid - 1;
    }
    const cur = events[lo]!;
    const next = events[lo + 1]!;
    const t = (frame - cur.frame) / (next.frame - cur.frame || 1);
    return cur.pixel + t * (next.pixel - cur.pixel);
  }

  private pixelToFrame(pixel: number): number {
    const events = this.score.events;
    if (events.length === 0) return 0;
    // Find event with nearest pixel ≤ target. Bars are sorted by frame, but
    // not strictly by pixel — use linear scan (cheap, 534 events).
    let bestIdx = 0;
    let bestDist = Math.abs(events[0]!.pixel - pixel);
    for (let i = 1; i < events.length; i++) {
      const d = Math.abs(events[i]!.pixel - pixel);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return events[bestIdx]!.frame;
  }
}
```

Use this in TabScroller (replace its internal fps/interpolate
methods if you want, or leave TabScroller alone and only use ScoreSync
in main.ts/loop logic — your judgement). **If you refactor TabScroller
to use ScoreSync, ensure all Phase 2/2b/2c behaviour stays intact.**
Easiest path: leave TabScroller's internal helpers alone, just add
ScoreSync as an extra utility for the new code.

### `src/main.ts`

Add the speed control, A/B logic, and loop logic.

**Speed control:**
```
const speedSlider = document.getElementById("speed-slider") as HTMLInputElement;
const speedValue = document.getElementById("speed-value") as HTMLElement;

const SPEED_KEY = "playback-rate";
const savedRate = parseFloat(localStorage.getItem(SPEED_KEY) ?? "1");
const initialRate = isFinite(savedRate) && savedRate >= 0.25 && savedRate <= 1.5 ? savedRate : 1;

function applyRate(r: number) {
  video.playbackRate = r;
  // preserve pitch — modern API + Safari fallback
  (video as any).preservesPitch = true;
  (video as any).webkitPreservesPitch = true;
  speedSlider.value = String(r);
  speedValue.textContent = r.toFixed(2) + "×";
  localStorage.setItem(SPEED_KEY, String(r));
}
applyRate(initialRate);
speedSlider.addEventListener("input", () => applyRate(parseFloat(speedSlider.value)));
```

**A/B Loop:**

State: `let aPixel: number | null = null; let bPixel: number | null = null; let loopOn = false;`

Helpers (use ScoreSync `sync`):
```
function setAtCurrent(which: "a" | "b") {
  const currentTime = video.currentTime;
  const pixel = sync.timeToPixel(currentTime);
  const nearest = sync.nearestBar(pixel);
  if (!nearest) return;
  if (which === "a") aPixel = nearest.pixel; else bPixel = nearest.pixel;
  updateMarkersUI();
}
function clearAB() { aPixel = bPixel = null; loopOn = false; updateMarkersUI(); }
function toggleLoop() { loopOn = !loopOn; updateMarkersUI(); }

function updateMarkersUI() {
  // Update buttons (label "A bar N" or "A —", set/unset class)
  // Update Loop button enabled/disabled (need both A and B and A < B in pixel terms)
  // Re-render markers on tab strip via tabScroller.setLoop({a, b, on})
}
```

**Tab strip integration:**

Extend TabScroller with a method:
```
setLoop(opts: { a: number | null; b: number | null; on: boolean }): void
```
which (re)renders the A and B markers + region overlay inside
`.tab-strip`. Idempotent: removes previous markers each time.

**Loop enforcement:**

Two-tier check:
- `video.timeupdate` → `if (loopOn && a/b set && currentTime >= timeOfB) currentTime = timeOfA`.
- Also inside TabScroller's RAF loop (or a separate small RAF loop in
  main.ts) → same check, more frequent (RAF ~60 Hz). Pick one place to
  own the check; recommend a small dedicated RAF loop in main.ts so
  TabScroller stays focused.

Use the same `sync.pixelToTime(aPixel)` and `sync.pixelToTime(bPixel)`
to compute target times each tick (cheap).

Edge: when looping, after seeking to A-time, re-fire any related
state updates if needed (none, in current code paths).

## What NOT to do

- ❌ Multiple named loops ("save my favourite practice spots") — Phase 8.
- ❌ Drag the A/B markers on the tab strip to reposition — Phase 8.
- ❌ Persist A/B between page reloads — they are scenario-local.
- ❌ Beat-locked loop (snap to bar BOUNDARIES on time, not just pixel) —
  current bar-pixel-snap is enough.
- ❌ Keyboard shortcuts — Phase 8.

## Definition of Done

- [ ] `src/playback/sync.ts` exists, exports `ScoreSync`.
- [ ] `index.html` has `<div id="playback-controls">` with speed
      slider, A/B buttons, Loop toggle, Clear button.
- [ ] Body grid layout has 4 rows (`header`, `main`, `playback`,
      `tabstrip`); page still fits typical 800 px viewport without
      scrollbars on body.
- [ ] Speed slider 0.25–1.5 works; pitch preserved (verify by ear at
      0.5×); persists to localStorage; restored on page reload.
- [ ] A button → A pixel set to bar nearest current playhead; orange
      vertical line appears on tab strip at that pixel; button label
      becomes "A bar N".
- [ ] B button → same with magenta + "B bar N".
- [ ] Region overlay (semi-transparent orange) renders between A and B.
- [ ] Loop button is disabled until both A and B are set AND A.pixel < B.pixel.
- [ ] When Loop is ON: playback past B time immediately jumps back
      to A time; gap ≤ 100 ms; works at any playbackRate.
- [ ] Clear button: removes A, B, region, turns Loop off, button
      labels reset to "A —" / "B —".
- [ ] All Phase 2/2b/2c behaviour intact: video controls visible,
      page-flip scroll works, NOW/NEXT updates, drag-to-pan, click-to-seek,
      side panel chord buttons.
- [ ] No errors / warnings in browser console during normal use.
- [ ] `git status` clean; commit message starts `phase 3:`.

## Demo (mandatory — verbatim in your final report)

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/
4. New visual: between the video/panel row and the tab strip there is
   a horizontal control bar with:
   - "Speed" label, slider (centred at 1.0), "1.00×" value
   - "A —" button, "B —" button, "⟲ Loop" button (greyed), "✕"
5. Press play. Drag the speed slider down to ~0.50:
   - Speed value text updates to "0.50×".
   - Video plays at half speed; pitch (voice/guitar tone) stays the
     same — no chipmunk effect, no octave drop.
6. Pause. Seek to early bar (e.g. by clicking a point on the tab
   near the start). Click "A —":
   - Button changes to "A bar 3" (or whatever bar). Orange vertical
     line appears on the tab strip at that bar.
7. Seek a few bars later. Click "B —":
   - Button: "B bar 7" with magenta line + orange-tinted region
     between A and B on the tab strip.
8. Click "⟲ Loop":
   - Button highlights (Loop ON state).
9. Press play:
   - Playback runs from current position. When it crosses bar 7 time,
     it instantly jumps back to bar 3 time. Tab strip and NOW/NEXT
     update accordingly.
   - At 0.5× speed: same loop, just slower.
10. Click Loop again to turn it off → playback continues normally.
11. Click "✕": A, B, region disappear; Loop reverts to disabled.
12. Reload the page (Cmd+R):
    - Speed slider sits at 0.50 (persisted).
    - A/B and Loop are reset (intentionally not persisted).
13. Set speed back to 1.0 by dragging slider; check "1.00×" displays.
14. Stop the dev server.
```

## Reporting

Final report (≤350 words):
1. Demo block, verbatim, first.
2. What was built (≤8 bullets).
3. Files touched.
4. **Pitch-preserve verification**: confirm you tested 0.5× by ear (or
   note that the API was wired but you couldn't hear it — Sonnet doesn't
   have audio, so this can be flagged for the user to verify in the demo).
5. Deviations from spec, with reason. "None" if you stuck to it.
6. Known issues / TODOs deferred.
