import type { Score, Event } from "../parsers/sco.js";

export type TabScrollerOpts = {
  score: Score;
  pngUrl: string;
  video: HTMLVideoElement;
  onChordsChange?: (current: number | null, next: number | null) => void;
};

/**
 * Renders a horizontally-scrolling tablature strip that stays in sync with
 * video playback. A fixed vertical cursor sits at the visual centre of the
 * viewport; the strip translates left/right under it.
 *
 * DOM structure injected into `container`:
 *   <div class="tab-viewport">
 *     <div class="tab-strip">
 *       <img …>
 *       <div class="bar-marker" style="left:Npx"> …(one per bar) </div>
 *     </div>
 *     <div class="tab-cursor"></div>
 *   </div>
 */
export class TabScroller {
  private viewport: HTMLDivElement;
  private strip: HTMLDivElement;
  private img: HTMLImageElement;
  private cursor: HTMLDivElement;

  private score: Score;
  private video: HTMLVideoElement;
  private onChordsChange?: (current: number | null, next: number | null) => void;

  // FPS derived from score metadata + video duration (set after loadedmetadata)
  private fps: number | null = null;

  // Whether the image has fully decoded — guard the RAF loop
  private imgReady = false;

  private rafId: number | null = null;
  private resizeObserver: ResizeObserver;

  // Track last current/next chord to avoid redundant callbacks
  private lastCurrent: number | null = null;
  private lastNext: number | null = null;
  // Track last event index for interpolation
  private lastEventIdx: number = 0;

  // Track last centred pixel for click-to-seek calculation
  private lastCentredPixel: number = 0;

  constructor(container: HTMLElement, opts: TabScrollerOpts) {
    this.score = opts.score;
    this.video = opts.video;
    this.onChordsChange = opts.onChordsChange;
    this.lastCentredPixel = opts.score.startingPixel;

    // ── Build DOM ──────────────────────────────────────────────────────────────
    this.viewport = document.createElement("div");
    this.viewport.className = "tab-viewport";

    this.strip = document.createElement("div");
    this.strip.className = "tab-strip";

    this.img = document.createElement("img");
    this.img.src = opts.pngUrl;
    this.img.alt = "Tab strip";
    this.img.loading = "eager";
    this.img.draggable = false;

    this.cursor = document.createElement("div");
    this.cursor.className = "tab-cursor";

    this.strip.appendChild(this.img);

    // ── Bar markers (visual only — no click handlers) ──────────────────────────
    for (const barPx of this.score.bars) {
      const marker = document.createElement("div");
      marker.className = "bar-marker";
      marker.style.left = `${barPx}px`;
      this.strip.appendChild(marker);
    }

    this.viewport.appendChild(this.strip);
    this.viewport.appendChild(this.cursor);
    container.appendChild(this.viewport);

    // ── Click-to-seek on entire viewport ──────────────────────────────────────
    this.viewport.addEventListener("click", (e) => this.handleViewportClick(e));

    // ── Image ready guard ──────────────────────────────────────────────────────
    this.img.decode().then(() => {
      this.imgReady = true;
    }).catch(() => {
      // Fallback: mark ready on load event
      this.img.addEventListener("load", () => { this.imgReady = true; });
    });

    // ── FPS: derive after video metadata ──────────────────────────────────────
    if (!isNaN(this.video.duration) && this.video.duration > 0) {
      this.fps = this.score.endingFrame / this.video.duration;
    }
    this.video.addEventListener("loadedmetadata", () => {
      if (this.video.duration > 0) {
        this.fps = this.score.endingFrame / this.video.duration;
      }
    });

    // ── ResizeObserver: keep cursor centred on resize ─────────────────────────
    this.resizeObserver = new ResizeObserver(() => {
      this.applyTranslate(this.currentPixel());
    });
    this.resizeObserver.observe(this.viewport);

    // ── Start RAF loop ─────────────────────────────────────────────────────────
    this.startLoop();
  }

  // ── RAF loop ─────────────────────────────────────────────────────────────────

  private startLoop(): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.update();
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private update(): void {
    if (!this.imgReady) return;
    if (this.fps === null) return;

    const currentTime = this.video.currentTime;
    if (isNaN(currentTime)) return;

    const currentFrame = currentTime * this.fps;
    const pixel = this.interpolatePixel(currentFrame);
    this.applyTranslate(pixel);

    // Compute current and next chords
    const { current, next } = this.chordsAt(this.lastEventIdx);
    if (current !== this.lastCurrent || next !== this.lastNext) {
      this.lastCurrent = current;
      this.lastNext = next;
      this.onChordsChange?.(current, next);
    }
  }

  // ── Chord computation ────────────────────────────────────────────────────────

  private chordsAt(eventIdx: number): { current: number | null; next: number | null } {
    const events = this.score.events;

    // Walk backwards to find current chord
    let current: number | null = null;
    for (let i = eventIdx; i >= 0; i--) {
      if (events[i]?.chord !== undefined) {
        current = events[i]!.chord!;
        break;
      }
    }

    // Walk forwards to find next chord that differs from current
    let next: number | null = null;
    for (let i = eventIdx + 1; i < events.length; i++) {
      if (events[i]?.chord !== undefined && events[i]!.chord !== current) {
        next = events[i]!.chord!;
        break;
      }
    }

    return { current, next };
  }

  // ── Binary search + interpolation ────────────────────────────────────────────

  /**
   * Binary-search events for the largest index with frame <= currentFrame.
   * Returns -1 if currentFrame is before the first event.
   */
  private binarySearch(currentFrame: number): number {
    const events = this.score.events;
    if (events.length === 0) return -1;
    if (currentFrame < events[0]!.frame) return -1;

    let lo = 0;
    let hi = events.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (events[mid]!.frame <= currentFrame) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  /**
   * Interpolate pixel position between the event at `idx` and the next one.
   */
  private interpolatePixel(currentFrame: number): number {
    const { events, startingPixel, endingPixel } = this.score;

    const idx = this.binarySearch(currentFrame);
    this.lastEventIdx = idx < 0 ? 0 : idx;

    if (idx < 0) {
      // Before first event
      return events.length > 0 ? events[0]!.pixel : startingPixel;
    }

    const cur: Event = events[idx]!;

    // Past last event
    if (idx >= events.length - 1) {
      return cur.pixel;
    }

    const next: Event = events[idx + 1]!;
    const frameDelta = next.frame - cur.frame;
    if (frameDelta <= 0) return cur.pixel;

    const t = (currentFrame - cur.frame) / frameDelta;
    const pixel = cur.pixel + t * (next.pixel - cur.pixel);

    // Clamp to [startingPixel, endingPixel]
    return Math.max(startingPixel, Math.min(endingPixel, pixel));
  }

  // ── DOM updates ───────────────────────────────────────────────────────────────

  private currentPixel(): number {
    if (!this.imgReady || this.fps === null) return this.score.startingPixel;
    return this.interpolatePixel(this.video.currentTime * (this.fps ?? 0));
  }

  private applyTranslate(targetPixel: number): void {
    this.lastCentredPixel = targetPixel;
    const viewportWidth = this.viewport.clientWidth;
    const offset = targetPixel - viewportWidth / 2;
    // Clamp: don't scroll past strip edges
    const maxOffset = this.score.endingPixel - viewportWidth / 2;
    const minOffset = this.score.startingPixel - viewportWidth / 2;
    const clamped = Math.max(minOffset, Math.min(maxOffset, offset));
    this.strip.style.transform = `translateX(${-clamped}px)`;
  }

  // ── Click-to-seek ─────────────────────────────────────────────────────────────

  private handleViewportClick(e: MouseEvent): void {
    if (this.fps === null) return;

    const rect = this.viewport.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const viewportWidth = this.viewport.clientWidth;

    // Map click position to source pixel on the strip
    const sourcePixel = this.lastCentredPixel + (clickX - viewportWidth / 2);

    // Clamp to valid strip range
    const { startingPixel, endingPixel, events } = this.score;
    const clampedPixel = Math.max(startingPixel, Math.min(endingPixel, sourcePixel));

    // Find event with pixel closest to clampedPixel
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < events.length; i++) {
      const dist = Math.abs(events[i]!.pixel - clampedPixel);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    const targetFrame = events[bestIdx]?.frame ?? 0;
    this.video.currentTime = targetFrame / this.fps;
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────────

  dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.resizeObserver.disconnect();
  }
}
