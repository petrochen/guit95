import "./styles.css";
import { parseIni } from "./parsers/ini.js";
import { loadChordDb, displayChordName, type Chord } from "./parsers/chd.js";
import { loadScore } from "./parsers/sco.js";
import { loadExercise, type ExerciseDef } from "./parsers/exr.js";
import { ChordDiagram } from "./components/ChordDiagram.js";
import { TabScroller } from "./components/TabScroller.js";
import { playSample } from "./audio/sample.js";
import { ScoreSync } from "./playback/sync.js";

// ── INI parser self-test (Phase 0, kept) ─────────────────────────────────────
const _r = parseIni("BackBmp=foo.bmp\n[chord]\nname=C\nname=D\n");
console.assert(_r.global["BackBmp"] === "foo.bmp", "INI self-test: global key");
console.assert(
  _r.sections.length === 1 && _r.sections[0] !== undefined && _r.sections[0].entries.length === 2,
  "INI self-test: section entries"
);
console.log("INI parser self-test:", _r.global["BackBmp"] === "foo.bmp" ? "PASS" : "FAIL");

// ── Constants ─────────────────────────────────────────────────────────────────
const CHD_URL  = "/assets/heyjoe/raw/chords/chords.chd";
const IMG_URL  = "/assets/heyjoe/raw/chords/heyjoe2.png";
const SCO_URL  = "/assets/heyjoe/raw/play/hjoe.sco";
const TAB_URL  = "/assets/heyjoe/raw/play/heyj-b2.png";
const WAV_BASE = "/assets/heyjoe/raw/chords/";
const ORIENTATION_KEY = "chord-orientation";
const SPEED_KEY = "playback-rate";

// ── State ─────────────────────────────────────────────────────────────────────
type Orientation = "vert" | "horiz";
let orientation: Orientation =
  (localStorage.getItem(ORIENTATION_KEY) as Orientation | null) ?? "vert";

// Chord lookup by id (populated after CHD loads)
const chordsById = new Map<number, Chord>();

// Currently displayed chords (so orientation toggle can re-render)
let nowChordId: number | null = null;
let nextChordId: number | null = null;

// Last chord ids delivered by onChordsChange (used for manual NOW override)
let lastNextChord: number | null = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const video      = document.getElementById("player")      as HTMLVideoElement;
const nowCanvas  = document.getElementById("now-canvas")  as HTMLCanvasElement;
const nextCanvas = document.getElementById("next-canvas") as HTMLCanvasElement;
const nowName    = document.getElementById("now-name")    as HTMLElement;
const nextName   = document.getElementById("next-name")   as HTMLElement;
const allChords  = document.getElementById("all-chords")  as HTMLElement;
const tabRow     = document.getElementById("tab-row")     as HTMLElement;
const btnVert    = document.getElementById("btn-vert")    as HTMLButtonElement;
const btnHoriz   = document.getElementById("btn-horiz")  as HTMLButtonElement;

// ── Exercise pane DOM refs ────────────────────────────────────────────────────
const exercisePane     = document.getElementById("exercise-pane")!;
const exTitle          = document.getElementById("ex-title")!;
const exVideo          = document.getElementById("ex-video") as HTMLVideoElement;
const exTab            = document.getElementById("ex-tab") as HTMLImageElement;
const exBack           = document.getElementById("ex-back") as HTMLButtonElement;
const exPrev           = document.getElementById("ex-prev") as HTMLButtonElement;
const exNext           = document.getElementById("ex-next") as HTMLButtonElement;
const exVoiceBtn       = document.getElementById("ex-voice") as HTMLButtonElement;
const exReplayBtn      = document.getElementById("ex-replay") as HTMLButtonElement;
const exAutoplay       = document.getElementById("ex-autoplay") as HTMLInputElement;
const exerciseSelect   = document.getElementById("exercise-select") as HTMLSelectElement;

// ── Exercise state ────────────────────────────────────────────────────────────
let currentExerciseNumber = 0; // 0 = no exercise open
const voiceAudio = new Audio(); // dedicated audio element for voice playback

// Playback controls
const speedSlider  = document.getElementById("speed-slider")  as HTMLInputElement;
const speedValue   = document.getElementById("speed-value")   as HTMLElement;
const abBtnA       = document.getElementById("ab-a")          as HTMLButtonElement;
const abBtnB       = document.getElementById("ab-b")          as HTMLButtonElement;
const loopToggle   = document.getElementById("loop-toggle")   as HTMLButtonElement;
const loopClear    = document.getElementById("loop-clear")    as HTMLButtonElement;

// Phase 3b controls
const preset50     = document.getElementById("preset-50")     as HTMLButtonElement;
const preset75     = document.getElementById("preset-75")     as HTMLButtonElement;
const preset100    = document.getElementById("preset-100")    as HTMLButtonElement;
const loopHereBtn  = document.getElementById("loop-here")     as HTMLButtonElement;

// ── Diagram renderers ─────────────────────────────────────────────────────────
const nowDiagram  = new ChordDiagram(nowCanvas,  IMG_URL);
const nextDiagram = new ChordDiagram(nextCanvas, IMG_URL);

// ── Speed control ──────────────────────────────────────────────────────────────
const savedRate = parseFloat(localStorage.getItem(SPEED_KEY) ?? "1");
const initialRate = isFinite(savedRate) && savedRate >= 0.25 && savedRate <= 1.5 ? savedRate : 1;

/** Update which speed preset button (if any) shows as active. */
function updatePresetActive(r: number): void {
  preset50.classList.toggle("active",  Math.abs(r - 0.5)  < 0.001);
  preset75.classList.toggle("active",  Math.abs(r - 0.75) < 0.001);
  preset100.classList.toggle("active", Math.abs(r - 1.0)  < 0.001);
}

function applyRate(r: number): void {
  video.playbackRate = r;
  // Preserve pitch — modern API + Safari fallback
  (video as any).preservesPitch = true;
  (video as any).webkitPreservesPitch = true;
  speedSlider.value = String(r);
  speedValue.textContent = r.toFixed(2) + "×";
  localStorage.setItem(SPEED_KEY, String(r));
  updatePresetActive(r);
}

// Initialise slider immediately (before video metadata loads)
speedSlider.value = String(initialRate);
speedValue.textContent = initialRate.toFixed(2) + "×";
updatePresetActive(initialRate);

speedSlider.addEventListener("input", () => applyRate(parseFloat(speedSlider.value)));

// Apply rate after video is ready (some browsers need this after src is set)
video.addEventListener("loadedmetadata", () => applyRate(initialRate), { once: true });

// Speed preset buttons
preset50.addEventListener("click",  () => applyRate(0.5));
preset75.addEventListener("click",  () => applyRate(0.75));
preset100.addEventListener("click", () => applyRate(1.0));

// ── A/B Loop state ─────────────────────────────────────────────────────────────
let aPixel: number | null = null;
let bPixel: number | null = null;
let loopOn = false;

// ScoreSync is set after score loads (in init). Guard with null check below.
let sync: ScoreSync | null = null;
// TabScroller reference set after creation
let tabScroller: TabScroller | null = null;
// Score reference (needed for bar walk in keyboard handlers)
let score: { bars: number[]; startingPixel: number; endingPixel: number } | null = null;

function updateMarkersUI(): void {
  // Update A button
  if (aPixel !== null && sync !== null) {
    const nb = sync.nearestBar(aPixel);
    abBtnA.textContent = nb ? `A bar ${nb.index}` : "A —";
    abBtnA.classList.add("set-a");
  } else {
    abBtnA.textContent = "A —";
    abBtnA.classList.remove("set-a");
  }

  // Update B button
  if (bPixel !== null && sync !== null) {
    const nb = sync.nearestBar(bPixel);
    abBtnB.textContent = nb ? `B bar ${nb.index}` : "B —";
    abBtnB.classList.add("set-b");
  } else {
    abBtnB.textContent = "B —";
    abBtnB.classList.remove("set-b");
  }

  // Loop button enabled only when both set and A < B
  const loopValid = aPixel !== null && bPixel !== null && aPixel < bPixel;
  loopToggle.disabled = !loopValid;
  if (!loopValid) loopOn = false;
  loopToggle.dataset["on"] = loopOn ? "true" : "false";
  loopToggle.textContent = loopOn ? "⟲ Loop ON" : "⟲ Loop";

  // Re-render markers on tab strip
  tabScroller?.setLoop({ a: aPixel, b: bPixel, on: loopOn });
}

/** If both A and B are set and A > B, swap them so A is always <= B. */
function normaliseAB(): void {
  if (aPixel !== null && bPixel !== null && aPixel > bPixel) {
    const tmp = aPixel;
    aPixel = bPixel;
    bPixel = tmp;
  }
}

function setAtCurrent(which: "a" | "b"): void {
  if (!sync) return;
  const currentPixel = sync.timeToPixel(video.currentTime);
  const nearest = sync.nearestBar(currentPixel);
  if (!nearest) return;
  if (which === "a") {
    aPixel = nearest.pixel;
  } else {
    bPixel = nearest.pixel;
  }
  normaliseAB();
  updateMarkersUI();
}

function clearAB(): void {
  aPixel = null;
  bPixel = null;
  loopOn = false;
  normaliseAB();
  updateMarkersUI();
}

function toggleLoop(): void {
  const loopValid = aPixel !== null && bPixel !== null && aPixel < bPixel;
  if (!loopValid) return;
  loopOn = !loopOn;
  updateMarkersUI();
}

abBtnA.addEventListener("click", () => setAtCurrent("a"));
abBtnB.addEventListener("click", () => setAtCurrent("b"));
loopToggle.addEventListener("click", toggleLoop);
loopClear.addEventListener("click", clearAB);

// ── "Loop here" button ────────────────────────────────────────────────────────
loopHereBtn.addEventListener("click", () => {
  if (!sync || !score) return;
  const currentPixel = sync.timeToPixel(video.currentTime);
  const nearest = sync.nearestBar(currentPixel);
  if (!nearest) return;

  // nearest.index is 1-indexed; bars[] is 0-indexed.
  // bars[nearest.index] is the bar AFTER nearest (since nearest is bars[nearest.index-1]).
  const bars = score.bars;
  let nextBarPx: number;
  if (nearest.index < bars.length) {
    nextBarPx = bars[nearest.index]!;
  } else {
    // At or past the last bar — use endingPixel
    nextBarPx = score.endingPixel;
  }

  aPixel = nearest.pixel;
  bPixel = nextBarPx;
  normaliseAB();
  loopOn = true;
  updateMarkersUI();
});

// ── Chord-button disable during playback ──────────────────────────────────────
video.addEventListener("play",  () => allChords.classList.add("playing"));
video.addEventListener("pause", () => allChords.classList.remove("playing"));

// ── Loop enforcement — timeupdate (low-frequency check) ────────────────────────
video.addEventListener("timeupdate", () => {
  if (!loopOn || !sync || aPixel === null || bPixel === null) return;
  const aTime = sync.pixelToTime(aPixel);
  const bTime = sync.pixelToTime(bPixel);
  if (video.currentTime >= bTime) {
    video.currentTime = aTime;
  }
});

// ── Loop enforcement — RAF (high-frequency check, ≤16ms overshoot) ────────────
let loopRafId: number | null = null;

function loopRafTick(): void {
  loopRafId = requestAnimationFrame(loopRafTick);
  if (!loopOn || !sync || aPixel === null || bPixel === null) return;
  const aTime = sync.pixelToTime(aPixel);
  const bTime = sync.pixelToTime(bPixel);
  if (video.currentTime >= bTime) {
    video.currentTime = aTime;
  }
}

loopRafId = requestAnimationFrame(loopRafTick);

// ── Exercise auto-play sequence ───────────────────────────────────────────────

function startExerciseAutoPlay(ex: ExerciseDef): void {
  if (!exAutoplay.checked) return;
  voiceAudio.src = ex.voiceFile;
  voiceAudio.currentTime = 0;
  voiceAudio.play().catch(() => {
    // User gesture may be required; fallback to manual buttons
  });
  voiceAudio.onended = () => {
    exVideo.play().catch(() => {});
  };
}

// ── Exercise open / close ─────────────────────────────────────────────────────

async function openExercise(num: number): Promise<void> {
  if (num < 1 || num > 15) return;
  currentExerciseNumber = num;

  // Pause song video, hide it; show exercise pane
  video.pause();
  video.style.display = "none";

  // Stop any previous exercise playback
  voiceAudio.pause();
  voiceAudio.onended = null;
  exVideo.pause();

  // Show exercise pane; grey out playback controls
  exercisePane.hidden = false;
  document.body.classList.add("exercise-mode");

  // Update UI labels / nav buttons
  exTitle.textContent = `Exercise ${num}`;
  exPrev.disabled = num <= 1;
  exNext.disabled = num >= 15;

  // Sync dropdown
  exerciseSelect.value = String(num);

  try {
    const ex = await loadExercise(`/assets/heyjoe/raw/exercice/${num}/`, num);

    // Set video source
    exVideo.src = ex.videoFile;
    exVideo.load();

    // Tab image
    if (ex.tabImage) {
      exTab.src = ex.tabImage;
      exTab.hidden = false;
    } else {
      exTab.hidden = true;
    }

    // Wire manual buttons (fresh per exercise)
    exVoiceBtn.onclick = () => {
      voiceAudio.currentTime = 0;
      voiceAudio.play().catch(() => {});
    };
    exReplayBtn.onclick = () => {
      exVideo.currentTime = 0;
      exVideo.play().catch(() => {});
    };

    // Start auto-play sequence: voice → video
    startExerciseAutoPlay(ex);
  } catch (err) {
    console.error(`[exercise] Failed to load exercise ${num}:`, err);
  }
}

function closeExercise(): void {
  // Stop exercise media; release memory
  voiceAudio.pause();
  voiceAudio.onended = null;
  voiceAudio.src = "";
  exVideo.pause();
  exVideo.removeAttribute("src");
  exVideo.load();

  // Hide exercise pane, restore song video; reactivate playback controls
  exercisePane.hidden = true;
  video.style.display = "";
  document.body.classList.remove("exercise-mode");

  // Reset dropdown
  exerciseSelect.value = "";

  currentExerciseNumber = 0;
}

// Wire exercise pane buttons
exBack.addEventListener("click", closeExercise);
exPrev.addEventListener("click", () => {
  if (currentExerciseNumber > 1) openExercise(currentExerciseNumber - 1);
});
exNext.addEventListener("click", () => {
  if (currentExerciseNumber < 15) openExercise(currentExerciseNumber + 1);
});

// Wire exercise selector dropdown
exerciseSelect.addEventListener("change", () => {
  const val = exerciseSelect.value;
  if (val === "") {
    if (currentExerciseNumber > 0) closeExercise();
  } else {
    openExercise(parseInt(val, 10));
  }
});

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

/** Returns true when the event target is a text-input-like element. */
function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}

/**
 * Move a loop boundary by one bar in the requested direction.
 * which: "A" moves aPixel, "B" moves bPixel.
 * direction: -1 = toward start (earlier), +1 = toward end (later).
 *
 * "Priming" behaviour:
 *   - If the boundary is null and the move is the natural expand direction
 *     (A goes left = -1, B goes right = +1), set to nearest bar first.
 *   - Shift-shrink with an unset boundary is a no-op (nothing to shrink).
 *
 * Clamping:
 *   - aPixel >= startingPixel, bPixel <= endingPixel.
 *   - aPixel < bPixel (refuse a move that would invert or equalise).
 */
function shiftLoopBoundary(which: "A" | "B", direction: -1 | 1): void {
  if (!sync || !score) return;
  const bars = score.bars;
  if (bars.length === 0) return;

  if (which === "A") {
    if (aPixel === null) {
      // Priming: only if expanding (direction = -1)
      if (direction !== -1) return;
      const currentPixel = sync.timeToPixel(video.currentTime);
      const nb = sync.nearestBar(currentPixel);
      if (!nb) return;
      aPixel = nb.pixel;
      normaliseAB();
      updateMarkersUI();
      return;
    }

    // Walk bars in direction
    let bestIdx = -1;
    if (direction === -1) {
      // Find the largest bar pixel < current aPixel
      for (let i = bars.length - 1; i >= 0; i--) {
        if (bars[i]! < aPixel) { bestIdx = i; break; }
      }
    } else {
      // Find the smallest bar pixel > current aPixel
      for (let i = 0; i < bars.length; i++) {
        if (bars[i]! > aPixel) { bestIdx = i; break; }
      }
    }

    if (bestIdx === -1) return; // already at boundary

    let candidate = bars[bestIdx]!;

    // Clamp at startingPixel
    candidate = Math.max(score.startingPixel, candidate);

    // Shrink guard: must remain < bPixel (if B is set)
    if (bPixel !== null && candidate >= bPixel) return;

    aPixel = candidate;

  } else {
    // which === "B"
    if (bPixel === null) {
      // Priming: only if expanding (direction = +1)
      if (direction !== 1) return;
      const currentPixel = sync.timeToPixel(video.currentTime);
      const nb = sync.nearestBar(currentPixel);
      if (!nb) return;
      bPixel = nb.pixel;
      normaliseAB();
      updateMarkersUI();
      return;
    }

    // Walk bars in direction
    let bestIdx = -1;
    if (direction === 1) {
      // Find the smallest bar pixel > current bPixel
      for (let i = 0; i < bars.length; i++) {
        if (bars[i]! > bPixel) { bestIdx = i; break; }
      }
    } else {
      // Find the largest bar pixel < current bPixel
      for (let i = bars.length - 1; i >= 0; i--) {
        if (bars[i]! < bPixel) { bestIdx = i; break; }
      }
    }

    if (bestIdx === -1) return; // already at boundary

    let candidate = bars[bestIdx]!;

    // Clamp at endingPixel
    candidate = Math.min(score.endingPixel, candidate);

    // Shrink guard: must remain > aPixel (if A is set)
    if (aPixel !== null && candidate <= aPixel) return;

    bPixel = candidate;
  }

  normaliseAB();
  updateMarkersUI();
}

/**
 * Seek video to the previous or next bar boundary.
 * direction: -1 = previous bar, +1 = next bar.
 */
function seekBars(direction: -1 | 1): void {
  if (!sync || !score) return;
  const bars = score.bars;
  if (bars.length === 0) return;

  const currentPixel = sync.timeToPixel(video.currentTime);

  let targetPx: number | null = null;
  if (direction === -1) {
    // Previous: largest bar < currentPixel
    for (let i = bars.length - 1; i >= 0; i--) {
      if (bars[i]! < currentPixel - 1) { targetPx = bars[i]!; break; }
    }
  } else {
    // Next: smallest bar > currentPixel
    for (let i = 0; i < bars.length; i++) {
      if (bars[i]! > currentPixel + 1) { targetPx = bars[i]!; break; }
    }
  }

  if (targetPx === null) return;
  video.currentTime = sync.pixelToTime(targetPx);
}

function handleKey(e: KeyboardEvent): void {
  if (isTypingTarget(e)) return;

  // Esc closes the exercise view; no other hotkeys work while exercise is open
  if (e.code === "Escape" && currentExerciseNumber > 0) {
    closeExercise();
    e.preventDefault();
    return;
  }

  // While exercise view is open, suppress all other song hotkeys
  if (currentExerciseNumber > 0) return;

  switch (e.code) {
    case "Space":
      e.preventDefault();
      if (video.paused) {
        video.play().catch(() => { /* ignore AbortError */ });
      } else {
        video.pause();
      }
      break;

    case "BracketLeft":
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+[ : move A toward end (shrinks loop from left)
        shiftLoopBoundary("A", 1);
      } else {
        // [ : move A toward start (expand loop left / prime A)
        shiftLoopBoundary("A", -1);
      }
      break;

    case "BracketRight":
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+] : move B toward start (shrinks loop from right)
        shiftLoopBoundary("B", -1);
      } else {
        // ] : move B toward end (expand loop right / prime B)
        shiftLoopBoundary("B", 1);
      }
      break;

    case "KeyL":
      e.preventDefault();
      toggleLoop();
      break;

    case "KeyC":
      e.preventDefault();
      clearAB();
      break;

    case "ArrowLeft":
      e.preventDefault();
      if (e.shiftKey) {
        seekBars(-1);
      } else {
        video.currentTime = Math.max(0, video.currentTime - 5);
      }
      break;

    case "ArrowRight":
      e.preventDefault();
      if (e.shiftKey) {
        seekBars(1);
      } else {
        video.currentTime = Math.min(video.duration || Infinity, video.currentTime + 5);
      }
      break;
  }
}

window.addEventListener("keydown", handleKey);

// ── Orientation ───────────────────────────────────────────────────────────────
function updateOrientationButtons(): void {
  btnVert.classList.toggle("active", orientation === "vert");
  btnHoriz.classList.toggle("active", orientation === "horiz");
}

function setOrientation(o: Orientation): void {
  orientation = o;
  localStorage.setItem(ORIENTATION_KEY, o);
  updateOrientationButtons();
  // Re-render both previews with new orientation
  renderPreviews(nowChordId, nextChordId);
}

btnVert.addEventListener("click",  () => setOrientation("vert"));
btnHoriz.addEventListener("click", () => setOrientation("horiz"));

// ── NOW / NEXT preview rendering ──────────────────────────────────────────────
function renderPreviews(curId: number | null, nxtId: number | null): void {
  // NOW
  const nowChord = curId !== null ? chordsById.get(curId) ?? null : null;
  if (nowChord) {
    nowName.textContent = displayChordName(nowChord.name);
    const rect = orientation === "vert" ? nowChord.picRect : nowChord.picRectUS;
    nowDiagram.render(rect);
    const [r, g, b] = nowChord.rgbHighlight;
    nowCanvas.style.borderColor = `rgb(${r},${g},${b})`;
  } else {
    nowName.textContent = "—";
    nowDiagram.clear();
    nowCanvas.style.borderColor = "";
  }

  // NEXT
  const nextChord = nxtId !== null ? chordsById.get(nxtId) ?? null : null;
  if (nextChord) {
    nextName.textContent = displayChordName(nextChord.name);
    const rect = orientation === "vert" ? nextChord.picRect : nextChord.picRectUS;
    nextDiagram.render(rect);
  } else {
    nextName.textContent = "—";
    nextDiagram.clear();
  }
}

// ── Callback from TabScroller ─────────────────────────────────────────────────
function handleChordsChange(curId: number | null, nxtId: number | null): void {
  nowChordId    = curId;
  nextChordId   = nxtId;
  lastNextChord = nxtId;
  renderPreviews(curId, nxtId);
}

// ── Initialise ────────────────────────────────────────────────────────────────
async function init(): Promise<void> {
  // Populate exercise selector dropdown (15 exercises for Hey Joe)
  for (let i = 1; i <= 15; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `Exercise ${i}`;
    exerciseSelect.appendChild(opt);
  }

  // Load chord sprite sheet into both diagrams
  await Promise.all([nowDiagram.load(), nextDiagram.load()]);

  // Load chord database
  const db = await loadChordDb(CHD_URL);
  const chords = db.chords;

  console.assert(chords.length === 11, `CHD parser self-test: expected 11 chords, got ${chords.length}`);
  console.log(`CHD parser self-test: ${chords.length} chords loaded`);

  // Populate lookup map
  for (const chord of chords) {
    chordsById.set(chord.id, chord);
  }

  // Build all-chords buttons (play sample only — no latching)
  for (const chord of chords) {
    const btn = document.createElement("button");
    btn.className = "chord-btn";
    btn.textContent = displayChordName(chord.name);
    btn.title = chord.comments || displayChordName(chord.name);
    btn.addEventListener("click", () => {
      playSample(WAV_BASE + chord.sound);
      // Show this chord in NOW preview; preserve whatever NEXT currently shows.
      // (Overridden by the next playback tick when video is playing.)
      nowChordId = chord.id;
      renderPreviews(chord.id, lastNextChord);
    });
    allChords.appendChild(btn);
  }

  updateOrientationButtons();

  // Load SCO score file
  const loadedScore = await loadScore(SCO_URL);
  score = loadedScore;

  // SCO parser self-test
  console.log(`SCO parser self-test: ${loadedScore.events.length} events, ${loadedScore.bars.length} bars`);
  console.assert(loadedScore.events.length === 534, `SCO self-test: expected 534 events, got ${loadedScore.events.length}`);

  // Create ScoreSync helper for A/B loop math
  sync = new ScoreSync(loadedScore, video);

  // Create TabScroller
  tabScroller = new TabScroller(tabRow, {
    score: loadedScore,
    pngUrl: TAB_URL,
    video,
    onChordsChange: handleChordsChange,
    onDifficultyClick: (exercice, _sound) => {
      openExercise(exercice);
    },
  });

  // Render difficulty hotspots from the SCO data
  tabScroller.setDifficulties(loadedScore.difficulties);

  // Initial marker UI render (clears buttons, disables loop toggle)
  updateMarkersUI();
}

init().catch((err) => {
  console.error("Init failed:", err);
});
