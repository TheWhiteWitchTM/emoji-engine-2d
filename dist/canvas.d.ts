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
export declare class Canvas implements CanvasContract {
    /** The bitmap element. */
    readonly element: HTMLCanvasElement;
    /** The 2D drawing context for `element`. */
    readonly ctx: CanvasRenderingContext2D;
    /** World position shown at the top-left of the bitmap. */
    readonly camera: Point;
    private readonly layers;
    private followTarget;
    /** Create a canvas element and a 2D context. Nothing is added to the document. */
    constructor(options?: CanvasOptions);
    /** Draw one emoji centered on a world position. */
    drawEmoji(emoji: string, x: number, y: number, size: number): void;
    /**
     * Add a drawable to a named layer, creating the layer on first use.
     * Layers paint in the order they were first created, back to front.
     * An empty layer keeps its place. Adding a drawable that is already
     * on the canvas moves it.
     */
    add(drawable: Drawable, layer?: string): void;
    /** Remove a drawable from whichever layer holds it. */
    remove(drawable: Drawable): void;
    /** Clear the bitmap and paint every layer. Applies `follow` first. */
    draw(): void;
    /** Clear the bitmap. Drawables stay registered. */
    clear(): void;
    /** Place the camera so this world point sits at the top-left. */
    setCamera(x: number, y: number): void;
    /**
     * Keep `target` centered on later `draw` calls.
     * Pass null to stop following. The camera stays where it is.
     * A follow target wins over `setCamera` until following stops.
     */
    follow(target: Point | null): void;
}
/** Shared emoji paint used by the canvas helper and by sprites. */
export declare function paintEmoji(ctx: CanvasRenderingContext2D, camera: Point, emoji: string, x: number, y: number, size: number): void;
export {};
