import { loadIni } from "./load.js";

export type Event = {
  frame: number;
  pixel: number;
  chord?: number;   // chord id matching Chord.id from CHD
  manual?: boolean;
};

export type Difficulty = {
  sound: string;
  rect: { x: number; y: number; w: number; h: number };
  index: number;
  color: [number, number, number];
  exercice: number;
};

export type Score = {
  videoFile: string;
  scoreFile: string;
  startingFrame: number;
  endingFrame: number;
  startingPixel: number;
  endingPixel: number;
  bars: number[];           // sorted unique pixel positions
  events: Event[];          // sorted by frame ascending
  difficulties: Difficulty[]; // parsed but unused in Phase 2
};

function parseRect(val: string): { x: number; y: number; w: number; h: number } | null {
  const parts = val.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  const [x1, y1, x2, y2] = parts as [number, number, number, number];
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function parseColor(val: string): [number, number, number] | null {
  const parts = val.split(",").map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return parts as [number, number, number];
}

export async function loadScore(url: string): Promise<Score> {
  const ini = await loadIni(url);

  // ── Header (global keys, case-insensitive) ──────────────────────────────────
  const g = ini.global;
  const videoFile = (g["videofile"] ?? g["videoFile"] ?? "").trim();
  const scoreFile = (g["scorefile"] ?? g["scoreFile"] ?? "").trim();
  const startingFrame = parseInt(g["startingframe"] ?? g["startingFrame"] ?? "0", 10);
  const endingFrame   = parseInt(g["endingframe"]   ?? g["endingFrame"]   ?? "0", 10);
  const startingPixel = parseInt(g["startingpixel"] ?? g["startingPixel"] ?? "0", 10);
  const endingPixel   = parseInt(g["endingpixel"]   ?? g["endingPixel"]   ?? "0", 10);

  // ── Parse sections ───────────────────────────────────────────────────────────
  const bars: number[] = [];
  const events: Event[] = [];
  const difficulties: Difficulty[] = [];

  for (const section of ini.sections) {
    const name = section.name.toLowerCase();

    if (name === "bar") {
      // Single [bar] section with many pixel= entries
      for (const { key, value } of section.entries) {
        if (key.toLowerCase() === "pixel") {
          const px = parseInt(value, 10);
          if (!isNaN(px)) bars.push(px);
        }
      }
      continue;
    }

    if (name === "event") {
      // Build a field map (first value wins per key within the section)
      const fields: Record<string, string> = {};
      for (const { key, value } of section.entries) {
        const k = key.toLowerCase();
        if (!(k in fields)) fields[k] = value.trim();
      }

      const frame = parseInt(fields["frame"] ?? "", 10);
      const pixel = parseInt(fields["pixel"] ?? "", 10);

      if (isNaN(frame) || isNaN(pixel)) {
        console.warn("[sco] Skipping malformed event:", fields);
        continue;
      }

      const event: Event = { frame, pixel };

      const chordRaw = fields["chord"];
      if (chordRaw !== undefined) {
        const chordId = parseInt(chordRaw, 10);
        if (!isNaN(chordId)) event.chord = chordId;
      }

      if (fields["manual"] === "1") event.manual = true;

      events.push(event);
      continue;
    }

    if (name === "difficulty") {
      const fields: Record<string, string> = {};
      for (const { key, value } of section.entries) {
        const k = key.toLowerCase();
        if (!(k in fields)) fields[k] = value.trim();
      }

      const rectRaw = fields["rect"];
      const colorRaw = fields["color"];
      const indexRaw = fields["index"];
      const exerciceRaw = fields["exercice"];
      const sound = fields["sound"] ?? "";

      const rect = rectRaw ? parseRect(rectRaw) : null;
      const color = colorRaw ? parseColor(colorRaw) : null;

      if (!rect || !color) {
        console.warn("[sco] Skipping malformed difficulty:", fields);
        continue;
      }

      difficulties.push({
        sound: sound.trim(),
        rect,
        index: parseInt(indexRaw ?? "0", 10),
        color,
        exercice: parseInt(exerciceRaw ?? "0", 10),
      });
      continue;
    }
  }

  // ── Sort and dedupe bars ─────────────────────────────────────────────────────
  const uniqueBars = [...new Set(bars)].sort((a, b) => a - b);

  // ── Sort events by frame ascending (they should already be, but enforce) ─────
  events.sort((a, b) => a.frame - b.frame);

  return {
    videoFile,
    scoreFile,
    startingFrame,
    endingFrame,
    startingPixel,
    endingPixel,
    bars: uniqueBars,
    events,
    difficulties,
  };
}
