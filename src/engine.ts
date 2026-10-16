import { Canvas, paintEmoji, type Drawable, type Point } from './canvas.ts';

/**
 * A free-moving emoji sprite. `radius` is always `size / 2` and is what
 * circle collision uses. `vx` and `vy` are pixels per `update`.
 */
export interface Sprite extends Drawable {
  emoji: string;
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  layer: string;
  alive: boolean;
  /** Collision radius in pixels (circle test). */
  readonly radius: number;
  data: Record<string, unknown>;
}

/** Called once per overlapping pair per update, earlier sprite first. */
export type CollisionHandler = (a: Sprite, b: Sprite) => void;

/** Options for the game systems layer. */
export interface EngineOptions {
  /** Bitmap width when this engine creates the canvas. Default 800. */
  width?: number;
  /** Bitmap height when this engine creates the canvas. Default 600. */
  height?: number;
  /** Use this surface instead of creating one. `width` and `height` are then ignored. */
  canvas?: Canvas;
}

interface EngineContract {
  readonly canvas: Canvas;
  sprite(emoji: string, x: number, y: number, size?: number, layer?: string): Sprite;
  motion(sprite: Sprite, vx: number, vy: number): void;
  onCollision(handler: CollisionHandler): void;
  update(): void;
  start(): void;
  stop(): void;
  isKeyDown(key: string): boolean;
  beep(freq?: number, duration?: number): void;
}

/**
 * Sprites, motion, circle collision, keyboard, beep, and the frame loop.
 * Uses a Canvas and does not build header or footer chrome.
 */
export class Engine implements EngineContract {
  readonly canvas: Canvas;

  private readonly sprites: Sprite[] = [];
  private readonly collisions: CollisionHandler[] = [];
  private readonly keys = new Set<string>();
  private audio: AudioContext | null = null;
  private raf = 0;
  private running = false;

  /** Use `options.canvas`, or create one. Does not build page chrome. */
  constructor(options: EngineOptions = {}) {
    this.canvas = options.canvas ?? new Canvas({
      width: options.width,
      height: options.height,
    });
    this.armKeys();
  }

  /**
   * Create a sprite and place it on a named canvas layer.
   * `size` is the font size in pixels and defaults to 32.
   * `layer` defaults to `default`.
   */
  sprite(emoji: string, x: number, y: number, size = 32, layer = 'default'): Sprite {
    const sprite = new EmojiSprite(emoji, x, y, size, layer);
    this.sprites.push(sprite);
    this.canvas.add(sprite, layer);
    return sprite;
  }

  /** Set per-frame velocity in pixels. */
  motion(sprite: Sprite, vx: number, vy: number): void {
    sprite.vx = vx;
    sprite.vy = vy;
  }

  /** Register a callback for living sprites whose circles overlap. */
  onCollision(handler: CollisionHandler): void {
    this.collisions.push(handler);
  }

  /** Move living sprites by `vx`/`vy`, then test circle overlaps. */
  update(): void {
    const live: Sprite[] = [];
    for (const sprite of this.sprites) {
      if (!sprite.alive) continue;
      sprite.x += sprite.vx;
      sprite.y += sprite.vy;
      live.push(sprite);
    }
    for (let i = 0; i < live.length; i += 1) {
      for (let j = i + 1; j < live.length; j += 1) {
        const a = live[i];
        const b = live[j];
        if (!circlesOverlap(a, b)) continue;
        for (const handler of this.collisions) handler(a, b);
      }
    }
  }

  /** Start the `requestAnimationFrame` loop. Each frame updates, then draws. */
  start(): void {
    if (this.running) return;
    if (typeof requestAnimationFrame !== 'function') {
      throw new Error('requestAnimationFrame is unavailable');
    }
    this.running = true;
    this.raf = requestAnimationFrame(this.tick);
  }

  /** Stop the frame loop. */
  stop(): void {
    this.running = false;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.raf);
  }

  /** True while `key` (`KeyboardEvent.key`) is held. */
  isKeyDown(key: string): boolean {
    return this.keys.has(key);
  }

  /**
   * Play a short square-wave beep.
   * `freq` is Hertz (default 440) and `duration` is milliseconds (default 120).
   * Does nothing when the Web Audio API is missing.
   */
  beep(freq = 440, duration = 120): void {
    const AudioCtor = globalThis.AudioContext;
    if (typeof AudioCtor !== 'function') return;
    try {
      const audio = this.audio ?? new AudioCtor();
      this.audio = audio;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.value = 0.05;
      osc.connect(gain);
      gain.connect(audio.destination);
      const stopAt = audio.currentTime + duration / 1000;
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      osc.start();
      osc.stop(stopAt);
    } catch {
      // Autoplay policies and headless hosts can reject audio. The game continues.
    }
  }

  private tick = (): void => {
    if (!this.running) return;
    this.update();
    this.canvas.draw();
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
  };

  private armKeys(): void {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.key);
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.key);
    });
  }
}

class EmojiSprite implements Sprite {
  emoji: string;
  x: number;
  y: number;
  size: number;
  vx = 0;
  vy = 0;
  layer: string;
  alive = true;
  data: Record<string, unknown> = {};

  constructor(emoji: string, x: number, y: number, size: number, layer: string) {
    this.emoji = emoji;
    this.x = x;
    this.y = y;
    this.size = size;
    this.layer = layer;
  }

  get radius(): number {
    return this.size / 2;
  }

  draw(ctx: CanvasRenderingContext2D, camera: Point): void {
    if (!this.alive) return;
    paintEmoji(ctx, camera, this.emoji, this.x, this.y, this.size);
  }
}

function circlesOverlap(a: Sprite, b: Sprite): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const reach = a.radius + b.radius;
  return dx * dx + dy * dy <= reach * reach;
}
