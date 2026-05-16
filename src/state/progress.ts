// src/state/progress.ts — localStorage helpers for song positions + exercise progress.

// ── Feature 1: Per-song playback position ─────────────────────────────────────

const KEY_POS = "song-positions";

export function getPosition(slug: string): number {
  try {
    return (JSON.parse(localStorage.getItem(KEY_POS) ?? "{}") as Record<string, number>)[slug] ?? 0;
  } catch {
    return 0;
  }
}

export function setPosition(slug: string, t: number): void {
  let obj: Record<string, number> = {};
  try { obj = JSON.parse(localStorage.getItem(KEY_POS) ?? "{}"); } catch {}
  obj[slug] = t;
  localStorage.setItem(KEY_POS, JSON.stringify(obj));
}

// ── Feature 4: Per-exercise completion tracking ───────────────────────────────

const KEY_PROG = "exercise-progress";

export function getCompleted(slug: string): Set<number> {
  try {
    const obj = JSON.parse(localStorage.getItem(KEY_PROG) ?? "{}") as Record<string, number[]>;
    return new Set(obj[slug] ?? []);
  } catch {
    return new Set();
  }
}

export function toggleCompleted(slug: string, displayIdx: number): boolean {
  const obj = (() => {
    try { return JSON.parse(localStorage.getItem(KEY_PROG) ?? "{}"); } catch { return {}; }
  })() as Record<string, number[]>;
  const set = new Set(obj[slug] ?? []);
  const wasIn = set.has(displayIdx);
  if (wasIn) set.delete(displayIdx); else set.add(displayIdx);
  obj[slug] = Array.from(set).sort((a, b) => a - b);
  localStorage.setItem(KEY_PROG, JSON.stringify(obj));
  return !wasIn; // new state: true = now completed
}

export function resetProgress(): void {
  localStorage.removeItem(KEY_PROG);
}
