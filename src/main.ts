import { parseIni } from "./parsers/ini.js";

// ── INI parser self-test ──────────────────────────────────────────────────────
const r = parseIni("BackBmp=foo.bmp\n[chord]\nname=C\nname=D\n");
console.assert(r.global["BackBmp"] === "foo.bmp", "global key BackBmp");
console.assert(
  r.sections.length === 1 && r.sections[0] !== undefined && r.sections[0].entries.length === 2,
  "one section with 2 entries"
);

const pass =
  r.global["BackBmp"] === "foo.bmp" &&
  r.sections.length === 1 &&
  r.sections[0] !== undefined &&
  r.sections[0].entries.length === 2;

const statusEl = document.getElementById("status");
if (statusEl) {
  statusEl.textContent = pass ? "PASS" : "FAIL";
  statusEl.className = pass ? "pass" : "fail";
}
