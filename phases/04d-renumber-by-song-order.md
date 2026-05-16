# Phase 4d — Renumber Exercises by Song Order

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> Small refactor: display exercises in song-curriculum order, not in
> the original CD's arbitrary file numbering.

## Context

Personal-use web app for learning guitar. Stack: Vite + TypeScript +
vanilla DOM. Working directory: `/Users/apetrochenko/src/guitar/`.

Read in order:
1. `../SPEC.md` — original CD data formats. §3.4 (SCO `[difficulty]`
   blocks) is most relevant — each has `exercice=N` (CD file number)
   and `rect={x,y,w,h}` (pixel position in song).
2. `../ROADMAP.md` — overall plan.
3. Prior phase specs `00`..`04c`. Phase 4c built the in-place
   exercise pane and the `<select id="exercise-select">` dropdown.
   This phase just changes how exercises are numbered in the UI.

## The problem

The original CD numbered Hey Joe's exercises 0..15, where 0 was the
"list" entry scene (already skipped) and 1..15 were real lessons.
However, the CD's numbering is **NOT** lesson order — exercise 15
turns out to be the introductory passage at the start of the song,
while exercise 4 appears in the middle, etc.

Right now the dropdown shows `Exercise 1`..`Exercise 15` in CD-file
order, and so do the hotspot tooltips and the in-place exercise
header. Users find this confusing — clicking the very first hotspot
(at the song's start) opens "Exercise 15" with intro audio.

The fix: **renumber exercises by song-curriculum order** so that the
first hotspot in the song is "Exercise 1", the next unique exercise
is "Exercise 2", and so on. CD file numbers stay the same internally
(file paths unchanged), only the display labels change.

## Design

Build two mappings in `src/main.ts` after the score loads:

```ts
// CD exercise number → 1-based display index
const cdToDisplay = new Map<number, number>();
// 1-based display index → CD exercise number
const displayToCd: number[] = [];

const sorted = [...score.difficulties].sort((a, b) => a.rect.x - b.rect.x);
const seen = new Set<number>();
for (const d of sorted) {
  if (!seen.has(d.exercice)) {
    seen.add(d.exercice);
    cdToDisplay.set(d.exercice, displayToCd.length + 1);
    displayToCd.push(d.exercice);
  }
}
// Append orphans (CD exercises 1..15 never referenced by any hotspot)
for (let cd = 1; cd <= 15; cd++) {
  if (!seen.has(cd)) {
    cdToDisplay.set(cd, displayToCd.length + 1);
    displayToCd.push(cd);
  }
}
```

`displayToCd.length` is the total exercise count (still 15 for Hey
Joe; sanity-check it equals 15 and log a warning if not).

### Where to apply

Every place that currently shows a CD exercise number must show the
display index instead.

1. **Dropdown options** (`#exercise-select`):
   - `value = displayIdx` (1..15).
   - `textContent = "Exercise " + displayIdx`.
   - Generated in JS using the loop bound `displayToCd.length`.

2. **Exercise pane title** (`#ex-title`):
   - Show `"Exercise " + displayIdx`.

3. **Hotspot tooltip** (`title` attribute on each `.difficulty-hotspot`):
   - Pre-Phase 4d: `"Hard passage → exercise " + cdNum + " (click to open)"`.
   - Post-Phase 4d: `"Hard passage → exercise " + displayIdx + " (click to open)"`.

4. **Console log on hotspot click** (currently `[hotspot] Open exercise N (sound: ...)`):
   - Use display index: `Open exercise <displayIdx>`.

5. **Prev/Next exercise buttons**: navigate by **display order**, not CD
   order. Clamped to [1, displayToCd.length].

### Refactor: exercise opening

Replace the existing `openExercise(num: number)` that took the CD
number with `openExerciseByDisplay(displayIdx: number)`:

```ts
async function openExerciseByDisplay(displayIdx: number) {
  if (displayIdx < 1 || displayIdx > displayToCd.length) return;
  const cdNum = displayToCd[displayIdx - 1]!;
  currentExerciseDisplayIdx = displayIdx;
  currentExerciseCdNum = cdNum;
  // ... existing logic using cdNum for file paths,
  //     using displayIdx for the title text + dropdown sync.
  exTitle.textContent = `Exercise ${displayIdx}`;
  exerciseSelect.value = String(displayIdx);
  document.body.classList.add("exercise-mode");
  songVideo.pause();
  videoEl.style.display = "none";
  exercisePane.hidden = false;
  const ex = await loadExercise(`/assets/heyjoe/raw/exercice/${cdNum}/`, cdNum);
  exVideo.src = ex.videoFile;
  // ... tab image, autoplay, etc. unchanged.
}
```

State: keep both `currentExerciseDisplayIdx` and `currentExerciseCdNum`
in module scope so prev/next can compute the next display index, and
the close logic can reset state.

### Hotspot dispatch

Hotspot click handler in TabScroller stays the same — it calls
`onDifficultyClick(cdNum, sound)`. In `main.ts`:
```ts
new TabScroller(tabRow, {
  ...,
  onDifficultyClick: (cdNum) => {
    const displayIdx = cdToDisplay.get(cdNum);
    if (displayIdx !== undefined) openExerciseByDisplay(displayIdx);
  },
});
```

### TabScroller — update hotspot label

`TabScroller.setDifficulties` currently builds the title string
internally with the CD number. Add an optional second argument:

```ts
setDifficulties(
  items: Difficulty[],
  opts?: { labelForExercice?: (cdNum: number) => string }
): void
```

If `opts.labelForExercice` is provided, call it to compute the
displayed exercise number for the tooltip. Otherwise use the CD
number (unchanged default).

In `main.ts`, after building `cdToDisplay`:
```ts
tabScroller.setDifficulties(score.difficulties, {
  labelForExercice: (cd) => String(cdToDisplay.get(cd) ?? cd),
});
```

### Dropdown change handler

```ts
exerciseSelect.addEventListener("change", () => {
  const v = exerciseSelect.value;
  if (v === "") closeExercise();
  else openExerciseByDisplay(parseInt(v, 10));
});
```

### Prev/Next handlers

```ts
exPrev.addEventListener("click", () => {
  if (currentExerciseDisplayIdx === null) return;
  openExerciseByDisplay(Math.max(1, currentExerciseDisplayIdx - 1));
});
exNext.addEventListener("click", () => {
  if (currentExerciseDisplayIdx === null) return;
  openExerciseByDisplay(Math.min(displayToCd.length, currentExerciseDisplayIdx + 1));
});
```

Disable buttons appropriately:
- `exPrev.disabled = currentExerciseDisplayIdx <= 1`
- `exNext.disabled = currentExerciseDisplayIdx >= displayToCd.length`

(Update on every open.)

### Close behaviour

`closeExercise()` resets `currentExerciseDisplayIdx = null` and
`exerciseSelect.value = ""`. No other change.

## Scope — OUT (do not do)

- ❌ Asset pipeline changes — exercise file paths still keyed by CD
  numbers (e.g. `exercice/15/`).
- ❌ Renumber underlying CHD chord IDs or other data — only exercise
  display labels.
- ❌ Multi-segment exercise playback — Phase 4b minimum still in
  effect.
- ❌ Show CD number anywhere in the UI — display number only. (No
  "Exercise 1 (CD ex 15)" hybrid label.)

## Definition of Done

- [ ] On page load, the dropdown shows "Choose exercise…" placeholder
      and 15 options labelled "Exercise 1".."Exercise 15".
- [ ] Clicking the very first hotspot (leftmost on the tab strip)
      opens an exercise titled "Exercise 1" — and the audio /
      content is the song's intro lesson (the file that used to be
      "Exercise 15" in CD numbering).
- [ ] Hotspot tooltips say "Hard passage → exercise <displayN>".
- [ ] Dropdown selection of "Exercise 5" opens the 5th lesson in
      song-curriculum order.
- [ ] Next/Prev buttons walk through 1..15 in display order, clamped.
- [ ] Console log on hotspot click prints display number.
- [ ] No regressions to anything else: hotspot rendering, song video
      pause/restore, NOW/NEXT, page-flip scroll, A/B loop, slow-down,
      All-chords pause-only behaviour.
- [ ] No console errors.
- [ ] `git status` clean; commit message starts `phase 4d:`.

## Demo (mandatory — verbatim in your final report)

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/
4. Header dropdown shows "Choose exercise…" and (when opened)
   options "Exercise 1" through "Exercise 15".
5. Click the very first (leftmost) coloured hotspot on the tab strip:
   - Exercise pane opens with header "Exercise 1".
   - Voice intro plays — same audio as before (which was labelled
     "Exercise 15" in Phase 4c).
   - Dropdown shows "Exercise 1".
6. Click "Next →":
   - Header changes to "Exercise 2"; new content loads (whatever
     was the next unique exercice referenced in song order).
7. Open dropdown, pick "Exercise 5":
   - Switches immediately to the 5th lesson in song order.
8. Hover any hotspot:
   - Tooltip says "Hard passage → exercise N (click to open)" with
     display N (which may differ from the CD's exercise number, by
     design).
9. Press Esc → exercise closes, dropdown returns to placeholder.
10. Stop the dev server.
```

## Reporting

Final report (≤300 words):
1. Demo block, verbatim, first.
2. What was changed (≤5 bullets).
3. Files touched.
4. Confirm: how many of the 15 CD exercises are referenced by hotspots
   (vs orphans appended at the end)? Useful sanity check.
5. Deviations from spec, with reason. "None" if you stuck to it.
6. Known issues / TODOs deferred.
