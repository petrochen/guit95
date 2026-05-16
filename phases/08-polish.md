# Phase 8 — Polish (Resume + iPad Touch + Help + Progress + Settings)

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> Five medium-sized polish features bundled. Commit each as a separate
> commit so progress is preserved even if the agent runs out of time.

## Context

Personal-use web app for learning guitar from a 1995 Ubi Soft CD.
Stack: Vite + TypeScript + vanilla DOM. Working directory:
`/Users/apetrochenko/src/guitar/`.

Read in order:
1. `../SPEC.md`, `../ROADMAP.md`.
2. Prior phase specs `00`..`07b`. Phase 7 (multi-song + home + hash
   router) is the most recent baseline.

Current state — all features working:
- Home screen with 7 songs in CD order + jingles on hover/click.
- Per-song player: video, NOW/NEXT, tab strip with hotspots,
  exercise pane in-place, dropdown for exercise selection,
  Speed/A/B/Loop controls, hotkeys.
- All Phase 4 behaviours (exercise renumbering by song order, voice/
  video mutex, exercise tab swaps song tab in bottom area).

## What to build

Five features. Each is independent — implement and commit one at a
time. Order suggested below by user value.

---

### Feature 1 — Resume on reload (per-song playback position)

**Goal:** when the user reloads or revisits a song, the video is at
the same currentTime they left it.

**State stored in `localStorage`:**
- Key: `song-positions`
- Value: JSON `{ [slug: string]: number }` mapping slug → currentTime (s).

**Save logic:**
- Set up a `setInterval(saveSongPosition, 3000)` while a song is loaded.
- Also save on `pagehide` event (covers tab close/refresh).
- Also save when navigating away (hash change to home or to a different song).
- Skip saving while exercise pane is open (song video is paused;
  preserve last song time as user left it, don't accidentally overwrite
  with stale value).

**Restore logic:**
- In `renderSong(meta)`: after loading the video, read
  `song-positions[meta.slug]`. If finite and within
  `[0, video.duration - 0.5]`, set `video.currentTime = position`.
  Do this once `loadedmetadata` fires (duration becomes known).
- Set the song's currentTime BEFORE NOW/NEXT and tab strip render —
  so the initial display reflects the resumed position, not frame 0.

**Helper module** at `src/state/progress.ts` (used here AND for
Feature 4):
```ts
const KEY_POS = "song-positions";
export function getPosition(slug: string): number {
  try { return (JSON.parse(localStorage.getItem(KEY_POS) ?? "{}") as Record<string, number>)[slug] ?? 0; }
  catch { return 0; }
}
export function setPosition(slug: string, t: number): void {
  let obj: Record<string, number> = {};
  try { obj = JSON.parse(localStorage.getItem(KEY_POS) ?? "{}"); } catch {}
  obj[slug] = t;
  localStorage.setItem(KEY_POS, JSON.stringify(obj));
}
```

**Commit message:** `phase 8: resume song position on reload`

---

### Feature 2 — iPad touch support (drag + tap)

**Goal:** make the tab strip and the back/UI buttons work on iPad
Safari with finger input. Currently drag/click on the tab strip are
mouse-only.

**Strategy:** refactor TabScroller from `mousedown/mousemove/mouseup`
to **Pointer Events** (`pointerdown/pointermove/pointerup`). These
unify mouse + touch + pen in one API and work on iPad Safari (14+).

**Specific changes in `src/components/TabScroller.ts`:**
- Replace all mouse event listeners with pointer event listeners
  (same logic; just swap event names).
- Call `e.preventDefault()` on `pointerdown` to suppress the iOS
  scroll/zoom default. Also set
  `viewport.style.touchAction = "none"` so iOS Safari knows we
  handle gestures ourselves.
- Use `setPointerCapture(e.pointerId)` on pointerdown and
  `releasePointerCapture` on pointerup — ensures pointermove keeps
  firing even if the finger leaves the strip area.
- Wheel-scroll handler from Phase 2c stays unchanged (mouse-only).
- Click vs drag threshold (4 px) stays the same.

**Test rule:** the demo must include a "test on iPad Safari" step.
You can't run on iPad yourself; instructions to user will cover it.

**Commit:** `phase 8: pointer events for iPad touch support`

---

### Feature 3 — Help overlay (?)

**Goal:** press `?` (or `Shift+/`) to show a modal listing all
keyboard shortcuts. Esc closes.

**DOM (added to `index.html`):**
```html
<div id="help-overlay" hidden>
  <div class="help-panel">
    <h2>Keyboard shortcuts</h2>
    <table class="help-table">
      <tr><th>Key</th><th>Action</th></tr>
      <tr><td>Space</td>            <td>Play / pause</td></tr>
      <tr><td>← / →</td>            <td>Seek ±5 seconds</td></tr>
      <tr><td>Shift + ← / →</td>    <td>Previous / next bar</td></tr>
      <tr><td>[</td>                <td>Move A one bar back (or set A)</td></tr>
      <tr><td>]</td>                <td>Move B one bar forward (or set B)</td></tr>
      <tr><td>Shift + [ / ]</td>    <td>Shrink loop boundary</td></tr>
      <tr><td>L</td>                <td>Toggle loop on/off</td></tr>
      <tr><td>C</td>                <td>Clear A/B/loop</td></tr>
      <tr><td>?</td>                <td>Show this help</td></tr>
      <tr><td>Esc</td>              <td>Close exercise / close help</td></tr>
    </table>
    <button id="help-close" type="button">Close</button>
  </div>
</div>
```

**CSS:**
```css
#help-overlay {
  position: fixed; inset: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  z-index: 1000;
}
#help-overlay[hidden] { display: none; }
.help-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border);
  padding: 24px 32px;
  border-radius: 8px;
  min-width: 420px;
  color: var(--text);
}
.help-panel h2 { margin-bottom: 16px; font-size: 1.1rem; }
.help-table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  font-size: 0.9rem;
}
.help-table th, .help-table td {
  text-align: left; padding: 6px 12px;
  border-bottom: 1px solid var(--border);
}
.help-table th { color: var(--text-dim); font-weight: 600; }
.help-table td:first-child { font-family: monospace; color: var(--accent); }
#help-close {
  padding: 8px 16px;
  background: var(--btn-bg); color: var(--text);
  border: 1px solid var(--border); border-radius: 3px;
  cursor: pointer;
}
```

**JS hotkey wiring** in `main.ts`'s `handleKey`:
- `e.code === "Slash" && e.shiftKey` → open help (also matches `?` key on US/UK layouts).
- When help is open: Esc closes it.
- Help button is a global hotkey — works even from exercise view.
- Click outside `.help-panel` or click `#help-close` also closes.

**Commit:** `phase 8: help overlay with hotkey list`

---

### Feature 4 — Progress tracking (per-exercise "completed")

**Goal:** mark exercises as completed. Show a counter on each home
card ("3 / 15 done"). In the dropdown, show ✓ next to completed.

**State in `localStorage`:**
- Key: `exercise-progress`
- Value: JSON `{ [slug: string]: number[] }` mapping slug → array of
  display-indices marked done.

**Helper additions to `src/state/progress.ts`:**
```ts
const KEY_PROG = "exercise-progress";

export function getCompleted(slug: string): Set<number> {
  try {
    const obj = JSON.parse(localStorage.getItem(KEY_PROG) ?? "{}") as Record<string, number[]>;
    return new Set(obj[slug] ?? []);
  } catch { return new Set(); }
}

export function toggleCompleted(slug: string, displayIdx: number): boolean {
  const obj = (() => { try { return JSON.parse(localStorage.getItem(KEY_PROG) ?? "{}"); } catch { return {}; } })() as Record<string, number[]>;
  const set = new Set(obj[slug] ?? []);
  const wasIn = set.has(displayIdx);
  if (wasIn) set.delete(displayIdx); else set.add(displayIdx);
  obj[slug] = Array.from(set).sort((a, b) => a - b);
  localStorage.setItem(KEY_PROG, JSON.stringify(obj));
  return !wasIn; // new state
}

export function resetProgress(): void {
  localStorage.removeItem(KEY_PROG);
}
```

**UI changes in exercise pane** (`.ex-mini-header` or `.ex-bottom`):
- Add a checkbox-style button: `<button id="ex-done">✓ Mark done</button>`.
- When clicked: toggleCompleted(currentSlug, currentDisplayIdx),
  visually update (e.g. add `.done` class).
- On openExerciseByDisplay: set initial state from
  `getCompleted(slug).has(displayIdx)`.

**UI on home cards:**
- Add a small text under artist: `"N / 15 done"` where N is
  `getCompleted(slug).size`. If 0: omit the line.
- Update if user navigates back to home after marking something.

**Dropdown:** add ✓ prefix to options where the exercise is completed.
Example option text: `"Exercise 3 ✓"`. Refresh dropdown options on
exercise open/close.

**Commit:** `phase 8: exercise progress tracking`

---

### Feature 5 — Settings panel

**Goal:** central settings: default playback rate, default volume,
reset progress button.

**DOM:**
```html
<div id="settings-overlay" hidden>
  <div class="settings-panel">
    <h2>Settings</h2>
    <label>Default speed
      <input id="setting-default-speed" type="range" min="0.25" max="1.5" step="0.05" value="1" />
      <span id="setting-default-speed-value">1.00×</span>
    </label>
    <label>Default volume
      <input id="setting-default-volume" type="range" min="0" max="1" step="0.05" value="0.8" />
      <span id="setting-default-volume-value">80%</span>
    </label>
    <button id="setting-reset-progress" type="button" class="danger">Reset all progress</button>
    <button id="setting-close" type="button">Close</button>
  </div>
</div>
```

**Header button:** add a small `⚙` button in the page header next to
the Library/Library-back, or in song header next to Vert/Horiz. It
opens the settings panel.

**CSS:** same modal pattern as help-overlay (fixed, dark backdrop,
centred panel).

**JS:**
- `default-speed` saved to localStorage key `default-speed` (number).
  On `renderSong()`, if no per-song persisted speed (Phase 3 had
  `playback-rate` key), use the default. Otherwise the existing key
  wins. Actually simplify: `default-speed` IS the only speed key
  going forward; on save it overrides. (This removes Phase 3's
  `playback-rate` key behaviour — make sure Speed slider initialises
  from `default-speed`.)
- `default-volume` similarly: `localStorage.default-volume`. Applied
  to `video.volume` on `renderSong`. Default 0.8.
- "Reset all progress" button calls `resetProgress()` (Feature 4).
  Confirm with `window.confirm("Reset progress for all songs?")`.

- When settings are changed, immediately apply if a song is loaded
  (so the user sees the effect without reload).

**Commit:** `phase 8: settings panel with defaults`

## Definition of Done

- [ ] All 5 features implemented and each committed separately.
- [ ] Resume: reloading a song page returns video to the same
      currentTime. Different songs have independent positions.
- [ ] iPad touch: TabScroller uses Pointer Events; `touchAction:
      none` set; works in mobile Safari (you can confirm via DevTools
      mobile emulation if no iPad available).
- [ ] Help overlay: `?` opens, Esc closes, all 10 hotkeys listed.
- [ ] Progress: ✓ Mark done button in exercise pane; counter on
      home cards; ✓ in dropdown options.
- [ ] Settings: default speed and volume persist and apply
      on song load; reset progress button works with confirmation.
- [ ] All prior phase features intact: navigation, hotkeys, slow-down,
      loop, exercises, NOW/NEXT, page-flip scroll, hotspots,
      jingles.
- [ ] No console errors in normal usage.
- [ ] `git log` shows 5 separate commits, all starting with `phase 8:`.

## Demo (mandatory — copy verbatim into your final report)

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/
4. Click "Hey Joe", play video to ~20 seconds, pause.
5. Refresh the page (Cmd+R). Video should resume at ~20 seconds, not 0.
6. Click "← Library", click "Sweet Home Alabama", play to 10 seconds,
   pause. Refresh — Sweet Home should resume at 10 seconds.
   Open Hey Joe via Library — still at 20 seconds.
7. Press "?" — help overlay appears with 10 hotkeys. Press Esc — closes.
8. Click "← Library", hover over each card, hear jingles (unchanged).
9. Open any song, open an exercise. Click "✓ Mark done" — button
   visually toggles. Close exercise, reopen — still marked.
10. Return to "← Library" — the card you were on shows "1 / N done".
    Open dropdown in player — ✓ on completed exercises.
11. Open Settings via the ⚙ button (header). Slide default speed to
    0.5, default volume to 50%. Close. Refresh page — Speed slider
    starts at 0.5, video volume at 50%.
12. Click Reset all progress in settings → confirm dialog → all ✓
    markers cleared.
13. (On iPad if available) try drag-pan and tap-to-seek on the tab
    strip — should work with finger.
14. Stop the dev server.
```

## Reporting

Final report (≤500 words):
1. Demo block, verbatim, first.
2. What was built per feature (≤2 bullets each).
3. Files touched.
4. Git: `git log --oneline | head -7` showing the 5 phase-8 commits.
5. Deviations from spec, with reason. "None" if you stuck to it.
6. Known issues / TODOs deferred (e.g., iPad not personally tested).
