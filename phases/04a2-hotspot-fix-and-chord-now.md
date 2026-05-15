# Phase 4a-2 — Hotspot Click Fix + Chord-Click NOW Override

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> Two small fixes to Phase 4a output.

## Context

Personal-use web app for learning guitar. Stack: Vite + TypeScript +
vanilla DOM. Working directory: `/Users/apetrochenko/src/guitar/`.

Read in order:
1. `../SPEC.md` — original CD data formats; §3.4 (SCO) covers
   `[difficulty]`.
2. `../ROADMAP.md` — overall plan.
3. `phases/04a-hotspots-and-chord-fix.md` — Phase 4a, the immediate
   predecessor. The hotspot rendering already works; the click
   handling has a bug fixed in this phase.
4. Other prior phase specs as needed.

State:
- 41 difficulty hotspots render correctly on the tab strip.
- The spec said "click a hotspot should call `onDifficultyClick` and
  NOT seek the video", but the implementation only added
  `event.stopPropagation()` on the hotspot's `click` listener — the
  seek-on-click logic lives in the viewport's `mouseup` handler,
  which fires **before** `click`. So `stopPropagation` is too late.
  Currently both the hotspot callback AND the video seek run.
- Chord-buttons are correctly disabled during playback. On pause,
  clicking plays the WAV but does NOT show the diagram. The user
  wants the diagram to appear in NOW.

## Issue 1 — Hotspot click also seeks video

### Root cause

`TabScroller` handles click-vs-drag in mouse-up:
```ts
viewport.addEventListener("mousedown", e => { startX = e.clientX; ...});
window  .addEventListener("mousemove", e => { ... track delta ...});
window  .addEventListener("mouseup",   e => {
  if (Math.abs(deltaTotal) < 4) {
    // treat as click → seek video
    seekVideoToPixel(...);
  }
});
```

Hotspots are inside `.tab-strip` (inside `.tab-viewport`). When the
user clicks a hotspot, mousedown bubbles to the viewport, mousemove
records ~0 movement, mouseup decides "click" and seeks. The hotspot's
own `click` handler runs after — too late.

### Fix

Add a check in TabScroller's mousedown/mouseup logic for the
hotspot case:

1. In the viewport `mousedown` handler, store `mousedownTarget = e.target as HTMLElement`.
2. In the viewport `mouseup` handler, after determining "click vs drag":
   - If it's a click (delta < 4 px): inspect `mousedownTarget.closest(".difficulty-hotspot")`:
     - If non-null: read `data-exercice` (parseInt) and `data-sound`
       (string) from that element, call `onDifficultyClick(exercice, sound)`,
       and do **NOT** seek.
     - If null (i.e. clicked empty strip): seek as before.
   - If it's a drag: do nothing extra (drag already happened).

3. Remove the `click` listener and the `stopPropagation` call from
   inside `setDifficulties()`. Hotspots no longer need their own
   click listener — the viewport's mouseup handler does the dispatch.

This preserves drag-from-hotspot: the user can mousedown on a
hotspot and drag-pan, because the drag logic is unchanged. Only the
click case dispatches differently based on what was clicked.

### Optional cleanup

The hotspot still needs `cursor: pointer` so the user knows it's
interactive. Keep that.

## Issue 2 — Chord button on pause should show diagram in NOW

### Behaviour

When the video is paused and the user clicks an All-chords button
(e.g. `C₃`):

1. Play the chord's sample (existing behaviour — unchanged).
2. Update the **NOW preview** in the side panel to show this chord
   (name + diagram, with the chord's `rgbHighlight` border).
3. Don't touch NEXT — leave whatever is there (it gets overwritten on
   the next playback tick anyway).
4. No need for explicit "manual mode" state — the next time playback
   advances and `TabScroller.onChordsChange` fires, it will set NOW
   to the playback-driven chord, overriding the manual click. This
   gives the right UX: paused → click chord → see it; play → cursor
   resumes driving NOW.

### Implementation

In `main.ts`, find the All-chords button click handler. Currently:
```ts
btn.addEventListener("click", () => playSample(WAV_BASE + chord.sound));
```

Change to:
```ts
btn.addEventListener("click", () => {
  playSample(WAV_BASE + chord.sound);
  // Show this chord in NOW preview (overridden on next playback tick).
  renderPreviews({ current: chord.id, next: lastNextChordId });
});
```

Where `lastNextChordId` is a tracked state (you may already have it
or can derive). If you have `renderPreviews` that takes
`(currentId, nextId)` — re-use it; just preserve whatever NEXT
currently shows.

Implementation hint: keep two module-scope vars:
```ts
let lastCurrentChord: number | null = null;
let lastNextChord: number | null = null;
```
Update them in `onChordsChange`. Then on chord-button click:
`renderPreviews(chord.id, lastNextChord)` and update `lastCurrentChord = chord.id`.

The chord-button-disable while playing rule already prevents clicks
during play, so the manual override is paused-only.

## What NOT to change

- TabScroller core logic (RAF loop, page-flip, A/B markers, viewport
  drag).
- ScoreSync.
- Parsers (INI, CHD, SCO).
- Existing styles for chord buttons; the disable styling is already in.

## Definition of Done

- [ ] Click a hotspot → only the `onDifficultyClick` callback fires
      (logged to console). Video does NOT seek.
- [ ] Click empty area of tab strip → video seeks (unchanged).
- [ ] Drag from on a hotspot → still pans the strip (no seek).
- [ ] Click drag, release, no-movement-on-hotspot → callback fires,
      no seek.
- [ ] Click a chord button while paused → sample plays AND NOW
      preview updates to that chord (name + diagram with rgbHighlight
      border).
- [ ] On play, first chord-change event in playback overrides NOW
      back to the actual playback chord.
- [ ] Chord buttons remain disabled during playback (Phase 4a behaviour).
- [ ] All prior phase features intact.
- [ ] No console errors / warnings.
- [ ] `git status` clean; commit message starts `phase 4a-2:`.

## Demo (mandatory — verbatim in your final report)

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/
4. Open DevTools Console (Cmd+Option+J).
5. Click a coloured hotspot:
   - Console shows "[hotspot] Open exercise N (sound: ...)".
   - Video stays at the same position (does NOT seek to where you
     clicked).
6. Click an empty area of the tab strip (between hotspots):
   - Video seeks to that position.
7. With video paused, click chord button "C₃":
   - Sample plays.
   - NOW preview updates: name "C₃", diagram from heyjoe2.png with
     the chord's red border.
   - NEXT preview unchanged.
8. Click chord button "G₃":
   - NOW updates to G₃ with diagram. Sample plays.
9. Press play:
   - As soon as the playback advances to a chord-change event, NOW
     reverts to the actual current chord; manual override is gone.
10. Pause again. Try clicking a chord while playing (should be
    impossible — buttons are greyed). Confirm no regression.
11. Stop the dev server.
```

## Reporting

Final report (≤300 words):
1. Demo block, verbatim, first.
2. What was changed (≤5 bullets).
3. Files touched.
4. Deviations from spec, with reason. "None" if you stuck to it.
5. Known issues / TODOs deferred.
