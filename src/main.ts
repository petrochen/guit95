import "./styles.css";
import { parseIni } from "./parsers/ini.js";
import { loadChordDb, displayChordName, type Chord } from "./parsers/chd.js";
import { loadScore } from "./parsers/sco.js";
import { loadExercise, type ExerciseDef } from "./parsers/exr.js";
import { ChordDiagram } from "./components/ChordDiagram.js";
import { TabScroller } from "./components/TabScroller.js";
import { playSample } from "./audio/sample.js";
import { ScoreSync } from "./playback/sync.js";
import { SONGS, getSongBySlug, type SongMeta } from "./songs.js";
import {
  getPosition, setPosition,
  getCompleted, toggleCompleted, resetProgress,
} from "./state/progress.js";

// ── INI parser self-test (Phase 0, kept) ─────────────────────────────────────
const _r = parseIni("BackBmp=foo.bmp\n[chord]\nname=C\nname=D\n");
console.assert(_r.global["BackBmp"] === "foo.bmp", "INI self-test: global key");
console.assert(
  _r.sections.length === 1 && _r.sections[0] !== undefined && _r.sections[0].entries.length === 2,
  "INI self-test: section entries"
);
console.log("INI parser self-test:", _r.global["BackBmp"] === "foo.bmp" ? "PASS" : "FAIL");

// ── Constants ─────────────────────────────────────────────────────────────────
const ORIENTATION_KEY = "chord-orientation";
const SPEED_KEY = "default-speed";      // Feature 5: was "playback-rate"
const VOLUME_KEY = "default-volume";

// ── DOM refs (always present) ─────────────────────────────────────────────────
const homeView      = document.getElementById("home-view")!;
const header        = document.getElementById("header")!        as HTMLElement;
const mainEl        = document.getElementById("main")!          as HTMLElement;
const playbackCtls  = document.getElementById("playback-controls")! as HTMLElement;
const tabRowEl      = document.getElementById("tab-row")!       as HTMLElement;
const video         = document.getElementById("player")!        as HTMLVideoElement;
const nowCanvas     = document.getElementById("now-canvas")!    as HTMLCanvasElement;
const nextCanvas    = document.getElementById("next-canvas")!   as HTMLCanvasElement;
const nowName       = document.getElementById("now-name")!      as HTMLElement;
const nextName      = document.getElementById("next-name")!     as HTMLElement;
const nowHand       = document.getElementById("now-hand")!      as HTMLImageElement;
const allChords     = document.getElementById("all-chords")!    as HTMLElement;
const tabRow        = document.getElementById("tab-row")!       as HTMLElement;
const btnVert       = document.getElementById("btn-vert")!      as HTMLButtonElement;
const btnHoriz      = document.getElementById("btn-horiz")!     as HTMLButtonElement;
const songTitleEl   = document.getElementById("song-title")!    as HTMLElement;
const backToHome    = document.getElementById("back-to-home")!  as HTMLButtonElement;

// ── Exercise pane DOM refs ────────────────────────────────────────────────────
const exercisePane     = document.getElementById("exercise-pane")!;
const exTitle          = document.getElementById("ex-title")!;
const exVideo          = document.getElementById("ex-video")! as HTMLVideoElement;
const exerciseTabRow   = document.getElementById("exercise-tab-row")! as HTMLElement;
const exerciseTabImg   = document.getElementById("exercise-tab-img")! as HTMLImageElement;
const exBack           = document.getElementById("ex-back")!  as HTMLButtonElement;
const exPrev           = document.getElementById("ex-prev")!  as HTMLButtonElement;
const exNext           = document.getElementById("ex-next")!  as HTMLButtonElement;
const exVoiceBtn       = document.getElementById("ex-voice")! as HTMLButtonElement;
const exReplayBtn      = document.getElementById("ex-replay")! as HTMLButtonElement;
const exAutoplay       = document.getElementById("ex-autoplay")! as HTMLInputElement;
const exDoneBtn        = document.getElementById("ex-done")! as HTMLButtonElement;
const exerciseSelect   = document.getElementById("exercise-select")! as HTMLSelectElement;

// ── Help + Settings overlay refs ─────────────────────────────────────────────
const helpOverlay    = document.getElementById("help-overlay")!;
const helpClose      = document.getElementById("help-close")!  as HTMLButtonElement;
const settingsOverlay       = document.getElementById("settings-overlay")!;
const settingClose          = document.getElementById("setting-close")! as HTMLButtonElement;
const settingDefaultSpeed   = document.getElementById("setting-default-speed")! as HTMLInputElement;
const settingDefaultSpeedVal = document.getElementById("setting-default-speed-value")! as HTMLElement;
const settingDefaultVolume  = document.getElementById("setting-default-volume")! as HTMLInputElement;
const settingDefaultVolVal  = document.getElementById("setting-default-volume-value")! as HTMLElement;
const settingResetProgress  = document.getElementById("setting-reset-progress")! as HTMLButtonElement;
const settingsBtn           = document.getElementById("settings-btn")! as HTMLButtonElement;

// ── Speed controls ─────────────────────────────────────────────────────────────
const speedSlider  = document.getElementById("speed-slider")!  as HTMLInputElement;
const speedValue   = document.getElementById("speed-value")!   as HTMLElement;
const abBtnA       = document.getElementById("ab-a")!          as HTMLButtonElement;
const abBtnB       = document.getElementById("ab-b")!          as HTMLButtonElement;
const loopToggle   = document.getElementById("loop-toggle")!   as HTMLButtonElement;
const loopClear    = document.getElementById("loop-clear")!    as HTMLButtonElement;
const preset50     = document.getElementById("preset-50")!     as HTMLButtonElement;
const preset75     = document.getElementById("preset-75")!     as HTMLButtonElement;
const preset100    = document.getElementById("preset-100")!    as HTMLButtonElement;
const loopHereBtn  = document.getElementById("loop-here")!     as HTMLButtonElement;

// ── Persistent global state (survives song changes) ───────────────────────────
type Orientation = "vert" | "horiz";
let orientation: Orientation =
  (localStorage.getItem(ORIENTATION_KEY) as Orientation | null) ?? "vert";

const savedRate = parseFloat(localStorage.getItem(SPEED_KEY) ?? "1");
const initialRate = isFinite(savedRate) && savedRate >= 0.25 && savedRate <= 1.5 ? savedRate : 1;

const savedVolume = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "0.8");
const initialVolume = isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1 ? savedVolume : 0.8;

// ── Position save interval ────────────────────────────────────────────────────
let positionSaveIntervalId: ReturnType<typeof setInterval> | null = null;

function saveSongPosition(): void {
  if (!currentMeta) return;
  // Skip while exercise is open — preserve last song time, not stale value
  if (currentExerciseDisplayIdx !== null) return;
  if (!isNaN(video.currentTime) && video.currentTime > 0) {
    setPosition(currentMeta.slug, video.currentTime);
  }
}

function startPositionSave(): void {
  stopPositionSave();
  positionSaveIntervalId = setInterval(saveSongPosition, 3000);
}

function stopPositionSave(): void {
  if (positionSaveIntervalId !== null) {
    clearInterval(positionSaveIntervalId);
    positionSaveIntervalId = null;
  }
}

// ── Per-song mutable state ────────────────────────────────────────────────────
// Reset on each song load.

let chordsById = new Map<number, Chord>();
let nowChordId: number | null = null;
let nextChordId: number | null = null;
let lastNextChord: number | null = null;

let currentExerciseDisplayIdx: number | null = null;
let currentExerciseCdNum: number | null = null;

const cdToDisplay = new Map<number, number>();
const displayToCd: number[] = [];

let aPixel: number | null = null;
let bPixel: number | null = null;
let loopOn = false;

let sync: ScoreSync | null = null;
let tabScroller: TabScroller | null = null;
let score: { bars: number[]; startingPixel: number; endingPixel: number } | null = null;

let nowDiagram: ChordDiagram | null = null;
let nextDiagram: ChordDiagram | null = null;

// voiceAudio: one persistent element (recreated per song for src cleanup)
let voiceAudio = new Audio();

// Current meta (for exercise paths)
let currentMeta: SongMeta | null = null;

// RAF id for loop enforcement
let loopRafId: number | null = null;

// ── Speed control initialisation (once, not per song) ─────────────────────────

function updatePresetActive(r: number): void {
  preset50.classList.toggle("active",  Math.abs(r - 0.5)  < 0.001);
  preset75.classList.toggle("active",  Math.abs(r - 0.75) < 0.001);
  preset100.classList.toggle("active", Math.abs(r - 1.0)  < 0.001);
}

function applyRate(r: number): void {
  video.playbackRate = r;
  (video as any).preservesPitch = true;
  (video as any).webkitPreservesPitch = true;
  speedSlider.value = String(r);
  speedValue.textContent = r.toFixed(2) + "×";
  localStorage.setItem(SPEED_KEY, String(r));
  updatePresetActive(r);
  // Keep settings slider in sync
  settingDefaultSpeed.value = String(r);
  settingDefaultSpeedVal.textContent = r.toFixed(2) + "×";
}

function applyVolume(v: number): void {
  video.volume = v;
  localStorage.setItem(VOLUME_KEY, String(v));
  // Keep settings slider in sync
  settingDefaultVolume.value = String(v);
  settingDefaultVolVal.textContent = Math.round(v * 100) + "%";
}

// Initialise sliders once on page load
speedSlider.value = String(initialRate);
speedValue.textContent = initialRate.toFixed(2) + "×";
updatePresetActive(initialRate);

// Feature 5: sync settings panel sliders to stored values on startup
settingDefaultSpeed.value = String(initialRate);
settingDefaultSpeedVal.textContent = initialRate.toFixed(2) + "×";
settingDefaultVolume.value = String(initialVolume);
settingDefaultVolVal.textContent = Math.round(initialVolume * 100) + "%";

speedSlider.addEventListener("input", () => applyRate(parseFloat(speedSlider.value)));
preset50.addEventListener("click",  () => applyRate(0.5));
preset75.addEventListener("click",  () => applyRate(0.75));
preset100.addEventListener("click", () => applyRate(1.0));

// ── Playback rate on video load ────────────────────────────────────────────────
// We re-wire this in renderSong because we need a fresh "once" listener each time.

// ── A/B loop helpers ──────────────────────────────────────────────────────────

function updateMarkersUI(): void {
  if (aPixel !== null && sync !== null) {
    const nb = sync.nearestBar(aPixel);
    abBtnA.textContent = nb ? `A bar ${nb.index}` : "A —";
    abBtnA.classList.add("set-a");
  } else {
    abBtnA.textContent = "A —";
    abBtnA.classList.remove("set-a");
  }

  if (bPixel !== null && sync !== null) {
    const nb = sync.nearestBar(bPixel);
    abBtnB.textContent = nb ? `B bar ${nb.index}` : "B —";
    abBtnB.classList.add("set-b");
  } else {
    abBtnB.textContent = "B —";
    abBtnB.classList.remove("set-b");
  }

  const loopValid = aPixel !== null && bPixel !== null && aPixel < bPixel;
  loopToggle.disabled = !loopValid;
  if (!loopValid) loopOn = false;
  loopToggle.dataset["on"] = loopOn ? "true" : "false";
  loopToggle.textContent = loopOn ? "⟲ Loop ON" : "⟲ Loop";

  tabScroller?.setLoop({ a: aPixel, b: bPixel, on: loopOn });
}

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

loopHereBtn.addEventListener("click", () => {
  if (!sync || !score) return;
  const currentPixel = sync.timeToPixel(video.currentTime);
  const nearest = sync.nearestBar(currentPixel);
  if (!nearest) return;
  const bars = score.bars;
  let nextBarPx: number;
  if (nearest.index < bars.length) {
    nextBarPx = bars[nearest.index]!;
  } else {
    nextBarPx = score.endingPixel;
  }
  aPixel = nearest.pixel;
  bPixel = nextBarPx;
  normaliseAB();
  loopOn = true;
  updateMarkersUI();
});

// ── Loop enforcement ──────────────────────────────────────────────────────────
// These listeners are on the persistent video element — no need to re-attach.

video.addEventListener("timeupdate", () => {
  if (!loopOn || !sync || aPixel === null || bPixel === null) return;
  const aTime = sync.pixelToTime(aPixel);
  const bTime = sync.pixelToTime(bPixel);
  if (video.currentTime >= bTime) {
    video.currentTime = aTime;
  }
});

function startLoopRaf(): void {
  if (loopRafId !== null) cancelAnimationFrame(loopRafId);
  const tick = () => {
    loopRafId = requestAnimationFrame(tick);
    if (!loopOn || !sync || aPixel === null || bPixel === null) return;
    const aTime = sync.pixelToTime(aPixel);
    const bTime = sync.pixelToTime(bPixel);
    if (video.currentTime >= bTime) {
      video.currentTime = aTime;
    }
  };
  loopRafId = requestAnimationFrame(tick);
}

// ── Chord-button disable during playback ──────────────────────────────────────
video.addEventListener("play",  () => allChords.classList.add("playing"));
video.addEventListener("pause", () => allChords.classList.remove("playing"));

// ── Orientation ───────────────────────────────────────────────────────────────
function updateOrientationButtons(): void {
  btnVert.classList.toggle("active", orientation === "vert");
  btnHoriz.classList.toggle("active", orientation === "horiz");
}

function setOrientation(o: Orientation): void {
  orientation = o;
  localStorage.setItem(ORIENTATION_KEY, o);
  updateOrientationButtons();
  renderPreviews(nowChordId, nextChordId);
}

btnVert.addEventListener("click",  () => setOrientation("vert"));
btnHoriz.addEventListener("click", () => setOrientation("horiz"));

// ── NOW / NEXT preview rendering ──────────────────────────────────────────────
function renderPreviews(curId: number | null, nxtId: number | null): void {
  if (!nowDiagram || !nextDiagram) return;

  const nowChord = curId !== null ? chordsById.get(curId) ?? null : null;
  if (nowChord) {
    nowName.textContent = displayChordName(nowChord.name);
    const rect = orientation === "vert" ? nowChord.picRect : nowChord.picRectUS;
    nowDiagram.render(rect);
    const [r, g, b] = nowChord.rgbHighlight;
    nowCanvas.style.borderColor = `rgb(${r},${g},${b})`;

    // Hand close-up photo (real photo from CD) — load if present.
    if (currentMeta && nowChord.hand) {
      const handUrl = `${currentMeta.rawDir}chords/${nowChord.hand}`;
      nowHand.onerror = () => { nowHand.hidden = true; };
      nowHand.onload  = () => { nowHand.hidden = false; };
      nowHand.src = handUrl;
    } else {
      nowHand.hidden = true;
      nowHand.removeAttribute("src");
    }
  } else {
    nowName.textContent = "—";
    nowDiagram.clear();
    nowCanvas.style.borderColor = "";
    nowHand.hidden = true;
    nowHand.removeAttribute("src");
  }

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

function handleChordsChange(curId: number | null, nxtId: number | null): void {
  nowChordId    = curId;
  nextChordId   = nxtId;
  lastNextChord = nxtId;
  renderPreviews(curId, nxtId);
}

// ── Exercise open / close ─────────────────────────────────────────────────────

async function openExerciseByDisplay(displayIdx: number): Promise<void> {
  if (!currentMeta) return;
  if (displayIdx < 1 || displayIdx > displayToCd.length) return;
  const cdNum = displayToCd[displayIdx - 1]!;
  currentExerciseDisplayIdx = displayIdx;
  currentExerciseCdNum = cdNum;

  console.log(`[hotspot] Open exercise ${displayIdx} (CD: ${cdNum})`);

  video.pause();
  video.style.display = "none";

  voiceAudio.pause();
  voiceAudio.onended = null;
  exVideo.pause();

  exercisePane.hidden = false;
  document.body.classList.add("exercise-mode");

  exTitle.textContent = `Exercise ${displayIdx}`;
  exPrev.disabled = displayIdx <= 1;
  exNext.disabled = displayIdx >= displayToCd.length;

  exerciseSelect.value = String(displayIdx);

  // Feature 4: update "Mark done" button state
  if (currentMeta) {
    const done = getCompleted(currentMeta.slug).has(displayIdx);
    exDoneBtn.classList.toggle("done", done);
    exDoneBtn.textContent = done ? "✓ Done" : "✓ Mark done";
  }

  try {
    const ex = await loadExercise(`${currentMeta.rawDir}exercice/${cdNum}/`, cdNum);

    exVideo.src = ex.videoFile;
    exVideo.load();

    if (ex.tabImage) {
      exerciseTabImg.src = ex.tabImage;
      exerciseTabRow.classList.remove("no-image");
    } else {
      exerciseTabImg.src = "";
      exerciseTabRow.classList.add("no-image");
    }

    exVoiceBtn.onclick = () => {
      voiceAudio.currentTime = 0;
      voiceAudio.play().catch(() => {});
    };
    exReplayBtn.onclick = () => {
      exVideo.currentTime = 0;
      exVideo.play().catch(() => {});
    };

    startExerciseAutoPlay(ex);
  } catch (err) {
    console.error(`[exercise] Failed to load exercise ${displayIdx} (CD: ${cdNum}):`, err);
  }
}

function startExerciseAutoPlay(ex: ExerciseDef): void {
  if (!exAutoplay.checked) return;
  voiceAudio.src = ex.voiceFile;
  voiceAudio.currentTime = 0;
  voiceAudio.play().catch(() => {});
  voiceAudio.onended = () => {
    exVideo.play().catch(() => {});
  };
}

function closeExercise(): void {
  voiceAudio.pause();
  voiceAudio.currentTime = 0;
  voiceAudio.onended = null;
  voiceAudio.src = "";
  exVideo.pause();
  exVideo.removeAttribute("src");
  exVideo.load();

  exerciseTabImg.src = "";
  exerciseTabRow.classList.remove("no-image");

  exercisePane.hidden = true;
  video.style.display = "";
  document.body.classList.remove("exercise-mode");

  exerciseSelect.value = "";

  currentExerciseDisplayIdx = null;
  currentExerciseCdNum = null;
}

exBack.addEventListener("click", closeExercise);

// Feature 4: mark exercise done
exDoneBtn.addEventListener("click", () => {
  if (!currentMeta || currentExerciseDisplayIdx === null) return;
  const nowDone = toggleCompleted(currentMeta.slug, currentExerciseDisplayIdx);
  exDoneBtn.classList.toggle("done", nowDone);
  exDoneBtn.textContent = nowDone ? "✓ Done" : "✓ Mark done";
  // Refresh dropdown to show/hide ✓
  refreshExerciseDropdown();
});

exPrev.addEventListener("click", () => {
  if (currentExerciseDisplayIdx === null) return;
  openExerciseByDisplay(Math.max(1, currentExerciseDisplayIdx - 1));
});
exNext.addEventListener("click", () => {
  if (currentExerciseDisplayIdx === null) return;
  openExerciseByDisplay(Math.min(displayToCd.length, currentExerciseDisplayIdx + 1));
});

exerciseSelect.addEventListener("change", () => {
  const val = exerciseSelect.value;
  if (val === "") {
    closeExercise();
  } else {
    openExerciseByDisplay(parseInt(val, 10));
  }
});

// ── Mutual exclusion: voice and exercise video never play simultaneously ──────
voiceAudio.addEventListener("play", () => exVideo.pause());
exVideo.addEventListener("play",    () => voiceAudio.pause());

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (t.isContentEditable) return true;
  return false;
}

function shiftLoopBoundary(which: "A" | "B", direction: -1 | 1): void {
  if (!sync || !score) return;
  const bars = score.bars;
  if (bars.length === 0) return;

  if (which === "A") {
    if (aPixel === null) {
      if (direction !== -1) return;
      const currentPixel = sync.timeToPixel(video.currentTime);
      const nb = sync.nearestBar(currentPixel);
      if (!nb) return;
      aPixel = nb.pixel;
      normaliseAB();
      updateMarkersUI();
      return;
    }
    let bestIdx = -1;
    if (direction === -1) {
      for (let i = bars.length - 1; i >= 0; i--) {
        if (bars[i]! < aPixel) { bestIdx = i; break; }
      }
    } else {
      for (let i = 0; i < bars.length; i++) {
        if (bars[i]! > aPixel) { bestIdx = i; break; }
      }
    }
    if (bestIdx === -1) return;
    let candidate = bars[bestIdx]!;
    candidate = Math.max(score.startingPixel, candidate);
    if (bPixel !== null && candidate >= bPixel) return;
    aPixel = candidate;
  } else {
    if (bPixel === null) {
      if (direction !== 1) return;
      const currentPixel = sync.timeToPixel(video.currentTime);
      const nb = sync.nearestBar(currentPixel);
      if (!nb) return;
      bPixel = nb.pixel;
      normaliseAB();
      updateMarkersUI();
      return;
    }
    let bestIdx = -1;
    if (direction === 1) {
      for (let i = 0; i < bars.length; i++) {
        if (bars[i]! > bPixel) { bestIdx = i; break; }
      }
    } else {
      for (let i = bars.length - 1; i >= 0; i--) {
        if (bars[i]! < bPixel) { bestIdx = i; break; }
      }
    }
    if (bestIdx === -1) return;
    let candidate = bars[bestIdx]!;
    candidate = Math.min(score.endingPixel, candidate);
    if (aPixel !== null && candidate <= aPixel) return;
    bPixel = candidate;
  }

  normaliseAB();
  updateMarkersUI();
}

function seekBars(direction: -1 | 1): void {
  if (!sync || !score) return;
  const bars = score.bars;
  if (bars.length === 0) return;

  const currentPixel = sync.timeToPixel(video.currentTime);
  let targetPx: number | null = null;
  if (direction === -1) {
    for (let i = bars.length - 1; i >= 0; i--) {
      if (bars[i]! < currentPixel - 1) { targetPx = bars[i]!; break; }
    }
  } else {
    for (let i = 0; i < bars.length; i++) {
      if (bars[i]! > currentPixel + 1) { targetPx = bars[i]!; break; }
    }
  }

  if (targetPx === null) return;
  video.currentTime = sync.pixelToTime(targetPx);
}

// ── Help overlay ─────────────────────────────────────────────────────────────

function openHelp(): void {
  helpOverlay.removeAttribute("hidden");
}

function closeHelp(): void {
  helpOverlay.setAttribute("hidden", "");
}

helpClose.addEventListener("click", closeHelp);
helpOverlay.addEventListener("click", (e) => {
  if (e.target === helpOverlay) closeHelp();
});

function handleKey(e: KeyboardEvent): void {
  if (isTypingTarget(e)) return;

  // Escape: close help (highest priority) or close exercise
  if (e.code === "Escape") {
    if (!helpOverlay.hasAttribute("hidden")) {
      closeHelp();
      e.preventDefault();
      return;
    }
    if (currentExerciseDisplayIdx !== null) {
      closeExercise();
      e.preventDefault();
      return;
    }
  }

  // ? (Shift+/) — open help (works from anywhere)
  if (e.code === "Slash" && e.shiftKey) {
    e.preventDefault();
    openHelp();
    return;
  }

  // Only remaining hotkeys are active in song view
  if (!currentMeta) return;

  if (currentExerciseDisplayIdx !== null) return;

  switch (e.code) {
    case "Space":
      e.preventDefault();
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
      break;

    case "BracketLeft":
      e.preventDefault();
      if (e.shiftKey) {
        shiftLoopBoundary("A", 1);
      } else {
        shiftLoopBoundary("A", -1);
      }
      break;

    case "BracketRight":
      e.preventDefault();
      if (e.shiftKey) {
        shiftLoopBoundary("B", -1);
      } else {
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

// Feature 1: save position on page hide (tab close / refresh)
window.addEventListener("pagehide", saveSongPosition);

// ── Back-to-home button ───────────────────────────────────────────────────────
backToHome.addEventListener("click", () => {
  location.hash = "#/";
});

// ── Show / hide player vs home ────────────────────────────────────────────────

function showHome(): void {
  homeView.hidden = false;
  header.hidden = true;
  mainEl.hidden = true;
  playbackCtls.hidden = true;
  tabRowEl.hidden = true;
}

function showPlayer(): void {
  homeView.hidden = true;
  header.hidden = false;
  mainEl.hidden = false;
  playbackCtls.hidden = false;
  tabRowEl.hidden = false;
}

// ── State cleanup: dispose previous song ──────────────────────────────────────

function disposeSong(): void {
  // Feature 1: save position before navigation
  saveSongPosition();
  stopPositionSave();

  // Stop and clear video
  video.pause();
  video.removeAttribute("src");
  video.load();
  video.style.display = "";

  // Close any open exercise
  closeExercise();

  // Dispose TabScroller (stops RAF + ResizeObserver)
  if (tabScroller) {
    tabScroller.dispose();
    tabScroller = null;
    // Remove injected .tab-viewport from tab-row
    const vp = tabRow.querySelector(".tab-viewport");
    if (vp) vp.remove();
  }

  // Nullify sync
  sync = null;
  score = null;

  // Reset chord state
  chordsById.clear();
  nowChordId = null;
  nextChordId = null;
  lastNextChord = null;

  // Reset A/B loop state
  aPixel = null;
  bPixel = null;
  loopOn = false;
  updateMarkersUI();

  // Reset exercise index maps
  cdToDisplay.clear();
  displayToCd.length = 0;

  // Reset exercise UI state
  currentExerciseDisplayIdx = null;
  currentExerciseCdNum = null;

  // Dispose diagram renderers
  if (nowDiagram) { nowDiagram = null; }
  if (nextDiagram) { nextDiagram = null; }

  // Clear all-chords row
  allChords.innerHTML = "";

  // Clear exercise dropdown options (keep default placeholder)
  exerciseSelect.innerHTML = '<option value="">Choose exercise…</option>';

  // Reset NOW/NEXT labels
  nowName.textContent = "—";
  nextName.textContent = "—";
  nowCanvas.style.borderColor = "";

  // Reset voiceAudio
  voiceAudio.pause();
  voiceAudio.src = "";
  voiceAudio.onended = null;

  currentMeta = null;
}

// ── Home screen rendering ─────────────────────────────────────────────────────

// Single reusable audio element for jingles — mutex via src/play.
const jingleAudio = new Audio();

function playJingle(url: string): void {
  jingleAudio.pause();
  jingleAudio.src = url;
  jingleAudio.currentTime = 0;
  jingleAudio.play().catch(() => {});
}

function stopJingle(): void {
  jingleAudio.pause();
  jingleAudio.src = "";
}

function renderHome(): void {
  disposeSong();
  showHome();

  const grid = homeView.querySelector(".song-grid")!;
  grid.innerHTML = "";

  for (const song of SONGS) {
    const btn = document.createElement("button");
    btn.className = "song-card";
    btn.dataset["slug"] = song.slug;
    btn.title = "Hover to hear the artist jingle";
    const doneCount = getCompleted(song.slug).size;
    const progressLine = doneCount > 0
      ? `<div class="song-card-progress">${doneCount} / ${song.exerciseCount} done</div>`
      : "";
    btn.innerHTML = `
      <img class="song-card-portrait" src="${song.artistImageUrl}" alt="${song.artist}" loading="lazy" />
      <div class="song-card-text">
        <div class="song-card-title">${song.title}</div>
        <div class="song-card-artist">${song.artist}</div>
        <div class="song-card-meta">${song.exerciseCount} exercise${song.exerciseCount !== 1 ? "s" : ""}</div>
        ${progressLine}
      </div>
    `;
    btn.addEventListener("mouseenter", () => {
      playJingle(song.jingleUrl);
    });
    btn.addEventListener("click", () => {
      playJingle(song.jingleUrl);
      setTimeout(() => { location.hash = `#/song/${song.slug}`; }, 0);
    });
    grid.appendChild(btn);
  }
}

// ── Feature 4: exercise dropdown with ✓ markers ───────────────────────────────

function refreshExerciseDropdown(): void {
  const previousValue = exerciseSelect.value;
  exerciseSelect.innerHTML = '<option value="">Choose exercise…</option>';
  if (!currentMeta || displayToCd.length === 0) return;
  const completed = getCompleted(currentMeta.slug);
  for (let i = 1; i <= displayToCd.length; i++) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = completed.has(i) ? `Exercise ${i} ✓` : `Exercise ${i}`;
    exerciseSelect.appendChild(opt);
  }
  exerciseSelect.value = previousValue;
}

// ── Song rendering ────────────────────────────────────────────────────────────

async function renderSong(meta: SongMeta): Promise<void> {
  // Clean up any previous song
  disposeSong();
  showPlayer();

  currentMeta = meta;

  // Update header title
  songTitleEl.textContent = meta.title;

  // Set video source
  video.src = meta.videoUrl;
  video.load();

  // Apply speed + volume + resume position after metadata loads
  video.addEventListener("loadedmetadata", () => {
    applyRate(initialRate);
    applyVolume(initialVolume);
    // Feature 1: restore saved position
    const savedPos = getPosition(meta.slug);
    if (isFinite(savedPos) && savedPos > 0 && savedPos <= video.duration - 0.5) {
      video.currentTime = savedPos;
    }
  }, { once: true });

  // Feature 1: start periodic position save
  startPositionSave();

  // Create chord diagram renderers
  nowDiagram  = new ChordDiagram(nowCanvas,  meta.chordImageUrl);
  nextDiagram = new ChordDiagram(nextCanvas, meta.chordImageUrl);

  updateOrientationButtons();

  // Load chord sprite sheets
  await Promise.all([nowDiagram.load(), nextDiagram.load()]);

  // Load chord database + score in parallel so we can derive "first frame
  // of chord" via SCO events BEFORE building chord buttons (which need that
  // info to decide whether to show the ↪ jump icon).
  const [db, loadedScore] = await Promise.all([
    loadChordDb(meta.chdUrl),
    loadScore(meta.scoUrl),
  ]);
  const chords = db.chords;
  score = loadedScore;
  sync = new ScoreSync(loadedScore, video);

  console.log(`[${meta.slug}] ${chords.length} chords loaded, ${loadedScore.events.length} score events`);

  for (const chord of chords) {
    chordsById.set(chord.id, chord);
  }

  // Build all-chords buttons. Each shows the chord name; a tiny "↪" icon
  // appears when the chord can be located in the song video (via CD's avi=
  // field OR by scanning SCO events for the first occurrence). Clicking the
  // icon jumps the video to that frame.
  const wavBase = `${meta.rawDir}chords/`;
  for (const chord of chords) {
    const btn = document.createElement("button");
    btn.className = "chord-btn";
    btn.title = chord.comments || displayChordName(chord.name);

    // Resolve "first frame in song" — prefer CD's explicit avi= field,
    // else scan SCO events for the first occurrence of this chord id.
    // (sync may still be null at this point if score loads after chords —
    //  in that case fall back to undefined and live without the jump icon.)
    const firstFrame = (chord.avi !== undefined)
      ? chord.avi
      : (sync?.firstFrameOfChord(chord.id) ?? null);

    btn.innerHTML = `<span class="chord-btn-label">${displayChordName(chord.name)}</span>` +
      (firstFrame !== null
        ? ` <span class="where-icon" title="Show in song video">↪</span>`
        : "");

    btn.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains("where-icon")) {
        // Jump video to chord's first occurrence — no sample, no NOW change.
        const t = sync?.frameToTime(firstFrame!);
        if (t !== null && t !== undefined) {
          video.currentTime = Math.max(0, t);
        }
        e.stopPropagation();
        return;
      }
      // Normal click: play sample + show in NOW
      playSample(wavBase + chord.sound);
      nowChordId = chord.id;
      renderPreviews(chord.id, lastNextChord);
    });
    allChords.appendChild(btn);
  }

  // Build CD-number → display-index mappings (uses already-loaded score)
  const sortedDiffs = [...loadedScore.difficulties].sort((a, b) => a.rect.x - b.rect.x);
  const seen = new Set<number>();
  for (const d of sortedDiffs) {
    if (!seen.has(d.exercice)) {
      seen.add(d.exercice);
      cdToDisplay.set(d.exercice, displayToCd.length + 1);
      displayToCd.push(d.exercice);
    }
  }
  // Append orphan exercises not referenced by any hotspot
  for (let cd = 1; cd <= meta.exerciseCount; cd++) {
    if (!seen.has(cd)) {
      cdToDisplay.set(cd, displayToCd.length + 1);
      displayToCd.push(cd);
    }
  }

  console.log(`[${meta.slug}] displayToCd:`, displayToCd);

  // Populate exercise dropdown (Feature 4: ✓ markers)
  refreshExerciseDropdown();

  // Create TabScroller (sync was created above, after parallel load)
  tabScroller = new TabScroller(tabRow, {
    score: loadedScore,
    pngUrl: meta.tabImageUrl,
    video,
    onChordsChange: handleChordsChange,
    onDifficultyClick: (cdNum) => {
      const displayIdx = cdToDisplay.get(cdNum);
      if (displayIdx !== undefined) openExerciseByDisplay(displayIdx);
    },
  });

  tabScroller.setDifficulties(loadedScore.difficulties, {
    labelForExercice: (cd) => String(cdToDisplay.get(cd) ?? cd),
  });

  // Initial marker UI
  updateMarkersUI();

  // Start loop RAF
  startLoopRaf();
}

// ── Feature 5: Settings panel ─────────────────────────────────────────────────

function openSettings(): void {
  // Sync sliders to current values before opening
  const currentRate = parseFloat(localStorage.getItem(SPEED_KEY) ?? "1");
  const currentVol = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "0.8");
  settingDefaultSpeed.value = String(isFinite(currentRate) ? currentRate : 1);
  settingDefaultSpeedVal.textContent = (isFinite(currentRate) ? currentRate : 1).toFixed(2) + "×";
  settingDefaultVolume.value = String(isFinite(currentVol) ? currentVol : 0.8);
  settingDefaultVolVal.textContent = Math.round((isFinite(currentVol) ? currentVol : 0.8) * 100) + "%";
  settingsOverlay.removeAttribute("hidden");
}

function closeSettings(): void {
  settingsOverlay.setAttribute("hidden", "");
}

settingsBtn.addEventListener("click", openSettings);
settingClose.addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) closeSettings();
});

settingDefaultSpeed.addEventListener("input", () => {
  const r = parseFloat(settingDefaultSpeed.value);
  settingDefaultSpeedVal.textContent = r.toFixed(2) + "×";
  localStorage.setItem(SPEED_KEY, String(r));
  // Apply immediately if song loaded
  if (currentMeta) applyRate(r);
});

settingDefaultVolume.addEventListener("input", () => {
  const v = parseFloat(settingDefaultVolume.value);
  settingDefaultVolVal.textContent = Math.round(v * 100) + "%";
  localStorage.setItem(VOLUME_KEY, String(v));
  if (currentMeta) applyVolume(v);
});

settingResetProgress.addEventListener("click", () => {
  if (window.confirm("Reset progress for all songs?")) {
    resetProgress();
    closeSettings();
  }
});

// ── Hash router ───────────────────────────────────────────────────────────────

function parseHash(): { view: "home" } | { view: "song"; slug: string } | { view: "redirect" } {
  const hash = location.hash;
  if (hash === "" || hash === "#" || hash === "#/") {
    return { view: "home" };
  }
  const songMatch = hash.match(/^#\/song\/([a-z0-9-]+)$/);
  if (songMatch) {
    return { view: "song", slug: songMatch[1]! };
  }
  return { view: "redirect" };
}

async function route(): Promise<void> {
  const parsed = parseHash();

  if (parsed.view === "redirect") {
    location.hash = "#/";
    return;
  }

  if (parsed.view === "home") {
    renderHome();
    return;
  }

  // Song view — navigating away from home, stop any playing jingle
  stopJingle();

  const meta = getSongBySlug(parsed.slug);
  if (!meta) {
    console.warn(`Unknown song slug: ${parsed.slug}, redirecting home`);
    location.hash = "#/";
    return;
  }

  try {
    await renderSong(meta);
  } catch (err) {
    console.error(`Failed to load song ${parsed.slug}:`, err);
    location.hash = "#/";
  }
}

window.addEventListener("hashchange", () => {
  route().catch(console.error);
});

// Initial route on page load
route().catch(console.error);
