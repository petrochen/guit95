import { loadIni } from "./load.js";

/**
 * Parsed data from an EXR exercise file.
 */
export type ExerciseDef = {
  number: number;       // 1..15
  voiceFile: string;    // resolved relative URL to .wav (lowercased, %s expanded)
  videoFile: string;    // resolved relative URL to .mp4 (converted from .avi)
  tabImage: string | null; // resolved relative URL to .png (converted from .bmp), or null
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

  let videoFilename: string | null = null;
  let voiceFilename: string | null = null;
  let tabBmpFilename: string | null = null;

  // Walk all sections looking for the first aviopen= and first playsnd=
  for (const section of ini.sections) {
    for (const entry of section.entries) {
      const key = entry.key.toLowerCase();
      const val = entry.value.trim();

      if (!videoFilename && key === "aviopen") {
        videoFilename = val.toLowerCase();
      }

      if (!voiceFilename && key === "playsnd") {
        // Expand %s macro and lowercase
        voiceFilename = expandMacro(val).toLowerCase();
      }

      // Also check global [picture] sections for tab image (bitmap=sco*.bmp)
    }
  }

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

  return { number, voiceFile, videoFile, tabImage };
}
