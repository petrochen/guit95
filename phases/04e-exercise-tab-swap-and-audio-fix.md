# Phase 4e — Exercise Tab Replaces Song Tab Strip + Audio Mutual Exclusion

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> Two fixes:
> 1. Move the exercise's tab image from inside the exercise pane down
>    to the bottom tab-strip row — when exercise is open, the bottom
>    shows the exercise tab; when closed, it shows the song's tab.
> 2. Stop the voice audio when the exercise video starts (and vice
>    versa) so they never play simultaneously.

## Context

Personal-use web app for learning guitar. Stack: Vite + TypeScript +
vanilla DOM. Working directory: `/Users/apetrochenko/src/guitar/`.

Read in order:
1. `../SPEC.md`, `../ROADMAP.md`.
2. Prior phase specs `00`..`04d`.

State recap:
- `#video-pane` shows either `<video id="player">` (song) or
  `#exercise-pane` (which contains `#ex-video`, `#ex-tab` small
  image, voice/video buttons, autoplay checkbox).
- Body row "tabstrip" → `#tab-row` → TabScroller's `.tab-viewport`
  with the long song tab strip.
- `voiceAudio = new Audio()` plays the per-exercise voice file.
- Phase 4b/4c built the auto-play sequence (voice → video).

## Issue 1 — Exercise tab placement

Current: when exercise opens, a small exercise tab image
(`<img id="ex-tab">`) is rendered inside `#exercise-pane`, BELOW the
exercise video. The song's long tab strip stays visible at the
bottom of the page.

Fix: the bottom tab-strip area should show the EXERCISE's tab when
exercise is open, and the song's tab when not. The small
`#ex-tab` inside `#exercise-pane` is removed.

Implementation:

1. **Remove** the `<img id="ex-tab">` element from `#exercise-pane`
   in `index.html`. Also remove its CSS rules from `styles.css`.

2. **Add** a new element inside `#tab-row` (next to the existing
   TabScroller-injected `.tab-viewport`):
   ```html
   <div id="tab-row">
     <!-- TabScroller injects .tab-viewport here -->
     <div id="exercise-tab-row" hidden>
       <img id="exercise-tab-img" alt="Exercise tab" />
     </div>
   </div>
   ```

3. **CSS**:
   ```css
   #exercise-tab-row {
     display: none;
     padding: 16px;
     background: #0f0f0f;
     border-top: 1px solid var(--border);
     border-bottom: 1px solid var(--border);
     text-align: center;
   }
   body.exercise-mode #exercise-tab-row { display: block; }
   body.exercise-mode .tab-viewport { display: none; }
   #exercise-tab-img {
     display: inline-block;
     max-width: 100%;
     image-rendering: pixelated;
     border: 1px solid var(--border);
   }
   #exercise-tab-row.no-image { display: none !important; }
   ```

4. **JS** (in `main.ts`):
   - Replace the existing logic that sets `exTab.src` with logic
     that sets `#exercise-tab-img.src`.
   - If `ex.tabImage` is null: add the `no-image` class to
     `#exercise-tab-row` (hide it even in exercise mode).
   - On exercise close: clear `#exercise-tab-img.src` (release memory)
     and reset the `no-image` class.

5. The exercise pane's content (after removing `#ex-tab`) becomes:
   `.ex-mini-header`, `#ex-video`, `.ex-bottom`. The video should
   still flex to fill available space. Verify the layout still looks
   right with that change.

## Issue 2 — Voice and video must be mutually exclusive

Current: clicking ▶ Video while voice is playing keeps voice running
in parallel.

Fix: at most one of `voiceAudio` and `exVideo` plays at any moment.
Use the cross-pause pattern with `play` event listeners:

```ts
voiceAudio.addEventListener("play", () => exVideo.pause());
exVideo.addEventListener("play", () => voiceAudio.pause());
```

This handles every case (manual buttons, autoplay sequence, native
controls) without circular triggering, because `pause()` does not
fire `play` events.

Additional cleanup:
- On `closeExercise()`: also call `voiceAudio.pause();
  voiceAudio.currentTime = 0;` (current code might already do this
  via `voiceAudio.src = ""` — verify it actually stops; if not, add
  explicit pause).

The existing autoplay sequence (voice ends → video plays) still
works. The only behaviour change is that an EARLY video.play() now
cancels voice mid-stream, which is exactly what the user wants.

## Definition of Done

- [ ] `#ex-tab` element removed from `#exercise-pane`. The exercise
      pane no longer renders the small tab image inside.
- [ ] `#exercise-tab-row` exists inside `#tab-row` with
      `<img id="exercise-tab-img">`.
- [ ] In song mode (no exercise open): `.tab-viewport` (song tab)
      visible, `#exercise-tab-row` hidden.
- [ ] In exercise mode: `.tab-viewport` hidden, `#exercise-tab-row`
      visible with the exercise's tab image centred at natural size
      (max width = container width, no stretch).
- [ ] If an exercise has no tab image (`ex.tabImage === null`):
      `#exercise-tab-row` is hidden even in exercise mode.
- [ ] Closing exercise: image src cleared, song tab strip back, no
      image leak in DOM.
- [ ] Pressing ▶ Video while voice is playing: voice stops
      immediately, video plays from start.
- [ ] Pressing ▶ Voice while video is playing: video stops
      immediately, voice plays from start.
- [ ] Auto-play sequence still works: voice plays → ends → video
      auto-starts (no mid-fire interruption).
- [ ] No console errors during open → autoplay → manual click →
      next → back cycle.
- [ ] All Phase 4a/b/c/d behaviours intact (hotspots, dropdown,
      song state preservation, page-flip scroll, A/B loop, slow-down,
      chord-button rules).
- [ ] `git status` clean; commit message starts `phase 4e:`.

## Demo (mandatory — verbatim in your final report)

```
1. cd ~/src/guitar
2. npm run dev
3. Open http://localhost:5173/
4. In song mode: bottom of page shows the long Hey Joe tab strip
   with hotspots, cursor, etc. (unchanged).
5. Click any hotspot or pick from dropdown → exercise opens:
   - Inside the video pane (top): "← Back  Exercise N  ←/→",
     exercise video, [▶ Voice] [▶ Video] Auto-play row.
   - NO small tab image inside the exercise pane any more.
   - Bottom of page: the song's long tab strip is GONE; instead
     a centred exercise tab image is shown in that area, at its
     natural pixel size (no stretching).
6. Voice intro starts playing automatically.
7. While voice is playing, click "▶ Video":
   - Voice stops immediately.
   - Video plays from start.
8. Click "▶ Voice":
   - Video stops immediately.
   - Voice plays from start.
9. Pick a different exercise from dropdown → new tab image appears
   centred in the bottom area.
10. Press Esc → exercise closes:
    - Bottom area shows the song's long tab strip again, exactly
      as before opening the exercise.
    - Exercise tab image cleared from DOM (verify in DevTools that
      `#exercise-tab-img` has no src or empty src).
11. Stop the dev server.
```

## Reporting

Final report (≤300 words):
1. Demo block, verbatim, first.
2. What was changed (≤5 bullets).
3. Files touched.
4. Deviations from spec, with reason. "None" if you stuck to it.
5. Known issues / TODOs deferred.
