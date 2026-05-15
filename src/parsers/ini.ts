/**
 * Minimal INI parser for Guit95 CD data files.
 *
 * Handles:
 * - CRLF and LF line endings
 * - ; and # line comments
 * - Duplicate keys within a section (returned as ordered array entries)
 * - Section names preserved in output (comparison is case-insensitive internally)
 * - Global key=value pairs before any [section]
 * - Malformed lines are silently skipped
 *
 * Input must be an already-decoded string (caller handles Windows-1252 decoding).
 */

export type IniFile = {
  global: Record<string, string>;
  sections: Array<{
    name: string;
    entries: Array<{ key: string; value: string }>;
  }>;
};

export function parseIni(text: string): IniFile {
  const result: IniFile = { global: {}, sections: [] };
  let currentSection: IniFile["sections"][number] | null = null;

  // Normalise CRLF → LF then split
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  for (const raw of lines) {
    // Strip inline comments and trim
    const line = raw.replace(/[;#].*$/, "").trim();
    if (line.length === 0) continue;

    // [section header]
    if (line.startsWith("[") && line.includes("]")) {
      const name = line.slice(1, line.indexOf("]")).trim();
      if (name.length === 0) continue;
      currentSection = { name, entries: [] };
      result.sections.push(currentSection);
      continue;
    }

    // key=value
    const eqIdx = line.indexOf("=");
    if (eqIdx < 1) continue; // no '=' or empty key — malformed, skip

    const key = line.slice(0, eqIdx).trim();
    const value = line.slice(eqIdx + 1).trim();
    if (key.length === 0) continue;

    if (currentSection === null) {
      // Global (before first section)
      result.global[key] = value;
    } else {
      currentSection.entries.push({ key, value });
    }
  }

  return result;
}
