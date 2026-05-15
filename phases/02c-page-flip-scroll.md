# Phase 2c — Page-flip Tab Scroll + Video Controls Fix

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> Two small but important changes to Phase 2b output.

## Context

Read first:
1. `../SPEC.md` — original CD data formats; §3.4 (SCO) is relevant.
2. `../ROADMAP.md` — overall plan.
3. `00-asset-pipeline.md`, `01-mvp-hey-joe.md`, `02-tab-sync.md`,
   `02b-fixes-and-now-next.md` — what already exists.

This spec changes:
- `src/components/TabScroller.ts` — new scroll model.
- `src/styles.css` — fix video controls visibility.

Do NOT change parsers, audio, ChordDiagram, or main.ts public wiring
(except where strictly required for the new TabScroller API surface;
TabScroller's constructor signature can stay the same).

## Issue 1 — Video native controls are clipped

Currently `<video controls>` shows only the fullscreen and volume
buttons; the play/pause button, scrubber, and time are missing. Cause:
the video element renders at its natural responsive height (e.g.,
600 px for a 4:3 video at 800 px container width), but `#video-pane`
has `overflow: hidden` and a fixed grid-cell height that is **smaller**
than the natural video height — the bottom of the video element is
clipped, taking the controls with it.

**Fix:**
- Remove `overflow: hidden` from `#video-pane`.
- Change `#video-pane`:
  - `align-items: stretch` (was `flex-start`) so the video fills
    available height.
  - `height: 100%` and `min-height: 0`.
- Change `#video-pane video`:
  - `width: 100%; height: 100%; object-fit: contain;` (drop
    `max-height: 75vh` — height is now bounded by the grid cell).
  - This letterboxes the video inside the pane, ensures controls
    always appear at the bottom of the pane.
- Keep `body { height: 100vh; overflow: hidden }` and
  `#main { overflow: hidden }` from Phase 2b — the layout-fits-viewport
  guarantee should be preserved.

Verify by visiting the page: hover the video, all controls (play,
scrubber, time, volume, PIP if available, fullscreen) must be visible.

## Issue 2 — Tab scroll model: page-flip with stationary partition

Current model: cursor fixed at viewport centre; partition translates
under it during playback. The user wants Songsterr-style behaviour:
**partition stands still, cursor runs across the visible viewport**;
when the cursor reaches the right edge, the partition jumps left by
one "page" so the cursor restarts near the left edge.

Plus: **drag the partition with the mouse** to scroll back/forth
without seeking the video.

### Model

- `viewportOffset` — the source-pixel position of the partition's left
  edge in the viewport. Strip is rendered with
  `transform: translateX(-viewportOffset)px`.
- `targetPixel` — the source pixel that the cursor currently represents
  (computed from video's current time, as before).
- `cursorScreenX = targetPixel - viewportOffset` — where the cursor's
  visible vertical line sits within the viewport. Range:
  `[0, viewportWidth]` ideally.

### `viewportOffset` update rules

On each RAF tick (or seek event):

1. Compute `targetPixel` (existing logic — binary-search events,
   interpolate).
2. Compute `cursorScreenX = targetPixel - viewportOffset`.
3. **Auto-advance (cursor approaches right edge):** if `cursorScreenX >
   viewportWidth * 0.9`, set
   `viewportOffset = targetPixel - viewportWidth * 0.1`. This makes
   the cursor snap to the 10 % mark on the next "page". Use a CSS
   transition `transform 0.25s ease-out` on `.tab-strip` so the page
   shift is smooth, not jarring. Disable the transition during manual
   drag.
4. **Auto-recover (cursor moved off-screen left, e.g. user seeked
   back):** if `cursorScreenX < 0` or `cursorScreenX > viewportWidth`,
   set `viewportOffset = targetPixel - viewportWidth * 0.1`.
5. Clamp `viewportOffset` so the strip can't be scrolled past either
   end:
   `viewportOffset = clamp(viewportOffset,
     score.startingPixel - viewportWidth * 0.1,
     score.endingPixel - viewportWidth * 0.9)`
   (allow some slack at edges so the cursor is visible at song start
   and end).

### Cursor element

The cursor must now move within the viewport, not stay at
`left: 50%`. Update CSS:
```
.tab-cursor {
  position: absolute;
  top: 0; bottom: 0;
  left: 0; /* JS sets transform */
  width: 2px;
  background: rgba(74, 170, 136, 0.9);
  pointer-events: none;
  will-change: transform;
}
```
Apply `transform: translateX(${cursorScreenX}px)` from JS on every RAF
tick. Update the cursor's transform synchronously with the strip's
transform.

### Manual drag

- Mouse-down on `.tab-viewport` starts a drag.
- Mouse-move while dragging: shift `viewportOffset` by `-deltaX`
  (where `deltaX = clientX - lastClientX`). I.e. dragging the partition
  to the right makes `viewportOffset` decrease (we look at earlier
  content). Apply clamp from rule 5.
- Disable the smooth CSS transition during drag (toggle a
  `.dragging` class on `.tab-strip` that overrides transition).
- During drag, **do NOT touch `video.currentTime`** — drag is
  visual peek only.
- During drag the cursor element keeps its position
  (`cursorScreenX = targetPixel - viewportOffset`), which means the
  cursor visibly slides left/right as the user drags — that's correct,
  it shows where the playhead is relative to the panned partition.
- Mouse-up:
  - **If the pointer barely moved** (`|deltaX_total| < 4 px`): treat
    as a click → seek video to that pixel (existing click-to-seek
    behaviour).
  - **If the pointer moved**: it was a drag → don't seek. The user
    can resume playback and the cursor will catch up; if the cursor is
    off-screen (auto-recover rule 4 will pull it back to 10 %).
- During drag the body/document should have `cursor: grabbing`; on
  hover (no drag) the viewport shows `cursor: grab`. On click (without
  drag) keep `cursor: pointer`. Acceptable simplification: just use
  `cursor: grab` always; switch to `grabbing` while mouse is down.

### Click-to-seek (refined)

The Phase 2b click-to-seek logic needs a small adjustment now that the
cursor isn't at viewport centre:
- `clickSourcePixel = viewportOffset + clickX` (where `clickX` is
  relative to `.tab-viewport`'s bounding box).
- Find nearest event by pixel; set `video.currentTime = event.frame / fps`.
- After the seek, an immediate RAF tick will place the cursor at
  `clickSourcePixel - viewportOffset = clickX`, exactly where the user
  clicked. No additional re-centering needed.

Treat a click as: mouse-down → mouse-up with `|deltaX_total| < 4 px`
within ~200 ms. Larger movement = drag (no seek).

### Wheel scroll (bonus, simple to add)

If scope permits — add wheel scroll: `wheel` event on `.tab-viewport`
shifts `viewportOffset += deltaY` (or `deltaX` if user has horizontal
wheel). Also no video seek. Same clamp.

### Bar markers

Stay visually identical (thin lines at `left: barPx` inside
`.tab-strip`). They keep `pointer-events: none`. Bar-marker
positioning is in source-pixel coordinates, so it just rides along with
the strip's translation as before.

## Definition of Done

Verify each:

- [ ] Video controls (play, scrubber, time, volume, fullscreen) are
      all visible at the bottom of the video element. Hover triggers
      Safari/Chrome native overlay; controls do not jump or get
      clipped.
- [ ] `#video-pane` no longer has `overflow: hidden`.
- [ ] At video start (`currentTime = 0`) cursor sits near the left
      edge of the tab viewport (~10 % from left).
- [ ] Pressing Play: cursor visibly moves rightward across the
      viewport. Partition stays still.
- [ ] When cursor reaches ~90 % of viewport width: partition slides
      left smoothly (CSS transition), cursor lands at ~10 % of new
      page. No jarring teleport — should feel like a page flip.
- [ ] Mouse-down + drag horizontally on the partition: partition
      moves, video does NOT seek. The cursor slides off-screen on the
      side the user dragged toward.
- [ ] Releasing the drag: nothing snaps back. Position holds.
- [ ] Clicking (without drag) on the partition: video seeks to that
      pixel. Cursor lands at the click position.
- [ ] After a seek, if the cursor would be off-screen, partition
      auto-recovers so cursor sits at ~10 % from left.
- [ ] Cursor changes to `grabbing` during drag, otherwise `grab`.
- [ ] No errors in browser console during a full playthrough +
      multiple drags + multiple clicks.
- [ ] All Phase 2b features still work (NOW/NEXT updates, side panel
      11 buttons, vert/horiz toggle).
- [ ] Page still has no vertical scroll on a typical viewport.
- [ ] `git status` clean; commit message starts `phase 2c:`.

## Demo (mandatory — verbatim in your final report)

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/
4. Hover the video:
   - Native browser controls appear at the bottom: play/pause button,
     scrubber, time display, volume, fullscreen — all visible, none
     clipped.
5. Press play (via the native control):
   - Tab strip stays still.
   - Green cursor line moves rightward across the visible partition.
   - When cursor approaches the right edge (~90 % across), the strip
     smoothly shifts left and the cursor restarts near the left
     edge (~10 %).
6. Pause.
7. Click and drag the partition LEFT (i.e. mouse down on strip, drag
   leftward, release):
   - Partition moves left → revealing the part further into the song.
   - Video does NOT seek.
   - Cursor (the playhead indicator) drifts rightward off-screen
     because the strip moved left.
8. Drag back to the right:
   - Partition shifts back. Cursor visible again.
9. Click (no drag) somewhere in the middle of the partition:
   - Video seeks to that point. Cursor lands at click position.
10. Resize the window narrower:
    - Partition stays full container width. Behaviour unchanged.
11. Resize to <800 px:
    - Side panel reflows below video. Tab strip remains usable.
12. Stop the dev server.
```

## Reporting

Final report (≤350 words):
1. Demo block verbatim, first.
2. What was changed, ≤8 bullets.
3. Files touched.
4. Deviations from spec, with reason. "None" if you stuck to it.
5. Known issues / TODOs deferred.
