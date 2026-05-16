# Phase 4c — In-place Exercise View + Exercise Selector

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> Refactor of Phase 4b: exercise no longer takes over the whole screen.
> Instead it replaces only the video-pane content. Plus: dropdown
> selector for all 16 exercises. Plus: grey out speed/A-B/loop
> controls during exercise.

## Context

Personal-use web app for learning guitar. Stack: Vite + TypeScript +
vanilla DOM. Working directory: `/Users/apetrochenko/src/guitar/`.

Read in order:
1. `../SPEC.md` — original CD data formats. §3.1–3.2 (scene/INI),
   §3.3 (CHD), §3.4 (SCO).
2. `../ROADMAP.md`.
3. Prior phase specs `00`, `01`, `02`, `02b`, `02c`, `03`, `03b`,
   `03c`, `04a`, `04a2`, `04b`. Phase 4b is what we're refactoring;
   the EXR parser, asset pipeline (exercise MP4s + tab PNGs), and
   open/close logic exist already.

Current state (Phase 4b):
- `#exercise-view` is a `position: fixed; inset: 0; z-index: 100`
  overlay that hides the entire song view when an exercise is open.
- Exercise video, voice button, prev/next, back button all live
  inside `#exercise-view`.
- Hotspot click → `openExercise(N)` which shows the overlay.
- Esc and Back both close the overlay.

## What needs to change

User wants the exercise to integrate into the existing layout
instead of taking over. Specifically:

1. **Replace ONLY the video pane** (the area that currently shows
   the song's `<video>`). Everything else (header, side panel
   NOW/NEXT, side panel All chords, tab strip, playback control
   bar) stays visible and useful.

2. **Add an exercise-selector dropdown to the header** so the user
   can jump to any of the 15 exercises directly without needing to
   click a hotspot.

3. **Grey out Speed / A / B / Loop / Loop-here / Clear / preset
   buttons / slider** while an exercise is open — they only make
   sense for the song video.

The existing Phase 4b full-screen `#exercise-view` is removed.

## Detailed plan

### 1. Layout — exercise replaces video pane content

Inside `#video-pane`, two sibling subtrees:
- `<video id="player">` (the song video) — existing.
- `<div id="exercise-pane" hidden>` — the new in-place exercise UI.

When exercise opens: pause song video, hide it (`display: none` via
JS), show `#exercise-pane`. When exercise closes: opposite.

DOM for `#exercise-pane`:
```html
<div id="exercise-pane" hidden>
  <div class="ex-mini-header">
    <button id="ex-back" class="chord-btn" type="button">← Back</button>
    <span id="ex-title" class="ex-title">Exercise —</span>
    <div class="ex-nav">
      <button id="ex-prev" class="chord-btn" type="button">← Prev</button>
      <button id="ex-next" class="chord-btn" type="button">Next →</button>
    </div>
  </div>
  <video id="ex-video" controls></video>
  <img id="ex-tab" alt="Exercise tab" hidden />
  <div class="ex-bottom">
    <button id="ex-voice"  class="chord-btn" type="button">▶ Voice</button>
    <button id="ex-replay" class="chord-btn" type="button">▶ Video</button>
    <label class="ex-autoplay">
      <input id="ex-autoplay" type="checkbox" checked /> Auto-play
    </label>
  </div>
</div>
```

CSS additions:
```css
#exercise-pane {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  height: 100%;
  min-height: 0;
  min-width: 0;
}

#exercise-pane[hidden] { display: none; }

.ex-mini-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}
.ex-title { flex: 1; font-weight: 600; font-size: 0.95rem; }
.ex-nav { display: flex; gap: 6px; }

#ex-video {
  width: 100%;
  height: 100%;          /* fills remaining flex space */
  min-height: 0;
  background: #000;
  object-fit: contain;
  flex: 1;               /* main visual element */
}

#ex-tab {
  display: block;
  align-self: center;
  max-width: 100%;
  max-height: 110px;     /* small reference, doesn't dominate */
  image-rendering: pixelated;
  border: 1px solid var(--border);
}
#ex-tab[hidden] { display: none; }

.ex-bottom {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 0.85rem;
}
.ex-autoplay { display: inline-flex; align-items: center; gap: 4px; }
```

Remove the old `#exercise-view` element and all its CSS rules
(`#exercise-view`, `#exercise-header`, `#exercise-main`,
`#exercise-controls`, etc.). All of that flow lives inside
`#exercise-pane` now.

### 2. Exercise selector in header

Update `<header id="header">`:
```html
<header id="header">
  <h1>Guit95 — Hey Joe</h1>
  <select id="exercise-select">
    <option value="">Choose exercise…</option>
    <option value="1">Exercise 1</option>
    <option value="2">Exercise 2</option>
    ...
    <option value="15">Exercise 15</option>
  </select>
  <div id="orientation-toggle">
    <button id="btn-vert" class="active">Vert</button>
    <button id="btn-horiz">Horiz</button>
  </div>
</header>
```

Generate the 15 `<option>`s in JS — easier to keep in sync with any
future song that has different exercise count.

CSS:
```css
#exercise-select {
  background: var(--btn-bg);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 6px 10px;
  border-radius: 3px;
  font-size: 0.85rem;
  cursor: pointer;
}
```

Behaviour:
- On `change` event: read `value`. If empty → close exercise. If
  numeric → `openExercise(N)`.
- When an exercise opens (via hotspot OR dropdown): set the dropdown's
  value to `String(N)`.
- When closed (via Back or Esc): set dropdown back to `""`.
- The dropdown stays clickable in any state.

### 3. Grey out playback controls during exercise

Toggle a body-level class:
```css
body.exercise-mode #playback-controls button,
body.exercise-mode #playback-controls input[type="range"] {
  opacity: 0.4;
  pointer-events: none;
  cursor: not-allowed;
}
```

In JS:
- `openExercise(N)` → `document.body.classList.add("exercise-mode")`.
- `closeExercise()` → `document.body.classList.remove("exercise-mode")`.

The All-chords row in side panel remains enabled during exercise (the
user might want to reference a chord). Phase 4a's "disable during
playback" still applies but is keyed off the SONG video's playing
state — and song video is paused while exercise open, so buttons are
enabled. Keep that as is.

### 4. Hotkey behaviour

In Phase 4b we bailed out of all song hotkeys when an exercise was
open. Keep that. Esc still closes the exercise.

### 5. State preservation

- Song video: pause it when entering exercise mode, do NOT change
  `currentTime`. On close, song video resumes from where it was
  (paused, but at correct position — user can press play).
- A/B/Loop/Speed: untouched.
- NOW/NEXT in side panel: stays at whatever chord was active last;
  it's frozen because no playback is happening.
- Tab strip: still shows the song's score; cursor is at the song's
  paused position.

When closing the exercise:
- Hide `#exercise-pane`, show `<video id="player">`.
- Pause `#ex-video`, clear its src to release memory:
  ```ts
  exVideo.pause();
  exVideo.removeAttribute("src");
  exVideo.load();
  ```
- `voiceAudio.pause()` and clear its src.
- Body class removed → playback controls become live again.

### 6. Asset & parser

No changes needed. `src/parsers/exr.ts` and the asset pipeline from
Phase 4b are reused as-is.

## Scope — OUT (do not do)

- ❌ Multi-segment exercise playback — still segment 1 only
  (deferred to a future phase if requested).
- ❌ Chord-diagram overlays inside the exercise video.
- ❌ Slow-down / loop applied to the exercise video. (User chose
  greying out instead.)
- ❌ Other songs (Phase 7).
- ❌ Toolkit (10 generic exercises).

## Definition of Done

- [ ] Old `#exercise-view` overlay completely removed from HTML and
      CSS. No `position: fixed; z-index: 100` exercise container.
- [ ] `#exercise-pane` exists inside `#video-pane` and shows when an
      exercise is opened.
- [ ] All other UI (header except for the new dropdown, side panel,
      playback bar, tab strip) stays VISIBLE during exercise mode.
- [ ] Header has `<select id="exercise-select">` with 15 options
      (Exercise 1..15) plus a default placeholder.
- [ ] Selecting from dropdown opens the chosen exercise; selecting
      placeholder closes the exercise.
- [ ] Hotspot click still opens the linked exercise. Dropdown updates
      to reflect the open exercise number.
- [ ] Back button, Esc, Prev, Next, Voice, Video, Auto-play all work
      as in Phase 4b.
- [ ] Playback controls (Speed slider, presets, A/B, Loop, Loop-here,
      Clear) are visibly greyed out and unclickable while exercise
      is open.
- [ ] After closing exercise: song video at exactly the same
      currentTime; A/B/Loop/Speed preserved; playback controls
      reactivate.
- [ ] No console errors / warnings during open → next → next → back
      cycle.
- [ ] Phase 2/3/4a behaviours intact: page-flip scroll, drag-pan,
      click-to-seek, NOW/NEXT updates, hotspot rendering with click
      → openExercise dispatch, chord-button-disable-while-playing
      (song video).
- [ ] `git status` clean; commit message starts `phase 4c:`.

## Demo (mandatory — verbatim in your final report)

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/
4. Header now has a "Choose exercise…" dropdown.
5. Click a hotspot on the tab strip:
   - Video pane content changes: shows "← Back  Exercise N  ← Prev / Next →"
     header, then the exercise video, then a small tab image,
     then [▶ Voice] [▶ Video] Auto-play row.
   - Side panel (NOW/NEXT and All chords) is still visible.
   - Tab strip below is still visible.
   - Playback bar (Speed slider, A/B, Loop) is greyed out — slider
     is dimmed, buttons unclickable.
   - Voice intro starts playing automatically; demo video plays
     after voice.
   - Header dropdown shows "Exercise N".
6. Click "Next →":
   - Exercise N+1 loads in place.
7. Open the dropdown, pick "Exercise 1":
   - Switches to exercise 1 immediately.
8. Press Esc:
   - Exercise pane hides, song video is back where you left it.
   - Dropdown returns to "Choose exercise…" placeholder.
   - Speed/A-B/Loop buttons reactivate.
9. Resume playback (Space) → song plays as before.
10. Pick another exercise from the dropdown:
    - Same in-place exercise view opens; song video pauses,
      playback controls grey out again.
11. Click "← Back" inside the exercise pane:
    - Same close behaviour as Esc.
12. Stop the dev server.
```

## Reporting

Final report (≤350 words):
1. Demo block, verbatim, first.
2. What was changed (≤7 bullets).
3. Files touched.
4. Deviations from spec, with reason. "None" if you stuck to it.
5. Known issues / TODOs deferred.
