import { Canvas, type Drawable, type Point } from './canvas.js';
/** One cell in the terminal buffer. Colors are optional. */
export interface Cell {
    ch: string;
    /** ANSI-style color index, typically 0–15. */
    fg?: number | null;
    /** ANSI-style color index, typically 0–15. */
    bg?: number | null;
    fgRgb?: {
        r: number;
        g: number;
        b: number;
    } | null;
    bgRgb?: {
        r: number;
        g: number;
        b: number;
    } | null;
    /** When true, foreground indexes 0–7 draw as 8–15. */
    bright?: boolean;
}
/** Options for a cell-buffer terminal. */
export interface TerminalOptions {
    /** Columns in the buffer. Default 40. */
    cols?: number;
    /** Rows in the buffer. Default 12. */
    rows?: number;
    /** Surface to draw on. A new canvas is created when omitted. */
    canvas?: Canvas;
    /** Cell width in pixels. Default 16. */
    cellWidth?: number;
    /** Cell height in pixels. Default 20. */
    cellHeight?: number;
    /** Canvas layer name. Default `terminal`. */
    layer?: string;
}
/** Key handler. `key` is `KeyboardEvent.key`. */
export type KeyHandler = (key: string) => void;
interface TerminalContract {
    readonly cols: number;
    readonly rows: number;
    readonly canvas: Canvas;
    readonly cursor: {
        col: number;
        row: number;
    };
    fg: number | null;
    bg: number | null;
    bright: boolean;
    write(text: string): void;
    put(ch: string): void;
    set(col: number, row: number, value: Cell | string): void;
    get(col: number, row: number): Cell;
    clear(): void;
    color(fg: number | null, bg?: number | null): void;
    beginFrame(): void;
    endFrame(): void;
    onKey(handler: KeyHandler): void;
    isKeyDown(key: string): boolean;
}
/**
 * VT100-style cell buffer that draws through a Canvas.
 * Cells are painted in screen space, so the camera does not scroll them.
 */
export declare class Terminal implements TerminalContract, Drawable {
    readonly cols: number;
    readonly rows: number;
    readonly canvas: Canvas;
    /** Write position. Assign `col` and `row` to move it. */
    readonly cursor: {
        col: number;
        row: number;
    };
    /** Foreground color index used by `write` and `put`. */
    fg: number | null;
    /** Background color index used by `write` and `put`. Null stays transparent. */
    bg: number | null;
    /** Bright flag stored on cells written from now on. */
    bright: boolean;
    private readonly cellWidth;
    private readonly cellHeight;
    private readonly cells;
    private readonly keys;
    private readonly keyHandlers;
    private batch;
    private dirty;
    /** Build a cell buffer and paint it through `options.canvas`, or a new canvas. */
    constructor(options?: TerminalOptions);
    /** Write a string at the cursor. `\n` and `\r` are honored. The buffer scrolls. */
    write(text: string): void;
    /** Write one character at the cursor and advance. Extra code points are ignored. */
    put(ch: string): void;
    /** Replace the cell at a column and row. Out-of-range writes are ignored. */
    set(col: number, row: number, value: Cell | string): void;
    /** Copy the cell at a column and row. Out-of-range reads are a space. */
    get(col: number, row: number): Cell;
    /** Fill the buffer with spaces and move the cursor home. */
    clear(): void;
    /** Set the colors used by later `write` and `put` calls. */
    color(fg: number | null, bg?: number | null): void;
    /** Hold redraws until the matching `endFrame`. Calls may nest. */
    beginFrame(): void;
    /** Release one `beginFrame`. The last one redraws if anything changed. */
    endFrame(): void;
    /** Subscribe to keydown events. `key` matches `KeyboardEvent.key`. */
    onKey(handler: KeyHandler): void;
    /** True while `key` (`KeyboardEvent.key`) is held. */
    isKeyDown(key: string): boolean;
    /**
     * Paint the buffer in screen space. The camera is ignored so a following
     * view does not scroll the grid off the bitmap.
     */
    draw(ctx: CanvasRenderingContext2D, _camera: Point): void;
    private typeChar;
    private scrollIntoView;
    private ink;
    private fillBlank;
    private inRange;
    private flush;
    private armKeys;
}
export {};
