import type { Rect } from "../parsers/chd.js";

/**
 * Manages the chord diagram canvas.
 * Loads heyjoe2.png once and redraws the appropriate crop on demand.
 * Renders at 2× device-pixel ratio for sharpness on retina displays.
 */

export class ChordDiagram {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private img: HTMLImageElement | null = null;
  private imgUrl: string;

  constructor(canvas: HTMLCanvasElement, imgUrl: string) {
    this.canvas = canvas;
    this.imgUrl = imgUrl;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get 2D context");
    this.ctx = ctx;
  }

  /** Load the sprite sheet image. Must be called before render(). */
  async load(): Promise<void> {
    const img = new Image();
    img.src = this.imgUrl;
    await img.decode();
    this.img = img;
  }

  /**
   * Draw the chord crop into the canvas.
   * Internal pixel buffer = source × DPR for sharpness.
   * CSS sizing is fluid via styles.css (width 100%, aspect-ratio preserved).
   */
  render(rect: Rect): void {
    if (!this.img) return;

    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.w * dpr;
    this.canvas.height = rect.h * dpr;
    this.canvas.style.aspectRatio = `${rect.w} / ${rect.h}`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.drawImage(
      this.img,
      rect.x, rect.y, rect.w, rect.h,
      0, 0, rect.w, rect.h
    );
  }

  /** Clear the canvas (initial state: no chord selected). */
  clear(): void {
    this.canvas.width = 0;
    this.canvas.height = 0;
  }
}
