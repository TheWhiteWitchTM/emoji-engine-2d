/**
 * A world position in pixels. The camera is the world point drawn at the
 * canvas origin (the top-left of the bitmap).
 */
export interface Point {
  x: number;
  y: number;
}

/**
 * Something Canvas can paint. `draw` receives the bitmap context and the
 * camera. Implementations convert world coordinates to pixels themselves.
 */
export interface Drawable {
  draw(ctx: CanvasRenderingContext2D, camera: Point): void;
}

/** Options for a new drawing surface. */
export interface CanvasOptions {
  /** Bitmap width in pixels. Default 800. */
  width?: number;
  /** Bitmap height in pixels. Default 600. */
  height?: number;
}

interface CanvasContract {
  readonly element: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly camera: Point;
  drawEmoji(emoji: string, x: number, y: number, size: number): void;
  add(drawable: Drawable, layer?: string): void;
  remove(drawable: Drawable): void;
  draw(): void;
  clear(): void;
  setCamera(x: number, y: number): void;
  follow(target: Point | null): void;
}

/**
 * Pure drawing surface. Owns the canvas element, the 2D context, named
 * layers, and the camera. No game rules and no page chrome.
 */
export class Canvas implements CanvasContract {
  /** The bitmap element. */
  readonly element: HTMLCanvasElement;
  /** The 2D drawing context for `element`. */
  readonly ctx: CanvasRenderingContext2D;
  /** World position shown at the top-left of the bitmap. */
  readonly camera: Point = { x: 0, y: 0 };

  private readonly layers = new Map<string, Drawable[]>();
  private followTarget: Point | null = null;

  /** Create a canvas element and a 2D context. Nothing is added to the document. */
  constructor(options: CanvasOptions = {}) {
    const element = document.createElement('canvas');
    element.width = options.width ?? 800;
    element.height = options.height ?? 600;
    const ctx = element.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is unavailable');
    this.element = element;
    this.ctx = ctx;
  }

  /** Draw one emoji centered on a world position. */
  drawEmoji(emoji: string, x: number, y: number, size: number): void {
    paintEmoji(this.ctx, this.camera, emoji, x, y, size);
  }

  /**
   * Add a drawable to a named layer, creating the layer on first use.
   * Layers paint in the order they were first created, back to front.
   * An empty layer keeps its place. Adding a drawable that is already
   * on the canvas moves it.
   */
  add(drawable: Drawable, layer = 'default'): void {
    this.remove(drawable);
    let list = this.layers.get(layer);
    if (!list) {
      list = [];
      this.layers.set(layer, list);
    }
    list.push(drawable);
  }

  /** Remove a drawable from whichever layer holds it. */
  remove(drawable: Drawable): void {
    for (const list of this.layers.values()) {
      const index = list.indexOf(drawable);
      if (index < 0) continue;
      list.splice(index, 1);
      return;
    }
  }

  /** Clear the bitmap and paint every layer. Applies `follow` first. */
  draw(): void {
    const target = this.followTarget;
    if (target) {
      this.camera.x = target.x - this.element.width / 2;
      this.camera.y = target.y - this.element.height / 2;
    }
    this.clear();
    for (const list of this.layers.values()) {
      for (const drawable of list) drawable.draw(this.ctx, this.camera);
    }
  }

  /** Clear the bitmap. Drawables stay registered. */
  clear(): void {
    this.ctx.clearRect(0, 0, this.element.width, this.element.height);
  }

  /** Place the camera so this world point sits at the top-left. */
  setCamera(x: number, y: number): void {
    this.camera.x = x;
    this.camera.y = y;
  }

  /**
   * Keep `target` centered on later `draw` calls.
   * Pass null to stop following. The camera stays where it is.
   * A follow target wins over `setCamera` until following stops.
   */
  follow(target: Point | null): void {
    this.followTarget = target;
  }
}

/** Shared emoji paint used by the canvas helper and by sprites. */
export function paintEmoji(
  ctx: CanvasRenderingContext2D,
  camera: Point,
  emoji: string,
  x: number,
  y: number,
  size: number,
): void {
  ctx.save();
  ctx.font = `${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, x - camera.x, y - camera.y);
  ctx.restore();
}
