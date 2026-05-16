import type { Score, Event } from "../parsers/sco.js";

/**
 * ScoreSync — shared helper for pixel↔time math.
 * Used by the A/B loop logic and A/B button handlers in main.ts.
 * TabScroller keeps its own internal helpers to avoid a refactor risk.
 */
export class ScoreSync {
  constructor(private score: Score, private video: HTMLVideoElement) {}

  get fps(): number | null {
    if (!this.video.duration || isNaN(this.video.duration)) return null;
    return this.score.endingFrame / this.video.duration;
  }

  /** Seconds → source pixel (interpolated through events). */
  timeToPixel(time: number): number {
    const fps = this.fps;
    if (fps === null) return this.score.startingPixel;
    return this.frameToPixel(time * fps);
  }

  /** Source pixel → seconds. */
  pixelToTime(pixel: number): number {
    const fps = this.fps;
    if (fps === null) return 0;
    return this.pixelToFrame(pixel) / fps;
  }

  /**
   * Find the first event in the score where `chord=chordId`. Returns the
   * frame number, or null if this chord never appears.
   * Used by "where in song?" jump on chord buttons — works for all songs
   * (CD's `avi=` field is only on Hey Joe + Life).
   */
  firstFrameOfChord(chordId: number): number | null {
    for (const ev of this.score.events) {
      if (ev.chord === chordId) return ev.frame;
    }
    return null;
  }

  /** Convert frame number → seconds. Useful for seeking from CD's avi= field. */
  frameToTime(frame: number): number | null {
    const fps = this.fps;
    if (fps === null) return null;
    return frame / fps;
  }

  /** Find bar pixel closest to a source pixel. Returns bar pixel + 1-indexed bar number. */
  nearestBar(pixel: number): { pixel: number; index: number } | null {
    const bars = this.score.bars;
    if (bars.length === 0) return null;
    let best = 0;
    let bestDist = Math.abs(bars[0]! - pixel);
    for (let i = 1; i < bars.length; i++) {
      const d = Math.abs(bars[i]! - pixel);
      if (d < bestDist) { best = i; bestDist = d; }
    }
    return { pixel: bars[best]!, index: best + 1 };
  }

  // Internal: binary-search events for frame→pixel interpolation.
  private frameToPixel(frame: number): number {
    const events = this.score.events;
    if (events.length === 0) return this.score.startingPixel;
    if (frame <= events[0]!.frame) return events[0]!.pixel;
    if (frame >= events[events.length - 1]!.frame) return events[events.length - 1]!.pixel;
    let lo = 0, hi = events.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (events[mid]!.frame <= frame) lo = mid; else hi = mid - 1;
    }
    const cur: Event = events[lo]!;
    const next: Event = events[lo + 1]!;
    const t = (frame - cur.frame) / (next.frame - cur.frame || 1);
    return cur.pixel + t * (next.pixel - cur.pixel);
  }

  private pixelToFrame(pixel: number): number {
    const events = this.score.events;
    if (events.length === 0) return 0;
    // Linear scan — cheap, only ~534 events.
    let bestIdx = 0;
    let bestDist = Math.abs(events[0]!.pixel - pixel);
    for (let i = 1; i < events.length; i++) {
      const d = Math.abs(events[i]!.pixel - pixel);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return events[bestIdx]!.frame;
  }
}
