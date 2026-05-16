# Phase 4b — Exercise Player (focus mode + auto-play sequence)

> **Self-contained spec for a Sonnet sub-agent.** No prior chat context.
> This is the second half of the original Phase 4 (Phase 4a + 4a-2 did
> the difficulty hotspots and chord-button fixes).

## Context

Personal-use web app for learning guitar from a 1995 Ubi Soft CD.
Stack: Vite + TypeScript + vanilla DOM. Working directory:
`/Users/apetrochenko/src/guitar/`.

Read in order:
1. `../SPEC.md` — original CD data formats. Sections most relevant:
   - §2.1 (per-song content; Hey Joe has 16 exercises)
   - §3.1–3.2 (scene file format, INI vocabulary)
   - §3.4 (SCO `[difficulty]` blocks reference exercise N via `exercice=N`)
2. `../ROADMAP.md` — overall plan.
3. Prior phase specs `00`, `01`, `02`, `02b`, `02c`, `03`, `03b`,
   `03c`, `04a`, `04a2`. Phase 4a-2 wired hotspot click to a stub
   `console.log("[hotspot] Open exercise N (sound: ...)")`. This phase
   replaces that stub with real exercise opening.

State recap:
- Hey Joe is the only song wired so far.
- Difficulty hotspots have `exercice=N` (1..16) and a French voice
  WAV path (`sound=...\%sex4-tit.wav`).
- The 16 exercise scenes live in
  `public/assets/heyjoe/raw/exercice/{0..15}/`.
- Exercise 0 (`exercice/0/`) is the original CD's "exercise list"
  entry scene — for Phase 4b we **skip it** and treat exercises 1–15
  as the real ones.

## Goal of Phase 4b

When the user clicks a difficulty hotspot, the Hey Joe view is
replaced with a focused **exercise view**:

```
┌────────────────────────────────────────────────┐
│ ← Back to song    Exercise 4         [← 3] [5 →]│
├────────────────────────────────────────────────┤
│                                                │
│        [Exercise demo video]                   │
│                                                │
├────────────────────────────────────────────────┤
│        [Exercise tab strip image]              │
├────────────────────────────────────────────────┤
│  [▶ Voice]  [▶ Video]    Auto-play: ☑           │
└────────────────────────────────────────────────┘
```

Behaviour:
- Voice intro plays first, then the demo video plays automatically.
- Both can be replayed via the buttons.
- Prev/next buttons jump to the previous / next exercise (1..15
  cyclical or clamped — see DoD).
- "Back to song" returns to the song view. Song state (current time,
  A/B/loop, speed, NOW/NEXT) is preserved.

## Files & data

### Per-exercise folder

Each `public/assets/heyjoe/raw/exercice/N/` (N = 1..15) contains:
- `<N>-1.AVI`, sometimes `<N>-2.AVI`, `<N>-3.AVI` — exercise demo
  videos (short, 1–3 MB each).
- `rex<N>-1.wav`, `rex<N>-2.wav`, `rex<N>-3.wav` — voice
  commentary segments.
- `sco<N>-2.bmp` — exercise tab image (small bitmap of the bars
  being practised).
- `EX<N>.EXR` — the original sequence script (INI with `[sequence]`
  blocks).

### What the EXR's "start" sequence typically does

Look at `EX1.EXR`'s sequence "1" (which `start` jumps to via
`gotoseq=1`). Pattern:
```
aviopen=1-1.avi
playsnd=%sex1-1.wav      ← %s is language prefix; on the CD-mounted
                            data lowercased Russian = "r", so the
                            actual file is rex1-1.wav
waitnotify=1
aviplay=0
waitnotify=1
showpicture=1,1          ← chord diagrams, ignored in Phase 4b
...
```

For Phase 4b we ignore the full sequence and use a pragmatic
shortcut: play the first voice WAV → on `ended`, play the first
video. The user can replay either via the bottom buttons. This
matches the original UX for the most common case without writing the
full sequence runner (deferred to Phase 4c if ever).

## Scope — IN

### 1. Asset pipeline extension

Update `scripts/build-assets.sh` to convert all exercise videos:
- For each `heyjoe/raw/exercice/<N>/<file>.AVI` (N = 1..15),
  produce `<file>.mp4` next to it (via the same `ffmpeg` command
  used for `hjoe.mp4`: `-c:v libx264 -preset slow -crf 22 -c:a aac
  -b:a 128k -movflags +faststart`).
- Skip if `.mp4` already newer than `.AVI` (idempotent).
- Convert exercise tab BMPs to PNG too (same `sips` step, just
  iterating over `heyjoe/raw/exercice/<N>/sco*.bmp`).
- Print progress per file.

After running `npm run assets`, every needed asset for Hey Joe
exercises 1..15 is browser-ready.

### 2. Exercise EXR parser

`src/parsers/exr.ts`:

```ts
import { loadIni } from "./load.js";

export type ExerciseDef = {
  number: number;             // 1..15
  voiceFile: string;          // resolved relative path to .wav (lowercased, %s expanded)
  videoFile: string;          // resolved relative path to .mp4 (converted from .avi)
  tabImage: string | null;    // resolved relative path to .png (converted from .bmp), or null if none
};

export async function loadExercise(folderUrl: string, number: number): Promise<ExerciseDef>;
```

Implementation:
- Build URL to `EX<N>.EXR` from the folder + number; load via `loadIni`.
- Walk all sections looking for the **first** `aviopen=...` (video
  filename) and the **first** `playsnd=...` (voice filename).
- Resolve `%s` macro to `r` (Russian — the only language we need).
  `%sex1-1.wav` → `rex1-1.wav`.
- Resolve `.AVI` → `.mp4` and `.BMP` → `.png` (the asset pipeline has
  already produced these).
- For tab image: search for a `[picture]` section with `bitmap=sco*.bmp`
  (any value matching the pattern). If found, return its path as PNG.
  If not found, return null.
- All paths are returned **lowercased** (the disk has lowercased
  filenames after Phase 0's pipeline).
- Skip a section silently if it doesn't have the expected keys; log
  to console on parse failure.

### 3. Exercise screen DOM + layout

Add a new sibling `<div id="exercise-view">` to the page (HTML or
created dynamically by main.ts). Default `display: none`.

Structure:
```html
<div id="exercise-view" hidden>
  <header id="exercise-header">
    <button id="exercise-back" type="button">← Back to song</button>
    <span id="exercise-title">Exercise —</span>
    <div class="exercise-nav">
      <button id="exercise-prev" type="button">← Prev</button>
      <button id="exercise-next" type="button">Next →</button>
    </div>
  </header>
  <div id="exercise-main">
    <video id="exercise-video" controls></video>
    <img id="exercise-tab" alt="Exercise tab" />
  </div>
  <div id="exercise-controls">
    <button id="exercise-voice" type="button">▶ Voice</button>
    <button id="exercise-replay-video" type="button">▶ Video</button>
    <label class="autoplay-toggle">
      <input id="exercise-autoplay" type="checkbox" checked /> Auto-play
    </label>
  </div>
</div>
```

CSS — add to `styles.css`:
- `#exercise-view { position: fixed; inset: 0; background: var(--bg); z-index: 100; display: grid; grid-template-rows: auto 1fr auto; }`
  (Cover the whole viewport; song view stays underneath but hidden.)
- `#exercise-view[hidden] { display: none; }` (defensively).
- `#exercise-header { display: flex; align-items: center; gap: 16px; padding: 10px 16px; background: #0a0a0a; border-bottom: 1px solid var(--border); }`
- `#exercise-title { font-size: 1.05rem; font-weight: 600; flex: 1; }`
- `.exercise-nav { display: flex; gap: 6px; }`
- `#exercise-main { display: grid; grid-template-rows: 1fr auto; padding: 16px; gap: 12px; min-height: 0; overflow: hidden; }`
- `#exercise-video { width: 100%; height: 100%; object-fit: contain; background: #000; min-height: 0; }`
- `#exercise-tab { display: block; max-width: 100%; max-height: 220px; image-rendering: pixelated; align-self: center; justify-self: center; border: 1px solid var(--border); }`
- `#exercise-controls { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #0a0a0a; border-top: 1px solid var(--border); font-size: 0.9rem; }`
- Buttons reuse `.chord-btn` base styling.

### 4. Open / close transitions

In `main.ts`:

```ts
const SONG_VIEW_NODES = [
  document.getElementById("header"),
  document.getElementById("main"),
  document.getElementById("playback-controls"),
  document.getElementById("tab-row"),
];
const exerciseView = document.getElementById("exercise-view");
const songVideo = document.getElementById("player") as HTMLVideoElement;
const exerciseVideo = document.getElementById("exercise-video") as HTMLVideoElement;

let currentExerciseNumber = 0; // 0 = no exercise open

async function openExercise(num: number) {
  if (num < 1 || num > 15) return;
  currentExerciseNumber = num;
  // Pause song video; hide song view; show exercise view.
  songVideo.pause();
  for (const n of SONG_VIEW_NODES) if (n) n.style.display = "none";
  exerciseView!.hidden = false;
  // Load exercise.
  const ex = await loadExercise(`/assets/heyjoe/raw/exercice/${num}/`, num);
  document.getElementById("exercise-title")!.textContent = `Exercise ${num}`;
  exerciseVideo.src = ex.videoFile;
  // Tab image visibility
  const tabImg = document.getElementById("exercise-tab") as HTMLImageElement;
  if (ex.tabImage) { tabImg.src = ex.tabImage; tabImg.hidden = false; }
  else tabImg.hidden = true;
  // Start auto-play sequence: voice → video.
  startExerciseAutoPlay(ex);
}

function closeExercise() {
  exerciseVideo.pause();
  exerciseVideo.removeAttribute("src");
  exerciseVideo.load(); // release any audio
  exerciseView!.hidden = true;
  for (const n of SONG_VIEW_NODES) if (n) n.style.display = "";
  currentExerciseNumber = 0;
}
```

### 5. Auto-play sequence

```ts
const voiceAudio = new Audio();    // dedicated; separate from playSample shared element

function startExerciseAutoPlay(ex: ExerciseDef) {
  if (!autoPlayCheckbox.checked) return;
  voiceAudio.src = ex.voiceFile;
  voiceAudio.play().catch(() => { /* user gesture might be required; fallback to manual */ });
  voiceAudio.onended = () => exerciseVideo.play().catch(() => {});
}
```

Buttons:
- `▶ Voice` — `voiceAudio.currentTime = 0; voiceAudio.play();`
- `▶ Video` — `exerciseVideo.currentTime = 0; exerciseVideo.play();`
- `← Prev` — `openExercise(currentExerciseNumber - 1)` (clamp at 1).
- `Next →` — `openExercise(currentExerciseNumber + 1)` (clamp at 15).
- `← Back to song` — `closeExercise()`.

### 6. Wire hotspot click

In the existing `onDifficultyClick` callback in `main.ts`, replace
the `console.log` stub with `openExercise(exercice)`. (The `sound`
parameter is no longer needed by Phase 4b but keep the callback
signature.)

### 7. Keyboard shortcut

Add `Esc` to close exercise view (only when exercise is open).
Update the `handleKey` function:
```ts
if (e.code === "Escape" && currentExerciseNumber > 0) {
  closeExercise();
  e.preventDefault();
  return;
}
```

The other hotkeys (Space, [, ], etc.) continue to control the SONG
video. While in exercise view they should be **disabled** (most are
about A/B loop and song playback). Easiest: at the top of
`handleKey`, after `isTypingTarget`, also bail out early if
`currentExerciseNumber > 0` — except for Esc.

## Scope — OUT (do not do)

- ❌ Full 15-opcode sequence runner — only the
  voice→video shortcut for Phase 4b.
- ❌ Render chord-diagram overlays from EXR `[picture]` definitions
  on top of exercise video.
- ❌ Multiple voice/video segments per exercise — only segment 1.
- ❌ Exercise list panel (separate browse-all view) — defer to a
  future phase if needed.
- ❌ Toolkit (10 generic exercises) — only Hey Joe per-song
  exercises.
- ❌ Per-exercise tempo / loop controls (the song view's slow-down +
  loop only applies to the song video).
- ❌ Sequence runner state persistence between page reloads.
- ❌ Localising voice files to anything other than Russian (`%s = r`).

## Definition of Done

- [ ] `scripts/build-assets.sh` extended; running `npm run assets`
      produces `.mp4` for every exercise AVI and `.png` for every
      exercise tab BMP. Re-running the script is fast (idempotent).
- [ ] `src/parsers/exr.ts` exists; loading exercise 1 returns a
      `ExerciseDef` with non-empty `voiceFile`, `videoFile`, and a
      `tabImage` (sco1-2.png).
- [ ] Clicking any difficulty hotspot opens the exercise screen for
      the linked exercise number.
- [ ] Exercise screen replaces the song view (song view nodes hidden,
      song video paused).
- [ ] Auto-play with checkbox checked: voice plays first, then video
      plays automatically when voice ends.
- [ ] Manual buttons `▶ Voice` and `▶ Video` work.
- [ ] Prev/Next exercise buttons load adjacent exercises (clamp at
      1..15).
- [ ] `Esc` and "← Back to song" both close the exercise view.
- [ ] After closing: song view restored, song video at the same
      currentTime as before, A/B/loop/speed all preserved.
- [ ] Other hotkeys (Space, [, ]) do nothing while exercise view is
      open.
- [ ] No console errors during a full open → autoplay → next → back
      cycle.
- [ ] All Phase 4a/4a-2 features intact (hotspots render, chord-button
      pause-only behaviour, NOW/NEXT updates).
- [ ] All Phase 3 / 2 features intact in song view.
- [ ] `git status` clean; commit message starts `phase 4b:`.

## Demo (mandatory — verbatim in your final report)

```
1. cd ~/src/guitar
2. npm run assets   (converts the 45+ exercise AVIs to MP4 — first
                    run takes a couple of minutes; subsequent runs
                    are near-instant)
3. npm run dev
4. Open http://localhost:5173/
5. Click any coloured hotspot on the tab strip (the popular ones
   reference exercise 4):
   - Song view disappears.
   - Exercise view fills the screen: header "← Back to song
     Exercise 4   ← Prev   Next →", a video player, a small tab
     strip image below, and bottom controls.
   - Voice intro starts playing automatically (Russian commentary).
6. After the voice ends, the demo video plays automatically.
7. Click "▶ Voice" → voice replays from start.
8. Click "▶ Video" → demo video replays from start.
9. Click "Next →" → moves to exercise 5; new voice + video load.
10. Click "← Prev" twice → jumps to exercise 3.
11. Press Esc → exercise view closes, song view returns. Song video
    is at the same position you left it; speed/A/B preserved.
12. Click "← Back to song" from a freshly opened exercise → same
    return behaviour.
13. Stop the dev server.
```

## Reporting

Final report (≤400 words):
1. Demo block, verbatim, first.
2. What was built (≤8 bullets).
3. Files touched.
4. Asset pipeline footprint: `du -sh public/assets/heyjoe/raw/exercice`
   before and after the new ffmpeg pass.
5. Deviations from spec, with reason. "None" if you stuck to it.
6. Known issues / TODOs deferred (e.g. only segment 1 implemented;
   chord-diagram overlays not rendered).
