import type { Score, Event, Difficulty } from "../parsers/sco.js";

export type TabScrollerOpts = {
  score: Score;
  pngUrl: string;
  video: HTMLVideoElement;
  onChordsChange?: (current: number | null, next: number | null) => void;
  onDifficultyClick?: (exercice: number, sound: string) => void;
};

/**
 * Renders a horizontally-scrolling tablature strip that stays in sync with
 * video playback. Songsterr-style page-flip behaviour:
 *   - The partition stands still; the cursor runs across the visible viewport.
 *   - When the cursor reaches ~90 % of viewport width, the partition jumps
 *     left so the cursor restarts at ~10 %.
 *   - Manual drag pans the partition without seeking.
 *   - A click (movement < 4 px) seeks the video.
 *
 * State:
 *   viewportOffset — source-pixel position of the strip's left edge.
 *   strip rendered with transform: translateX(-viewportOffset px).
 *   cursorScreenX  = targetPixel - viewportOffset.
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
  private onDifficultyClick?: (exercice: number, sound: string) => void;

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

  // ── Page-flip scroll state ────────────────────────────────────────────────
  // viewportOffset: source pixel at the left edge of the viewport
  private viewportOffset: number;

  // ── Drag state ────────────────────────────────────────────────────────────
  private isDragging = false;
  private dragStartX = 0;        // clientX at pointer-down
  private dragLastX = 0;         // clientX at last pointer-move
  private dragTotalDeltaX = 0;   // cumulative |delta| for click detection
  private pointerdownTarget: HTMLElement | null = null; // element under pointerdown
  private activePointerId: number | null = null;

  constructor(container: HTMLElement, opts: TabScrollerOpts) {
    this.score = opts.score;
    this.video = opts.video;
    this.onChordsChange = opts.onChordsChange;
    this.onDifficultyClick = opts.onDifficultyClick;

    // Start viewportOffset so cursor begins near 10% from left
    // (will be properly set on first RAF tick once viewport width is known)
    this.viewportOffset = this.score.startingPixel;

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

    // ── Feature 2: Pointer Events (unifies mouse + touch + pen) ──────────────
    // touchAction:none tells iOS Safari we handle gestures ourselves.
    this.viewport.style.touchAction = "none";
    this.viewport.addEventListener("pointerdown", (e) => this.onPointerDown(e));

    // ── Wheel scroll (bonus) ──────────────────────────────────────────────────
    this.viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      this.viewportOffset = this.clampOffset(this.viewportOffset + delta);
      this.applyTransforms();
    }, { passive: false });

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

    // ── ResizeObserver: re-apply transforms on resize ─────────────────────────
    this.resizeObserver = new ResizeObserver(() => {
      this.applyTransforms();
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
    const targetPixel = this.interpolatePixel(currentFrame);

    const viewportWidth = this.viewport.clientWidth;
    if (viewportWidth === 0) return;

    const cursorScreenX = targetPixel - this.viewportOffset;

    // Rule 3: auto-advance — cursor approaching right edge (~90%)
    if (cursorScreenX > viewportWidth * 0.9) {
      this.viewportOffset = targetPixel - viewportWidth * 0.1;
    }
    // Rule 4: auto-recover — cursor off-screen (after seek back or big drag)
    else if (cursorScreenX < 0 || cursorScreenX > viewportWidth) {
      this.viewportOffset = targetPixel - viewportWidth * 0.1;
    }

    // Rule 5: clamp
    this.viewportOffset = this.clampOffset(this.viewportOffset);

    // Apply to DOM
    this.applyTransforms();

    // Compute current and next chords
    const { current, next } = this.chordsAt(this.lastEventIdx);
    if (current !== this.lastCurrent || next !== this.lastNext) {
      this.lastCurrent = current;
      this.lastNext = next;
      this.onChordsChange?.(current, next);
    }
  }

  // ── Clamp viewportOffset ─────────────────────────────────────────────────────

  private clampOffset(offset: number): number {
    const viewportWidth = this.viewport.clientWidth;
    const { startingPixel, endingPixel } = this.score;
    const min = startingPixel - viewportWidth * 0.1;
    const max = endingPixel - viewportWidth * 0.9;
    // Allow max < min when strip is shorter than viewport (show whole strip)
    if (max < min) return min;
    return Math.max(min, Math.min(max, offset));
  }

  // ── Apply strip + cursor transforms ─────────────────────────────────────────

  private applyTransforms(): void {
    if (!this.imgReady || this.fps === null) return;

    const targetPixel = this.interpolatePixel(this.video.currentTime * this.fps);
    const cursorScreenX = targetPixel - this.viewportOffset;

    this.strip.style.transform = `translateX(${-this.viewportOffset}px)`;
    this.cursor.style.transform = `translateX(${cursorScreenX}px)`;
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

  // ── Feature 2: Pointer Events drag + click handling ─────────────────────────

  private onPointerDown(e: PointerEvent): void {
    // Only handle primary pointer (ignore secondary touches for now)
    if (this.activePointerId !== null) return;

    e.preventDefault(); // Suppress iOS scroll/zoom default
    this.viewport.setPointerCapture(e.pointerId);
    this.activePointerId = e.pointerId;

    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragLastX = e.clientX;
    this.dragTotalDeltaX = 0;
    this.pointerdownTarget = e.target as HTMLElement;

    // Disable CSS transition during drag
    this.strip.classList.add("dragging");

    const onPointerMove = (ev: PointerEvent) => {
      if (ev.pointerId !== this.activePointerId) return;
      const deltaX = ev.clientX - this.dragLastX;
      this.dragTotalDeltaX += Math.abs(deltaX);
      this.dragLastX = ev.clientX;

      // Dragging right (positive deltaX) = viewport moves right = earlier content
      this.viewportOffset = this.clampOffset(this.viewportOffset - deltaX);
      this.applyTransforms();
    };

    const onPointerUp = (ev: PointerEvent) => {
      if (ev.pointerId !== this.activePointerId) return;
      this.viewport.removeEventListener("pointermove", onPointerMove);
      this.viewport.removeEventListener("pointerup", onPointerUp);
      this.viewport.removeEventListener("pointercancel", onPointerUp);

      this.strip.classList.remove("dragging");
      this.isDragging = false;
      this.activePointerId = null;

      // Click detection: total movement < 4 px → dispatch based on target
      if (this.dragTotalDeltaX < 4) {
        const hotspot = this.pointerdownTarget?.closest(".difficulty-hotspot") as HTMLElement | null;
        if (hotspot) {
          const exercice = parseInt(hotspot.dataset["exercice"] ?? "0", 10);
          const sound = hotspot.dataset["sound"] ?? "";
          this.onDifficultyClick?.(exercice, sound);
        } else {
          this.handleClick(ev);
        }
      }

      this.pointerdownTarget = null;
    };

    this.viewport.addEventListener("pointermove", onPointerMove);
    this.viewport.addEventListener("pointerup", onPointerUp);
    this.viewport.addEventListener("pointercancel", onPointerUp);
  }

  // ── Click-to-seek ─────────────────────────────────────────────────────────────

  private handleClick(e: PointerEvent): void {
    if (this.fps === null) return;

    const rect = this.viewport.getBoundingClientRect();
    const clickX = e.clientX - rect.left;

    // Map click X position to source pixel using current viewportOffset
    const sourcePixel = this.viewportOffset + clickX;

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

  // ── Difficulty hotspot overlays ───────────────────────────────────────────────

  /**
   * Render difficulty hotspot overlays inside the tab strip.
   * Idempotent: removes any previously-rendered `.difficulty-hotspot` elements
   * before re-creating them.
   *
   * @param opts.labelForExercice — optional function mapping CD exercise number
   *   to the display label string used in the tooltip. Defaults to the raw CD number.
   */
  setDifficulties(
    items: Difficulty[],
    opts?: { labelForExercice?: (cdNum: number) => string },
  ): void {
    // Remove previous hotspots
    this.strip.querySelectorAll(".difficulty-hotspot").forEach((el) => el.remove());

    for (const item of items) {
      const [r, g, b] = item.color;
      const el = document.createElement("div");
      el.className = "difficulty-hotspot";
      el.style.left   = `${item.rect.x}px`;
      el.style.top    = `${item.rect.y}px`;
      el.style.width  = `${item.rect.w}px`;
      el.style.height = `${item.rect.h}px`;
      el.style.background = `rgba(${r},${g},${b},0.20)`;
      el.style.border     = `1px solid rgba(${r},${g},${b},0.65)`;
      el.dataset["exercice"] = String(item.exercice);
      el.dataset["sound"]    = item.sound;
      const label = opts?.labelForExercice
        ? opts.labelForExercice(item.exercice)
        : String(item.exercice);
      el.title = `Hard passage → exercise ${label} (click to open)`;

      this.strip.appendChild(el);
    }
  }

  // ── A/B loop markers ────────────────────────────────────────────────────────────

  /**
   * (Re)render A and B marker lines and the loop-region overlay inside the strip.
   * Idempotent: removes any previously-rendered markers before re-rendering.
   */
  setLoop(opts: { a: number | null; b: number | null; on: boolean }): void {
    // Remove previous markers and region
    this.strip.querySelectorAll(".ab-marker, .loop-region").forEach((el) => el.remove());

    if (opts.a !== null) {
      const markerA = document.createElement("div");
      markerA.className = "ab-marker a";
      markerA.style.left = `${opts.a}px`;
      this.strip.appendChild(markerA);
    }

    if (opts.b !== null) {
      const markerB = document.createElement("div");
      markerB.className = "ab-marker b";
      markerB.style.left = `${opts.b}px`;
      this.strip.appendChild(markerB);
    }

    if (opts.a !== null && opts.b !== null && opts.a < opts.b) {
      const region = document.createElement("div");
      region.className = "loop-region";
      region.style.left = `${opts.a}px`;
      region.style.width = `${opts.b - opts.a}px`;
      this.strip.appendChild(region);
    }
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
