import { Canvas, type Drawable } from './canvas.js';
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
/** Called once per overlapping pair per update. `a` was created before `b`. */
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
    onCollision(handler: CollisionHandler): () => void;
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
export declare class Engine implements EngineContract {
    readonly canvas: Canvas;
    private readonly sprites;
    private readonly collisions;
    private readonly keys;
    private audio;
    private raf;
    private running;
    private inUpdate;
    /** Use `options.canvas`, or create one. Does not build page chrome. */
    constructor(options?: EngineOptions);
    /**
     * Create a sprite and place it on a named canvas layer.
     * `size` is the font size in pixels and defaults to 32.
     * `layer` defaults to `default`.
     */
    sprite(emoji: string, x: number, y: number, size?: number, layer?: string): Sprite;
    /** Set per-frame velocity in pixels. */
    motion(sprite: Sprite, vx: number, vy: number): void;
    /**
     * Register a callback for living sprites whose circles overlap.
     * The returned function removes this registration. Calling it again does nothing.
     * Two registrations of one function are removed separately.
     */
    onCollision(handler: CollisionHandler): () => void;
    /**
     * Move living sprites by `vx`/`vy`, then report circle overlaps.
     * Pairs are chosen after the move and do not change while handlers run.
     * Throws when called from a collision handler.
     */
    update(): void;
    /** Start the `requestAnimationFrame` loop. Each frame updates, then draws. */
    start(): void;
    /** Stop the frame loop. */
    stop(): void;
    /** True while `key` (`KeyboardEvent.key`) is held. */
    isKeyDown(key: string): boolean;
    /**
     * Play a short square-wave beep.
     * `freq` is Hertz (default 440) and `duration` is milliseconds (default 120).
     * Does nothing when the Web Audio API is missing.
     */
    beep(freq?: number, duration?: number): void;
    private tick;
    private armKeys;
}
export {};
