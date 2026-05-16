import { loadIni } from "./load.js";

/**
 * One playback segment of an exercise (voice intro + demo video).
 * Most exercises have multiple — e.g. "intro" + "slow demo" + "tempo demo".
 */
export type ExerciseSegment = {
  voiceFile: string;    // resolved URL to .wav
  videoFile: string;    // resolved URL to .mp4
};

/**
 * Parsed data from an EXR exercise file.
 */
export type ExerciseDef = {
  number: number;       // 1..15 (per song) or 1..9 (toolkit)
  segments: ExerciseSegment[]; // 1..N segments; first is the "intro"
  // Convenience aliases pointing to segments[0] for backward compat:
  voiceFile: string;
  videoFile: string;
  tabImage: string | null; // resolved relative URL to .png, or null
};

/**
 * Expand the %s macro (language prefix) to "r" (Russian).
 * "%sex1-1.wav" → "rex1-1.wav"
 */
function expandMacro(value: string): string {
  return value.replace(/%s/gi, "r");
}

/**
 * Load and parse an EXR file for exercise `number`.
 * @param folderUrl  URL of the exercise folder, e.g. "/assets/heyjoe/raw/exercice/1/"
 * @param number     Exercise number 1..15
 */
export async function loadExercise(folderUrl: string, number: number): Promise<ExerciseDef> {
  // Ensure folder URL ends with /
  const base = folderUrl.endsWith("/") ? folderUrl : folderUrl + "/";
  const exrUrl = `${base}ex${number}.exr`;

  let ini;
  try {
    ini = await loadIni(exrUrl);
  } catch (err) {
    console.error(`[exr] Failed to load ${exrUrl}:`, err);
    throw err;
  }

  // Collect ALL unique aviopen= and playsnd= values, in source order.
  // Then zip them: segment N = (videoN, voiceN). Most exercises pair 1:1.
  const videos: string[] = [];
  const voices: string[] = [];
  const tabBmps: string[] = [];

  for (const section of ini.sections) {
    for (const entry of section.entries) {
      const key = entry.key.toLowerCase();
      const val = entry.value.trim();

      if (key === "aviopen") {
        const v = val.toLowerCase();
        if (!videos.includes(v)) videos.push(v);
      }
      if (key === "playsnd") {
        const v = expandMacro(val).toLowerCase();
        if (!voices.includes(v)) voices.push(v);
      }
    }
  }

  let videoFilename: string | null = videos[0] ?? null;
  let voiceFilename: string | null = voices[0] ?? null;
  let tabBmpFilename: string | null = null;

  // Walk [picture] sections for bitmap=sco*.bmp
  for (const section of ini.sections) {
    if (section.name.toLowerCase() === "picture") {
      for (const entry of section.entries) {
        if (entry.key.toLowerCase() === "bitmap") {
          const bmpVal = entry.value.trim().toLowerCase();
          // Match sco*.bmp pattern
          const bmpBasename = bmpVal.replace(/\\/g, "/").split("/").pop() ?? "";
          if (bmpBasename.startsWith("sco") && bmpBasename.endsWith(".bmp")) {
            if (!tabBmpFilename) {
              tabBmpFilename = bmpBasename;
            }
          }
        }
      }
    }
  }

  if (!videoFilename) {
    console.warn(`[exr] No aviopen= found in ex${number}.exr`);
    // Fallback: guess first video filename
    videoFilename = `${number}-1.avi`;
  }

  if (!voiceFilename) {
    console.warn(`[exr] No playsnd= found in ex${number}.exr`);
    // Fallback: guess first voice filename
    voiceFilename = `rex${number}-1.wav`;
  }

  // Convert .avi → .mp4 extension
  const videoFile = base + videoFilename.replace(/\.avi$/i, ".mp4");

  // Voice file: just the filename in the same folder
  const voiceBasename = voiceFilename.replace(/\\/g, "/").split("/").pop() ?? voiceFilename;
  const voiceFile = base + voiceBasename;

  // Tab image: .bmp → .png
  const tabImage = tabBmpFilename
    ? base + tabBmpFilename.replace(/\.bmp$/i, ".png")
    : null;

  // Build segments array: zip videos + voices by index. If one list is longer,
  // pair what we can; remaining items are dropped (rare edge case).
  const len = Math.max(videos.length, voices.length, 1);
  const segments: ExerciseSegment[] = [];
  for (let i = 0; i < len; i++) {
    const v = (videos[i] ?? videoFilename).replace(/\.avi$/i, ".mp4");
    const aRaw = voices[i] ?? voiceFilename;
    const a = aRaw.replace(/\\/g, "/").split("/").pop() ?? aRaw;
    segments.push({ videoFile: base + v, voiceFile: base + a });
  }
  if (segments.length === 0) {
    segments.push({ videoFile, voiceFile });
  }

  return { number, segments, voiceFile, videoFile, tabImage };
}
