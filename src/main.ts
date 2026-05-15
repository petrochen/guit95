import "./styles.css";
import { parseIni } from "./parsers/ini.js";
import { loadChordDb, type Chord } from "./parsers/chd.js";
import { ChordDiagram } from "./components/ChordDiagram.js";
import { playSample } from "./audio/sample.js";

// ── INI parser self-test (from Phase 0, kept as required) ────────────────────
const _r = parseIni("BackBmp=foo.bmp\n[chord]\nname=C\nname=D\n");
console.assert(_r.global["BackBmp"] === "foo.bmp", "INI self-test: global key");
console.assert(
  _r.sections.length === 1 && _r.sections[0] !== undefined && _r.sections[0].entries.length === 2,
  "INI self-test: section entries"
);
console.log("INI parser self-test:", _r.global["BackBmp"] === "foo.bmp" ? "PASS" : "FAIL");

// ── Constants ─────────────────────────────────────────────────────────────────
const CHD_URL = "/assets/heyjoe/raw/chords/chords.chd";
const IMG_URL = "/assets/heyjoe/raw/chords/heyjoe2.png";
const WAV_BASE = "/assets/heyjoe/raw/chords/";
const ORIENTATION_KEY = "chord-orientation";

// ── State ─────────────────────────────────────────────────────────────────────
type Orientation = "vert" | "horiz";
let orientation: Orientation =
  (localStorage.getItem(ORIENTATION_KEY) as Orientation | null) ?? "vert";
let activeChord: Chord | null = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById("diagram-canvas") as HTMLCanvasElement;
const panelPlaceholder = document.getElementById("panel-placeholder") as HTMLElement;
const chordInfo = document.getElementById("chord-info") as HTMLElement;
const chordNameDisplay = document.getElementById("chord-name-display") as HTMLElement;
const chordComment = document.getElementById("chord-comment") as HTMLElement;
const playSampleBtn = document.getElementById("play-sample-btn") as HTMLButtonElement;
const chordRow = document.getElementById("chord-row") as HTMLElement;
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

  // Update active button styling
  allBtns.forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");

  // Update side panel
  panelPlaceholder.style.display = "none";
  chordInfo.classList.add("visible");
  chordNameDisplay.textContent = `${chord.name}${chord.comments ? ` (${chord.comments})` : ""}`;
  chordComment.textContent = chord.comments;

  // Draw diagram
  renderActiveChord();

  // Play sample
  playSample(WAV_BASE + chord.sound);
}

function setOrientation(o: Orientation): void {
  orientation = o;
  localStorage.setItem(ORIENTATION_KEY, o);
  updateOrientationButtons();
  renderActiveChord();
}

// ── Orientation toggle handlers ────────────────────────────────────────────────
btnVert.addEventListener("click", () => setOrientation("vert"));
btnHoriz.addEventListener("click", () => setOrientation("horiz"));

// ── Play sample button ─────────────────────────────────────────────────────────
playSampleBtn.addEventListener("click", () => {
  if (activeChord) playSample(WAV_BASE + activeChord.sound);
});

// ── Initialise ────────────────────────────────────────────────────────────────
async function init(): Promise<void> {
  // Load chord image
  await diagram.load();

  // Load chord database
  const db = await loadChordDb(CHD_URL);
  const chords = db.chords;

  // Self-test: verify 11 chords loaded
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
  }

  // Apply saved orientation to toggle buttons
  updateOrientationButtons();
}

init().catch((err) => {
  console.error("Init failed:", err);
});
