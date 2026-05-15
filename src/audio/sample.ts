/**
 * Simple single-element audio player for chord samples.
 * Reuses one HTMLAudioElement to avoid overlapping playback.
 * Phase 6 (metronome) will introduce AudioContext if needed.
 */

let el: HTMLAudioElement | null = null;

export function playSample(url: string): void {
  if (!el) el = new Audio();
  el.src = url;
  el.currentTime = 0;
  void el.play();
}
