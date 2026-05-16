# Phase 2b — Tab Layout Fixes + NOW/NEXT Chord Previews

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> This is a **follow-up to Phase 2** that fixes UX issues and adds the
> NOW / NEXT chord preview feature.

## Context (read first)

The project is a personal-use web app for learning guitar from a 1995
Ubi Soft CD. Stack: Vite + TypeScript + vanilla DOM, no frameworks.

Read in order:
1. `../SPEC.md` — full spec of the original CD's data formats. §3.3 is
   CHD (chord database), §3.4 is SCO (score sync file).
2. `../ROADMAP.md` — overall plan; you only do this fix.
3. `00-asset-pipeline.md` — Phase 0: skeleton + ffmpeg pipeline.
4. `01-mvp-hey-joe.md` — Phase 1: video + chord buttons + side panel.
5. `02-tab-sync.md` — Phase 2: SCO parser, TabScroller component,
   active-chord auto-highlight. Phase 2 works (auto-scroll fine,
   auto-highlight fine), but the user found three UX issues and one
   missing feature — this spec addresses them.

Working directory: `/Users/apetrochenko/src/guitar/`.

## What needs to change

### Issue 1 — Vertical scroll of the page

Current layout (body CSS grid):
```
┌─────────────────────────────────────────┐
│ Header                                  │
├──────────────────────┬──────────────────┤
│ Video (responsive)   │ Side panel       │
├──────────────────────┴──────────────────┤
│ Tab strip                               │
├─────────────────────────────────────────┤
│ 11 chord buttons (this row pushes the   │
│ page beyond viewport → vertical scroll) │
└─────────────────────────────────────────┘
```

The 11-button row at the bottom pushes the page below the viewport;
the user has to scroll down to see chord buttons. The fix is to **move
the chord buttons into the side panel** (see Issue 4 layout) and remove
the bottom row entirely.

Target layout:
```
┌─────────────────────────────────────────┐
│ Header                                  │
├──────────────────────┬──────────────────┤
│                      │ NOW: E │ NEXT: D │
│  Video (responsive)  │ [diag] │ [diag]  │
│                      │                  │
│                      │ All chords:      │
│                      │ [C][Go][D][A]…   │
├──────────────────────┴──────────────────┤
│ Tab strip (full width, bottom of page)  │
└─────────────────────────────────────────┘
```

The whole layout must fit a typical laptop viewport (≥720 px tall)
without vertical scroll. To make this work:
- Body grid becomes 2 rows: `header / main / tabstrip` (no separate
  chord row).
- The side panel becomes scrollable internally if its content is
  taller than the viewport (`overflow-y: auto`) — but the layout
  itself doesn't scroll.
- Keep responsive `≤800px` stacking from Phase 1.

### Issue 2 — Click anywhere on the tab strip to seek

Currently only the thin bar markers are clickable. The user wants:
**clicking anywhere on the tab strip seeks the video to that point.**

Implementation:
1. Attach a single click listener on `.tab-viewport`.
2. On click: get `clickX` relative to `.tab-viewport` rect.
3. Convert to source pixel: `sourcePixel = currentPixel + (clickX - viewportWidth/2)`
   where `currentPixel` is what TabScroller last centred on (i.e., the
   value last passed to `applyTranslate`).
4. Find the event with `pixel` closest to `sourcePixel`.
5. Set `video.currentTime = event.frame / fps`.
6. Clamp `sourcePixel` to `[startingPixel, endingPixel]` so clicks
   beyond the strip don't seek out of bounds.

Bar markers should stay visually (thin lines), but **remove their own
click handlers** — they're now just visual indicators since the whole
strip is clickable. The bar `::before` pseudo-element hit area can be
removed.

Add a `cursor: pointer` style to `.tab-viewport` so the user gets
visual feedback that the whole strip is clickable.

### Issue 3 — Layout cleanup

In addition to moving the chord row, the side panel needs restructuring
(see Issue 4 below).

### Issue 4 — NEW FEATURE: NOW / NEXT chord previews in side panel

The side panel becomes the "chord centre". Three regions stacked
vertically inside it:

```
┌─ NOW: E (MI) ─────┬─ NEXT: D (RE) ─────┐
│                   │                    │
│   [diagram E]     │    [diagram D]     │
│                   │                    │
└───────────────────┴────────────────────┘
┌─ All chords ──────────────────────────┐
│  [C] [Go] [D] [A] [E] [C₃] [G₃] [D₅]  │
│  [A₅] [E₇] [E7#9]                     │
└───────────────────────────────────────┘
```

Specifications:

- **NOW** and **NEXT** sit side by side horizontally (use
  `grid-template-columns: 1fr 1fr` or flex 50/50).
- Each shows: small label `NOW:` / `NEXT:`, then chord name with
  French comment in parentheses, then a chord diagram (canvas).
- Diagrams use the **same `ChordDiagram` component** from Phase 1.
  Two instances of it.
- The chord shown in NOW = the active chord (the one the existing
  Phase 2 auto-highlight tracks).
- The chord shown in NEXT = the **next chord change** in the timeline
  after NOW. Algorithm:
  1. From the current event index, walk forward.
  2. Find the first event with `chord` set AND `chord !== current`.
  3. Show that chord. If none exists (end of song), show "—" or hide.
- When the cursor passes the next chord, NOW becomes the previous NEXT
  and NEXT advances. Updates happen live as the playhead moves.
- Vert/Horiz toggle from header still applies to BOTH diagrams.
- Initial state (before the first chord event): show "—" in both NOW
  and NEXT, no diagram.
- Use the chord's `rgbHighlight` colour as a thin accent border around
  the NOW diagram (e.g., `border: 2px solid rgb(R,G,B)`). NEXT is
  neutral.

**All-chords row** (below NOW/NEXT in the side panel):
- The same 11 buttons that used to be at the bottom of the page.
- Click → play that chord's WAV sample (Phase 1 behaviour).
- They are no longer the "active chord selector" — selection is now
  driven by playback.
- Drop the green `.chord-btn.active` styling on click (just play
  sample, don't latch). The `.auto-active` red outline driven by
  playback is also no longer needed (NOW already shows the active
  chord prominently). **Remove** `.auto-active` logic entirely.
- Keep the chord-button hover effect.

## Implementation plan

### TabScroller.ts — change the callback shape

Replace:
```ts
onActiveChordChange?: (chordId: number | null) => void;
```

With:
```ts
onChordsChange?: (current: number | null, next: number | null) => void;
```

The callback fires whenever `current` OR `next` changes. Compute `next`
inside the scroller (it has the events array). Algorithm:
```
function chordsAt(eventIdx: number): { current: number | null, next: number | null } {
  // walk backwards to find current chord
  let current: number | null = null;
  for (let i = eventIdx; i >= 0; i--) {
    if (events[i].chord !== undefined) { current = events[i].chord; break; }
  }
  // walk forwards to find next chord that differs from current
  let next: number | null = null;
  for (let i = eventIdx + 1; i < events.length; i++) {
    if (events[i].chord !== undefined && events[i].chord !== current) {
      next = events[i].chord;
      break;
    }
  }
  return { current, next };
}
```

Cache last `current` and `next`; only fire callback when either changes.

### TabScroller.ts — click-to-seek

Add an internal handler for `.tab-viewport` clicks. Implementation in
spec §Issue 2 above.

### TabScroller.ts — remove bar marker click handlers

The bar markers stay visually but lose their `addEventListener("click", …)`
calls. Remove the corresponding `seekToBar` method too (or inline its
logic into the new viewport-click handler).

### CSS

- Remove `#chord-row` styling related to body grid placement (`grid-area: chords`)
  — row is gone.
- Body `grid-template-areas` becomes `"header" "main" "tabstrip"` (3 rows).
- Side panel inner layout:
  ```
  #side-panel {
    display: flex; flex-direction: column; gap: 16px;
    overflow-y: auto;  /* scroll inside if content too tall */
  }
  .now-next {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
  }
  .now-next > .preview { display: flex; flex-direction: column; gap: 6px; }
  .now-next .preview-label { font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; }
  .now-next .preview-name { font-size: 1.1rem; font-weight: 700; }
  .now-next canvas {
    width: 100%; height: auto;
    image-rendering: pixelated;
    border: 1px solid var(--border);
    background: #000;
  }
  .now-next .preview.now canvas { border: 2px solid; /* colour set inline from rgbHighlight */ }
  .all-chords {
    display: flex; flex-wrap: wrap; gap: 4px;
  }
  .all-chords .chord-btn { padding: 6px 10px; font-size: 0.85rem; }
  ```
- Remove `.chord-btn.active` and `.chord-btn.auto-active` rules
  (no longer used).
- Add `.tab-viewport { cursor: pointer; }`.
- Remove `.bar-marker::before` (hit area) since markers are no longer
  individually clickable — keep the visual line.

### index.html

Replace the `#side-panel` content:
```html
<div id="side-panel">
  <div class="now-next">
    <div class="preview now">
      <div class="preview-label">Now</div>
      <div class="preview-name" id="now-name">—</div>
      <canvas id="now-canvas"></canvas>
    </div>
    <div class="preview next">
      <div class="preview-label">Next</div>
      <div class="preview-name" id="next-name">—</div>
      <canvas id="next-canvas"></canvas>
    </div>
  </div>
  <div class="all-chords" id="all-chords">
    <!-- 11 buttons injected by main.ts -->
  </div>
</div>
```

Remove the entire `<div id="chord-row">…</div>` from the bottom.
The old `#chord-info`, `#diagram-canvas`, `#play-sample-btn`,
`#panel-placeholder`, `#chord-name-display`, `#chord-comment`
elements are **removed** — they belong to the obsolete "click chord
to see diagram" flow.

### main.ts

- Remove the `selectChord()` function and the per-button click handler
  that opened the side panel and toggled `.active`. Replace with
  click-to-play-sample only.
- Remove `handleActiveChordChange()` (the `.auto-active` outline
  logic) — no longer applicable.
- Add two `ChordDiagram` instances: one for `now-canvas`, one for
  `next-canvas`.
- Inject 11 chord buttons into `#all-chords`. On click → `playSample`
  only. No latching.
- Wire `TabScroller.onChordsChange = (curId, nextId) => updatePreviews(curId, nextId)`.
- `updatePreviews(curId, nextId)`:
  1. Look up chords by id from `chordsById`.
  2. Set NOW name `${chord.name} (${chord.comments})` or `—`.
  3. Render NOW diagram with chosen orientation; set inline border
     colour from `rgbHighlight`.
  4. Same for NEXT (no border colour, just default).
  5. If chord is `null`, show "—" and clear the canvas (use
     `ChordDiagram.clear()`).
- Keep Vert/Horiz toggle. When orientation changes, re-render both
  NOW and NEXT diagrams with the new orientation.
- Initial render before any playback: both NOW and NEXT show "—" with
  empty canvas.

### Don't change

- `src/parsers/*.ts` — parsers don't change.
- `src/audio/sample.ts` — playback stays the same.
- `scripts/build-assets.sh` — no asset changes.
- `src/components/ChordDiagram.ts` — reuse as-is. (Bonus: verify the
  `clear()` method really empties the canvas — fix if not.)

## Definition of Done

- [ ] No vertical scroll on page at typical viewport (1200×800 or
      laptop default). The whole layout (header, video, tab strip,
      side panel) fits within `100vh` without page-level scroll.
- [ ] Side panel shows NOW (left) and NEXT (right) horizontally,
      both updating as video plays.
- [ ] NOW diagram has a coloured border matching `rgbHighlight`.
- [ ] All-chords row in side panel: click any → its sample plays;
      no "active" latching.
- [ ] No more `#chord-row` at the body level. No `.auto-active`
      class anywhere.
- [ ] Click anywhere on the tab strip → video seeks to that pixel,
      tab strip immediately re-centres on that point.
- [ ] Bar markers still visible (thin vertical lines) but
      individually no longer clickable (entire strip handles clicks).
- [ ] `cursor: pointer` shown when hovering over tab strip.
- [ ] Vert/Horiz toggle works for both NOW and NEXT diagrams.
- [ ] Responsive: ≤800 px viewport stacks side panel below video; tab
      strip stays full width and clickable.
- [ ] No errors in browser console during a full play of the song.
- [ ] `git status` clean; commit message starts `phase 2b:`.

## Demo (mandatory — copy verbatim into your final report)

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/
4. Initial view (video paused, frame 0):
   - No vertical page scroll. Whole layout fits in viewport.
   - Header at top.
   - Video on the left, side panel on the right.
   - Side panel: "NOW: —" | "NEXT: —" (both empty), then 11 chord
     buttons in a wrapping row.
   - Tab strip across the bottom, centre cursor visible.
5. Press play:
   - Tab strip starts scrolling.
   - After a couple of seconds NOW shows "E (MI)" with a red-bordered
     diagram. NEXT shows "D (RE)" or whichever chord comes after.
   - As playback continues, NOW and NEXT swap/update on each new chord
     event in the score.
6. Pause.
7. Click anywhere in the middle of the tab strip:
   - Video instantly jumps to that point.
   - Tab strip jumps so the cursor sits exactly on where you clicked.
   - NOW/NEXT update to reflect the new position.
   - Cursor on tab-strip hover is a pointer (✋).
8. Click any chord button in "All chords" (e.g. A_5):
   - Just plays its sample. Nothing else changes (NOW/NEXT untouched).
9. Click "Horiz" toggle in the header:
   - Both NOW and NEXT diagrams switch to the horizontal crop.
10. Resize the window narrower (drag from right):
    - Layout stays usable. Tab strip remains full container width;
      cursor still in centre.
11. Resize to <800 px wide:
    - Side panel reflows below video. Tab strip remains at the
      bottom, full width, still clickable.
12. Stop the dev server.
```

## Reporting

Final report (≤400 words):
1. Demo block verbatim, first.
2. What was changed, ≤10 bullets.
3. Files touched (created / modified / removed).
4. Deviations from this spec, with reason. "None" if you stuck to it.
5. Known issues / TODOs deferred.
