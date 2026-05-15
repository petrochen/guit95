import { parseIni, type IniFile } from "./ini.js";

/**
 * Fetch a URL, decode as Windows-1252, and parse as INI.
 * Needed because Guit95 data files contain French characters (é, è, â, etc.)
 * encoded in Windows-1252, not UTF-8.
 */
export async function loadIni(url: string): Promise<IniFile> {
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const text = new TextDecoder("windows-1252").decode(buf);
  return parseIni(text);
}
