# Phase 4a — Difficulty Hotspots Overlay + Chord-Button Pause Fix

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> Two changes in this phase:
> 1. Render the [difficulty] hotspots from the SCO file as colored
>    overlays on the tab strip, hover/click hooks for future Phase 4b.
> 2. Disable the All-chords sample buttons while the video is playing
>    (re-enable when paused).

## Context

Personal-use web app for learning guitar from a 1995 Ubi Soft CD.
Stack: Vite + TypeScript + vanilla DOM. Working directory:
`/Users/apetrochenko/src/guitar/`.

Read in order:
1. `../SPEC.md` — original CD data formats. **§3.4 (SCO file)** is the
   most relevant: `[difficulty]` blocks contain `rect=x1,y1,x2,y2`,
   `index=N`, `color=R,G,B`, `exercice=N`, `sound=path`.
2. `../ROADMAP.md` — overall plan; you only do Phase 4a.
3. Prior phase specs `00`, `01`, `02`, `02b`, `02c`, `03`, `03b`, `03c`.

State of the project:
- SCO is already parsed. `score.difficulties: Difficulty[]` is
  populated with all 41 entries for Hey Joe; just unused so far.
- TabScroller renders score image + bar markers + cursor + A/B + loop
  region. It exposes `setLoop({a, b, on})` for A/B updates.
- Side panel has NOW/NEXT and an "All chords" row of 11 buttons.
- Speed slider, presets, Loop here, all hotkeys work.

Goals of Phase 4a:
- Surface the 41 difficulty regions visually so the user can see at a
  glance where the hard passages are.
- Set up the hover affordance + click hook for Phase 4b (which will
  open the related exercise).
- Quick UX fix: stop chord-button samples from playing on top of the
  song.

## Issue 1 — Difficulty hotspots overlay

### Data

`score.difficulties: Difficulty[]` from `src/parsers/sco.ts` —
each item has:
- `rect: { x, y, w, h }` — in source-pixel coordinates of the tab
  strip (same coordinate system as bar pixels and event pixels).
- `index: number` — internal ordering (ignore).
- `color: [r, g, b]` — RGB suggested colour for the highlight.
- `exercice: number` — which Hey Joe exercise this difficulty maps to
  (1..16). For Phase 4a we just store this in the dataset; click
  handler can `console.log("would open exercise N")` for now.
- `sound: string` — voice-over WAV path with `%s` macro
  (e.g. `..\exercice\0\%sex4-tit.wav`); Phase 4a only stores it.

### Rendering

Add a new method to `src/components/TabScroller.ts`:

```ts
setDifficulties(items: Difficulty[]): void
```

- Idempotent: removes any previously rendered `.difficulty-hotspot`
  elements before re-creating.
- For each `item`:
  - Create `<div class="difficulty-hotspot">` inside `.tab-strip`.
  - Position absolutely: `left: rect.x + "px"`, `top: rect.y + "px"`,
    `width: rect.w + "px"`, `height: rect.h + "px"`.
  - Background colour: `rgba(R, G, B, 0.20)` — semi-transparent fill
    using the parsed colour.
  - Border: `1px solid rgba(R, G, B, 0.65)` — slightly opaque rim.
  - `z-index: 1` (below bar markers and A/B lines, above the score
    image).
  - `pointer-events: auto` so the user can click them.
  - `cursor: pointer`.
  - `data-exercice="N"` attribute for the click handler.
  - `title` attribute: `"Hard passage → exercise N (click to open)"`.

### Click + hover

- Hover: native `title` tooltip is enough for Phase 4a — no extra
  element needed.
- Click: `tabScroller` exposes a callback `onDifficultyClick?:
  (exercice: number, sound: string) => void` set by main.ts. For
  Phase 4a, the handler in main.ts just `console.log(\`Open exercise
  ${ex} (sound: ${sound})\`)`. The actual exercise-opening flow comes
  in Phase 4b.

### Click priority

Difficulty hotspots are inside `.tab-strip`. The tab strip already
has a click-to-seek handler at the viewport level. Make sure clicking
on a hotspot does NOT also seek the video — call `event.stopPropagation()`
in the hotspot click handler.

The tab-strip drag handler (mousedown/mousemove/mouseup) should still
work *underneath* hotspots — i.e. you can start a drag with the mouse
down on a hotspot. Easiest: put hotspots' `pointer-events: auto` only
on the click step but leave drag working. Practically: just set
`pointer-events: auto` and let click bubble — but call `stopPropagation`
inside the hotspot's click listener so the seek logic doesn't fire.

If you find drag stops working because hotspots intercept mousedown,
the cleanest fix is: keep `pointer-events: auto` on hotspots, but
re-implement drag detection using the existing handlers on
`.tab-viewport` (which already attached mousedown). The events from
hotspots should bubble. The drag's mouse-up logic distinguishes
click vs drag by deltaX < 4 px — clicks land on whatever element was
clicked first. Just make sure hotspot click handlers fire before
seek-on-click happens.

### Wiring

In `src/main.ts`, after the score loads, call:
```ts
tabScroller.setDifficulties(score.difficulties);
```

Provide the click callback:
```ts
new TabScroller(tabRow, {
  ...,
  onDifficultyClick: (exercice, sound) => {
    console.log(`[hotspot] Open exercise ${exercice} (sound: ${sound})`);
  },
});
```

## Issue 2 — Chord-button sample disable during playback

The All-chords row (`#all-chords` div, 11 `.chord-btn`) currently
plays a sample on click regardless of video state. The user wants:

- While `video.paused === false`: the buttons are visually disabled
  (lower opacity, `cursor: not-allowed`) and clicks do nothing.
- While `video.paused === true`: the buttons work as before.

Implementation:

- Listen to `video` for `play` and `pause` events; on each, toggle a
  CSS class on `#all-chords` (e.g. `.playing`).
- CSS: `.all-chords.playing .chord-btn { opacity: 0.45; pointer-events: none; cursor: not-allowed; }`
  (`pointer-events: none` makes click handlers no-op without
  per-button checks).
- Verify on initial load: video starts paused, so buttons should be
  enabled.
- Verify on a `seeked` while paused: still paused, still enabled.

Don't disable any other UI: A/B buttons, Loop, Loop here, presets,
slider, hotkeys all stay live during playback.

## Definition of Done

- [ ] `TabScroller.setDifficulties(items)` exists and renders 41
      hotspot rectangles for Hey Joe.
- [ ] Each hotspot uses its parsed `color` for background (alpha 0.20)
      and border (alpha 0.65).
- [ ] Hovering a hotspot shows a native tooltip with the exercise
      number.
- [ ] Clicking a hotspot fires the `onDifficultyClick` callback;
      the seek-on-click does NOT also fire (hotspot handler stops
      propagation).
- [ ] Drag-pan still works on the tab strip (start drag on or off a
      hotspot — same behaviour).
- [ ] Click on empty area of strip still seeks the video as before.
- [ ] Bar markers, A/B markers, loop region, cursor still render
      correctly above hotspots (z-order: hotspots z=1, bar markers
      z=auto inside strip but below A/B which is z=2; verify visually).
- [ ] All-chords buttons greyed and unclickable while video is
      playing; clickable when paused.
- [ ] No regressions in any prior phase: speed/loop/hotkeys/NOW-NEXT/
      page-flip/no-vertical-scroll all work.
- [ ] No errors / warnings in browser console.
- [ ] `git status` clean; commit message starts `phase 4a:`.

## Demo (mandatory — verbatim in your final report)

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/
4. Tab strip now has visible coloured rectangles overlaid on the
   score — these are the 41 "hard passage" hotspots from the SCO
   data. They are mostly orange/yellow/blue tinted and stay anchored
   to the strip when you drag-pan.
5. Hover over any hotspot:
   - Native tooltip shows "Hard passage → exercise N (click to open)".
6. Click a hotspot:
   - Open the browser DevTools Console (Cmd+Option+J).
   - You should see a log line: "[hotspot] Open exercise N (sound: ...)".
   - Video does NOT seek.
7. Click the empty area of the tab strip (not on a hotspot):
   - Video seeks to that position as before.
8. Drag the strip left/right (mouse-down anywhere, drag, release):
   - Strip pans; video does not seek; hotspots move with the strip.
9. All-chords row (in side panel):
   - With video paused: click "C" → sample plays.
   - Press play. Try clicking "C" → button is greyed out, cursor is
     not-allowed, no sample plays.
   - Press pause. Try "C" again → works normally.
10. Verify Phase 3b/3c features still work: hotkeys (Space, [, ],
    Shift+[, Shift+], L, C), speed presets, "Loop here", chord names
    in subscript notation.
11. Stop the dev server.
```

## Reporting

Final report (≤300 words):
1. Demo block, verbatim, first.
2. What was built (≤6 bullets).
3. Files touched.
4. Deviations from spec, with reason. "None" if you stuck to it.
5. Known issues / TODOs deferred.
