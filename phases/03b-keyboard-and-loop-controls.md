# Phase 3b — Keyboard Shortcuts + Speed Presets + Loop Here

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> Adds keyboard hotkeys, speed preset buttons, and a one-click
> "Loop here" feature on top of Phase 3.

## Context

Personal-use web app for learning guitar from a 1995 Ubi Soft CD.
Stack: Vite + TypeScript + vanilla DOM. Working directory:
`/Users/apetrochenko/src/guitar/`.

Read in order:
1. `../SPEC.md` — original CD data formats; §3.4 (SCO) is relevant.
2. `../ROADMAP.md` — overall plan.
3. All prior phase specs in `phases/` — `00`, `01`, `02`, `02b`, `02c`, `03`.

This phase extends Phase 3 (slow-down + A↔B loop). Phase 3 is fully
working — speed slider, A/B markers on tab strip, loop enforcement at
~60 Hz. Don't break any of it.

## Goal

Practical hands-on-keyboard practice workflow:
- **Space** → play/pause without taking hands off the keyboard.
- **`[` and `]`** → expand/shrink loop boundaries in 1-bar steps.
- **Speed preset buttons** → 0.5×, 0.75×, 1× without dragging slider.
- **"Loop here" button** → one click sets a 1-bar loop at the cursor's
  current position and turns Loop on. Keyboard then expands it.

## Detailed behaviour

### Keyboard shortcuts (use `event.code`, not `event.key`, so they're
keyboard-layout-independent — they must work on Russian layout where
`[`/`]` are physically `х`/`ъ`)

| Code              | Action                                                    |
| ----------------- | --------------------------------------------------------- |
| `Space`           | toggle `video.paused` ↔ playing                           |
| `BracketLeft`     | A pixel: move 1 bar **toward start** (A ← earlier)        |
| `BracketRight`    | B pixel: move 1 bar **toward end** (B → later)            |
| `Shift+BracketLeft`  | A pixel: move 1 bar **toward end** (A → later, shrink loop) |
| `Shift+BracketRight` | B pixel: move 1 bar **toward start** (B ← earlier, shrink loop) |
| `KeyL`            | toggle Loop on/off (only if both A and B are set and A < B) |
| `KeyC`            | clear A/B + turn loop off (same as ✕ button)              |
| `ArrowLeft`       | seek `video.currentTime -= 5`                             |
| `ArrowRight`      | seek `video.currentTime += 5`                             |
| `Shift+ArrowLeft` | seek to **previous bar** (nearest bar pixel < currentPixel) |
| `Shift+ArrowRight`| seek to **next bar** (nearest bar pixel > currentPixel)   |

**Global rule:** these hotkeys are **disabled** when the focus is on
an `<input>`, `<textarea>`, `<select>`, or any element with
`contenteditable`. (Necessary so a future settings panel doesn't
swallow keypresses.) Implementation:
```ts
function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}
```

For all action keys above, `e.preventDefault()` to avoid browser
default behaviour (Space scrolling the page, Arrow keys scrolling, etc.).

### `[`/`]` behaviour when A or B is unset

- If `[` is pressed and A is unset → first press sets A to the bar
  nearest the current cursor pixel. Subsequent presses move A by 1
  bar each.
- If `]` is pressed and B is unset → first press sets B to the bar
  nearest the current cursor pixel. Then move by 1 bar each press.
- This makes the keys feel intuitive — first press primes, then
  expand.

### `[`/`]` magnitude and clamping

- Each press shifts by **one bar pixel** (i.e. find the next entry
  in `score.bars` in the requested direction; jump to it).
- Clamp:
  - A pixel ≥ `score.startingPixel` (clamped at left edge of song)
  - B pixel ≤ `score.endingPixel` (clamped at right edge)
  - A pixel must remain `< B pixel` if B is set; if a Shift-press
    would invert the order, refuse it (leave A or B at adjacent bar
    to the other).
- After updating, re-render markers (call `tabScroller.setLoop(...)`
  with the new state) and refresh the button labels.

### Speed presets

Three buttons next to the slider: **0.5×**, **0.75×**, **1×**.
- Each click calls the existing `applyRate(N)` (which sets
  `video.playbackRate`, both `preservesPitch` flags, slider value,
  text display, and `localStorage`).
- Visual: the preset matching the current rate has a distinct active
  background (e.g. same accent as Loop ON). When the user drags the
  slider away, the preset deactivates.
- Implementation: after every rate change, call
  `updatePresetActive(rate)` that toggles a `.active` class on the
  matching preset (or none if rate isn't exactly 0.5/0.75/1.0).

### "Loop here" button

A new button next to the A/B controls. Label: "🔁 Loop here".
On click:
1. Compute current cursor pixel = `sync.timeToPixel(video.currentTime)`.
2. `nearest = sync.nearestBar(currentPixel)`.
3. Find next bar after `nearest`: `nextBarPx = score.bars[nearest.index]`
   (note: `nearest.index` is 1-indexed, so this is the bar after).
   If no next bar (we are at the song's last bar), use
   `score.endingPixel` as B.
4. Set A = `nearest.pixel`, B = `nextBarPx`.
5. Turn Loop on.
6. Update markers + button labels.

If video is paused, leave it paused. If playing, leave it playing.
The user can then expand with `]` or contract with `Shift+]`.

### Layout — playback control bar

Updated DOM inside `#playback-controls`:

```html
<div id="playback-controls">
  <label class="speed-control">
    <span class="ctrl-label">Speed</span>
    <input id="speed-slider" type="range" min="0.25" max="1.5" step="0.05" value="1" />
    <span id="speed-value" class="speed-value">1.00×</span>
    <div class="speed-presets">
      <button id="preset-50"  type="button" class="preset-btn">0.5×</button>
      <button id="preset-75"  type="button" class="preset-btn">0.75×</button>
      <button id="preset-100" type="button" class="preset-btn">1×</button>
    </div>
  </label>
  <div class="loop-controls">
    <button id="loop-here"   type="button" class="loop-here-btn">🔁 Loop here</button>
    <button id="ab-a"        type="button" class="ab-btn">A —</button>
    <button id="ab-b"        type="button" class="ab-btn">B —</button>
    <button id="loop-toggle" type="button" class="loop-btn" disabled>⟲ Loop</button>
    <button id="loop-clear"  type="button" class="loop-clear" title="Clear A/B (C)">✕</button>
  </div>
</div>
```

CSS:
- `.speed-presets`: `display: flex; gap: 4px; margin-left: 8px;`.
- `.preset-btn`: same base as `.chord-btn`, smaller padding
  (`padding: 4px 8px; font-size: 0.78rem;`). `.preset-btn.active`:
  same accent background as Loop ON.
- `.loop-here-btn`: same base as `.ab-btn`. Slightly emphasised
  background to invite use (`background: var(--btn-bg); border-color:
  #5a5;`) — not too loud.

If the bar gets crowded on narrow viewports, allow `flex-wrap: wrap`
on `#playback-controls` and don't enforce a fixed height — let it grow
to two rows when needed. Verify the page still fits viewport at
≤1100 px wide; if not, that's acceptable for this phase but flag in
the report.

Add to button titles (tooltips) the matching keyboard shortcut, e.g.
- `loop-toggle.title = "Toggle loop (L)"`.
- `loop-clear.title  = "Clear A/B (C)"`.
- `loop-here.title   = "Set 1-bar loop at cursor"`.
- `preset-50.title   = "Half speed"`. (or just leave default)

## Code changes

### `src/main.ts`

- Move all hotkey handling to a single `window.addEventListener("keydown", handleKey)` that early-exits on `isTypingTarget`.
- Implement `handleKey(e)` switch on `e.code` with shift handling.
- Helper `shiftLoopBoundary(which: "A"|"B", direction: -1|1)`:
  - if A or B is null and the user is "expanding" (`[` for A → -1, `]` for B → +1) → set to nearest bar (priming behaviour above).
  - else: walk `score.bars` to the next bar in the requested direction.
  - apply clamps.
  - call `updateMarkersUI()`.
- Helper `seekBars(direction: -1|1)`:
  - currentPixel = `sync.timeToPixel(video.currentTime)`.
  - find next bar in direction: search `score.bars` for the next entry.
  - `video.currentTime = sync.pixelToTime(targetBarPixel)`.

- Refactor: extract the `updateMarkersUI()` already in main.ts to also
  call `updatePresetActive(rate)` and refresh button labels for A/B.

### Tab strip rendering

No changes to `TabScroller.setLoop()` — it already idempotently
re-renders markers and overlay. Just call it whenever A/B/loop change.

### Don't change

- ScoreSync (`src/playback/sync.ts`)
- TabScroller internal logic (only the `setLoop` API is used)
- Parsers, audio, ChordDiagram

## Definition of Done

- [ ] Space toggles play/pause; works when the page is in focus and
      no input is focused.
- [ ] `[` moves A toward start by 1 bar (or sets A if unset). `]`
      moves B toward end (or sets B if unset). Both work on Russian
      layout (verify by checking that you bound `event.code`
      `BracketLeft`/`BracketRight`, not `event.key`).
- [ ] `Shift+[` moves A toward end (shrinks loop). `Shift+]` moves B
      toward start. Boundaries: A < B always; clamped to song range.
- [ ] L toggles Loop on/off; only works when both A and B set and
      A < B.
- [ ] C clears A and B and turns Loop off.
- [ ] Arrow Left/Right seek ±5 s. Shift+Arrow seek ±1 bar.
- [ ] Speed preset buttons 0.5×, 0.75×, 1× set the rate; matching
      preset visually active.
- [ ] Drag slider away from a preset deactivates the preset's
      `.active` style.
- [ ] "🔁 Loop here" button creates a 1-bar loop at the cursor and
      enables Loop. After clicking it, `]` expands B by 1 bar each
      press; `Shift+]` shrinks; `[` expands A.
- [ ] All Phase 3 behaviour intact (slow-down + manual A/B + loop).
- [ ] All Phase 2/2b/2c behaviour intact.
- [ ] No errors / warnings in browser console.
- [ ] `git status` clean; commit message starts `phase 3b:`.

## Demo (mandatory — verbatim in your final report)

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/
4. New visual elements in the playback bar:
   - Three preset buttons next to the slider: 0.5× / 0.75× / 1×
   - "🔁 Loop here" button before the A/B buttons
5. Click 0.5× preset:
   - Slider jumps to 0.5, "0.50×" displayed, 0.5× button highlighted.
6. Drag slider to ~0.65:
   - 0.5× preset deactivates (no preset active because rate isn't
     exactly any of 0.5/0.75/1).
7. Click 1× preset → slider snaps to 1.0, 1× active.
8. Press Space → video plays. Press Space again → pauses.
9. Press [ once → A button label becomes "A bar N" with orange
   line on tab strip at the nearest bar to cursor.
10. Press [ two more times → A jumps two bars further toward start.
11. Press ] once → B set to nearest bar after cursor; magenta line
    appears with orange tinted region between A and B.
12. Press ] twice → B moves two bars further toward end.
13. Press Shift+[ → A shifts one bar back toward end (shrinks loop
    from the left).
14. Press Shift+] → B shifts one bar toward start (shrinks loop
    from the right).
15. Press L → Loop ON. Press play. Video loops between A and B,
    obeying any active speed.
16. Press L → Loop OFF.
17. Press C → A, B, region clear; A and B button labels reset to
    "—".
18. Click "🔁 Loop here" → instant 1-bar loop at the current cursor
    position; Loop turns on automatically. Region visible on tab
    strip.
19. Press ArrowRight → video jumps +5 seconds.
20. Press Shift+ArrowRight → video jumps to next bar.
21. Test on Russian keyboard layout (if you can switch): press
    physical `х` key (which produces `[` on US) → it should still
    work because we listen on `event.code` not `event.key`.
22. Stop the dev server.
```

## Reporting

Final report (≤350 words):
1. Demo block, verbatim, first.
2. What was built (≤8 bullets).
3. Files touched.
4. Deviations from spec, with reason. "None" if you stuck to it.
5. Known issues / TODOs deferred.
