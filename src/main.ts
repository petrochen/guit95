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

// Chord lookup by id (populated after CHD loads)
const chordsById = new Map<number, Chord>();

// Currently displayed chords (so orientation toggle can re-render)
let nowChordId: number | null = null;
let nextChordId: number | null = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const video      = document.getElementById("player")     as HTMLVideoElement;
const nowCanvas  = document.getElementById("now-canvas") as HTMLCanvasElement;
const nextCanvas = document.getElementById("next-canvas") as HTMLCanvasElement;
const nowName    = document.getElementById("now-name")   as HTMLElement;
const nextName   = document.getElementById("next-name")  as HTMLElement;
const allChords  = document.getElementById("all-chords") as HTMLElement;
const tabRow     = document.getElementById("tab-row")    as HTMLElement;
const btnVert    = document.getElementById("btn-vert")   as HTMLButtonElement;
const btnHoriz   = document.getElementById("btn-horiz")  as HTMLButtonElement;

// ── Diagram renderers ─────────────────────────────────────────────────────────
const nowDiagram  = new ChordDiagram(nowCanvas,  IMG_URL);
const nextDiagram = new ChordDiagram(nextCanvas, IMG_URL);

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

  // Create TabScroller
  new TabScroller(tabRow, {
    score,
    pngUrl: TAB_URL,
    video,
    onChordsChange: handleChordsChange,
  });
}

init().catch((err) => {
  console.error("Init failed:", err);
});
