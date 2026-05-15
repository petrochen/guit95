import "./styles.css";
import { parseIni } from "./parsers/ini.js";
import { loadChordDb, type Chord } from "./parsers/chd.js";
import { loadScore } from "./parsers/sco.js";
import { ChordDiagram } from "./components/ChordDiagram.js";
import { TabScroller } from "./components/TabScroller.js";
import { playSample } from "./audio/sample.js";

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

// ── State ─────────────────────────────────────────────────────────────────────
type Orientation = "vert" | "horiz";
let orientation: Orientation =
  (localStorage.getItem(ORIENTATION_KEY) as Orientation | null) ?? "vert";
let activeChord: Chord | null = null;

// Chord lookup by id (populated after CHD loads)
const chordsById = new Map<number, { chord: Chord; btn: HTMLButtonElement }>();
let autoActiveBtn: HTMLButtonElement | null = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const video = document.getElementById("player") as HTMLVideoElement;
const canvas = document.getElementById("diagram-canvas") as HTMLCanvasElement;
const panelPlaceholder = document.getElementById("panel-placeholder") as HTMLElement;
const chordInfo = document.getElementById("chord-info") as HTMLElement;
const chordNameDisplay = document.getElementById("chord-name-display") as HTMLElement;
const chordComment = document.getElementById("chord-comment") as HTMLElement;
const playSampleBtn = document.getElementById("play-sample-btn") as HTMLButtonElement;
const chordRow = document.getElementById("chord-row") as HTMLElement;
const tabRow = document.getElementById("tab-row") as HTMLElement;
const btnVert = document.getElementById("btn-vert") as HTMLButtonElement;
const btnHoriz = document.getElementById("btn-horiz") as HTMLButtonElement;

// ── Diagram renderer ──────────────────────────────────────────────────────────
const diagram = new ChordDiagram(canvas, IMG_URL);

function updateOrientationButtons(): void {
  btnVert.classList.toggle("active", orientation === "vert");
  btnHoriz.classList.toggle("active", orientation === "horiz");
}

function renderActiveChord(): void {
  if (!activeChord) return;
  const rect = orientation === "vert" ? activeChord.picRect : activeChord.picRectUS;
  diagram.render(rect);
}

function selectChord(chord: Chord, btn: HTMLButtonElement, allBtns: HTMLButtonElement[]): void {
  activeChord = chord;

  allBtns.forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  panelPlaceholder.style.display = "none";
  chordInfo.classList.add("visible");
  chordNameDisplay.textContent = `${chord.name}${chord.comments ? ` (${chord.comments})` : ""}`;
  chordComment.textContent = chord.comments;

  renderActiveChord();
  playSample(WAV_BASE + chord.sound);
}

function setOrientation(o: Orientation): void {
  orientation = o;
  localStorage.setItem(ORIENTATION_KEY, o);
  updateOrientationButtons();
  renderActiveChord();
}

btnVert.addEventListener("click", () => setOrientation("vert"));
btnHoriz.addEventListener("click", () => setOrientation("horiz"));

playSampleBtn.addEventListener("click", () => {
  if (activeChord) playSample(WAV_BASE + activeChord.sound);
});

// ── Active chord auto-highlight (called by TabScroller) ───────────────────────
function handleActiveChordChange(chordId: number | null): void {
  // Remove previous auto-active
  if (autoActiveBtn) {
    autoActiveBtn.classList.remove("auto-active");
    autoActiveBtn.style.outline = "";
    autoActiveBtn = null;
  }

  if (chordId === null) return;

  const entry = chordsById.get(chordId);
  if (!entry) return;

  const { chord, btn } = entry;
  const [r, g, b] = chord.rgbHighlight;
  btn.classList.add("auto-active");
  btn.style.outline = `2px solid rgb(${r},${g},${b})`;
  autoActiveBtn = btn;
}

// ── Initialise ────────────────────────────────────────────────────────────────
async function init(): Promise<void> {
  // Load chord image
  await diagram.load();

  // Load chord database
  const db = await loadChordDb(CHD_URL);
  const chords = db.chords;

  console.assert(chords.length === 11, `CHD parser self-test: expected 11 chords, got ${chords.length}`);
  console.log(`CHD parser self-test: ${chords.length} chords loaded`);

  // Build chord buttons
  const allBtns: HTMLButtonElement[] = [];
  for (const chord of chords) {
    const btn = document.createElement("button");
    btn.className = "chord-btn";
    btn.textContent = chord.name;
    btn.title = chord.comments || chord.name;
    btn.addEventListener("click", () => selectChord(chord, btn, allBtns));
    chordRow.appendChild(btn);
    allBtns.push(btn);

    // Register for auto-highlight lookup by chord.id
    chordsById.set(chord.id, { chord, btn });
  }

  updateOrientationButtons();

  // Load SCO score file
  const score = await loadScore(SCO_URL);

  // SCO parser self-test
  console.log(`SCO parser self-test: ${score.events.length} events, ${score.bars.length} bars`);
  console.assert(score.events.length === 534, `SCO self-test: expected 534 events, got ${score.events.length}`);

  // Create TabScroller
  new TabScroller(tabRow, {
    score,
    pngUrl: TAB_URL,
    video,
    onActiveChordChange: handleActiveChordChange,
  });
}

init().catch((err) => {
  console.error("Init failed:", err);
});
