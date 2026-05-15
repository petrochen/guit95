import "./styles.css";
import { parseIni } from "./parsers/ini.js";
import { loadChordDb, type Chord } from "./parsers/chd.js";
import { loadScore } from "./parsers/sco.js";
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

// ── DOM refs ──────────────────────────────────────────────────────────────────
const video      = document.getElementById("player")      as HTMLVideoElement;
const nowCanvas  = document.getElementById("now-canvas")  as HTMLCanvasElement;
const nextCanvas = document.getElementById("next-canvas") as HTMLCanvasElement;
const nowName    = document.getElementById("now-name")    as HTMLElement;
const nextName   = document.getElementById("next-name")   as HTMLElement;
const allChords  = document.getElementById("all-chords")  as HTMLElement;
const tabRow     = document.getElementById("tab-row")     as HTMLElement;
const btnVert    = document.getElementById("btn-vert")    as HTMLButtonElement;
const btnHoriz   = document.getElementById("btn-horiz")   as HTMLButtonElement;

// Playback controls
const speedSlider  = document.getElementById("speed-slider")  as HTMLInputElement;
const speedValue   = document.getElementById("speed-value")   as HTMLElement;
const abBtnA       = document.getElementById("ab-a")          as HTMLButtonElement;
const abBtnB       = document.getElementById("ab-b")          as HTMLButtonElement;
const loopToggle   = document.getElementById("loop-toggle")   as HTMLButtonElement;
const loopClear    = document.getElementById("loop-clear")    as HTMLButtonElement;

// ── Diagram renderers ─────────────────────────────────────────────────────────
const nowDiagram  = new ChordDiagram(nowCanvas,  IMG_URL);
const nextDiagram = new ChordDiagram(nextCanvas, IMG_URL);

// ── Speed control ──────────────────────────────────────────────────────────────
const savedRate = parseFloat(localStorage.getItem(SPEED_KEY) ?? "1");
const initialRate = isFinite(savedRate) && savedRate >= 0.25 && savedRate <= 1.5 ? savedRate : 1;

function applyRate(r: number): void {
  video.playbackRate = r;
  // Preserve pitch — modern API + Safari fallback
  (video as any).preservesPitch = true;
  (video as any).webkitPreservesPitch = true;
  speedSlider.value = String(r);
  speedValue.textContent = r.toFixed(2) + "×";
  localStorage.setItem(SPEED_KEY, String(r));
}

// Initialise slider immediately (before video metadata loads)
speedSlider.value = String(initialRate);
speedValue.textContent = initialRate.toFixed(2) + "×";
speedSlider.addEventListener("input", () => applyRate(parseFloat(speedSlider.value)));

// Apply rate after video is ready (some browsers need this after src is set)
video.addEventListener("loadedmetadata", () => applyRate(initialRate), { once: true });

// ── A/B Loop state ─────────────────────────────────────────────────────────────
let aPixel: number | null = null;
let bPixel: number | null = null;
let loopOn = false;

// ScoreSync is set after score loads (in init). Guard with null check below.
let sync: ScoreSync | null = null;
// TabScroller reference set after creation
let tabScroller: TabScroller | null = null;

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
  updateMarkersUI();
}

function clearAB(): void {
  aPixel = null;
  bPixel = null;
  loopOn = false;
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
    nowName.textContent = `${nowChord.name}${nowChord.comments ? ` (${nowChord.comments})` : ""}`;
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
    nextName.textContent = `${nextChord.name}${nextChord.comments ? ` (${nextChord.comments})` : ""}`;
    const rect = orientation === "vert" ? nextChord.picRect : nextChord.picRectUS;
    nextDiagram.render(rect);
  } else {
    nextName.textContent = "—";
    nextDiagram.clear();
  }
}

// ── Callback from TabScroller ─────────────────────────────────────────────────
function handleChordsChange(curId: number | null, nxtId: number | null): void {
  nowChordId  = curId;
  nextChordId = nxtId;
  renderPreviews(curId, nxtId);
}

// ── Initialise ────────────────────────────────────────────────────────────────
async function init(): Promise<void> {
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
    btn.textContent = chord.name;
    btn.title = chord.comments || chord.name;
    btn.addEventListener("click", () => playSample(WAV_BASE + chord.sound));
    allChords.appendChild(btn);
  }

  updateOrientationButtons();

  // Load SCO score file
  const score = await loadScore(SCO_URL);

  // SCO parser self-test
  console.log(`SCO parser self-test: ${score.events.length} events, ${score.bars.length} bars`);
  console.assert(score.events.length === 534, `SCO self-test: expected 534 events, got ${score.events.length}`);

  // Create ScoreSync helper for A/B loop math
  sync = new ScoreSync(score, video);

  // Create TabScroller
  tabScroller = new TabScroller(tabRow, {
    score,
    pngUrl: TAB_URL,
    video,
    onChordsChange: handleChordsChange,
  });

  // Initial marker UI render (clears buttons, disables loop toggle)
  updateMarkersUI();
}

init().catch((err) => {
  console.error("Init failed:", err);
});
