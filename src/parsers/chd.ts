import { loadIni } from "./load.js";

export type Rect = { x: number; y: number; w: number; h: number };

// ── Chord display name helper ─────────────────────────────────────────────────

const SUBS = "₀₁₂₃₄₅₆₇₈₉";
function toSubscript(s: string): string {
  return s.replace(/\d/g, (d) => SUBS[+d]!);
}

/**
 * Convert a raw CHD chord name to a modern display name.
 * "Go" → "G", "C_3" → "C₃", "E_7" → "E₇", others unchanged.
 */
export function displayChordName(name: string): string {
  if (name === "Go") return "G";
  const m = /^([A-G][#b]?)_(\d+)$/.exec(name);
  if (m) return m[1]! + toSubscript(m[2]!);
  return name;
}

export type Chord = {
  id: number;
  name: string;
  picRect: Rect;       // vertical view crop from heyjoe2.bmp
  picRectUS: Rect;     // horizontal (US) view crop from heyjoe2.bmp
  sound: string;       // WAV filename, trimmed
  comments: string;    // French label, may be empty
  rgbHighlight: [number, number, number];
};

export type ChordDb = {
  pictureFile: string; // relative to the CHD file directory
  chords: Chord[];     // in source order
};

function parseRect(val: string): Rect | null {
  const parts = val.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  const x1 = parts[0]!, y1 = parts[1]!, x2 = parts[2]!, y2 = parts[3]!;
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function parseRgb(val: string): [number, number, number] | null {
  const parts = val.trim().split(/\s+/).map((s) => parseInt(s, 10));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const r = parts[0]!, g = parts[1]!, b = parts[2]!;
  return [r, g, b];
}

export async function loadChordDb(chdUrl: string): Promise<ChordDb> {
  const ini = await loadIni(chdUrl);

  // pictureFile is a global key
  const pictureFile = (ini.global["PictureFile"] ?? ini.global["picturefile"] ?? "").trim();

  const chords: Chord[] = [];

  for (const section of ini.sections) {
    if (section.name.toLowerCase() !== "chord") continue;

    // Build a lookup map (last value wins for duplicates, except we use first)
    const fields: Record<string, string> = {};
    for (const { key, value } of section.entries) {
      const k = key.toLowerCase();
      if (!(k in fields)) {
        fields[k] = value.trim();
      }
    }

    const idStr = fields["chord"];
    const name = fields["name"];
    const picRectRaw = fields["pic_rect"];
    const picRectUSRaw = fields["pic_rect_us"];
    const sound = fields["sound"];

    // Validate required fields
    if (!name || !picRectRaw || !picRectUSRaw || !sound) {
      console.warn(`[chd] Skipping chord section (missing required fields): id=${idStr ?? "?"}`);
      continue;
    }

    const picRect = parseRect(picRectRaw);
    const picRectUS = parseRect(picRectUSRaw);

    if (!picRect || !picRectUS) {
      console.warn(`[chd] Skipping chord "${name}": malformed pic_rect`);
      continue;
    }

    const id = idStr !== undefined ? parseInt(idStr, 10) : chords.length;
    const comments = fields["comments"] ?? "";
    const rgbRaw = fields["rgbhighlight"];
    const rgbHighlight: [number, number, number] =
      rgbRaw ? (parseRgb(rgbRaw) ?? [255, 0, 0]) : [255, 0, 0];

    chords.push({
      id,
      name: name.trim(),
      picRect,
      picRectUS,
      sound: sound.trim(),
      comments: comments.trim(),
      rgbHighlight,
    });
  }

  return { pictureFile, chords };
}
