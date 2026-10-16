import { Canvas, type Drawable, type Point } from './canvas.js';
/**
 * One cell in the terminal buffer.
 * Indexes 0–15 are the classic palette. Indexes 16–255 are the indexed
 * color cube. A direct color, when set, is what gets painted.
 */
export interface Cell {
    ch: string;
    /** Color index 0–255, or null when a direct color or the default ink is in use. */
    fg?: number | null;
    /** Color index 0–255. Null and omitted both leave the background transparent. */
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
    /** SGR bold face. Independent of `bright`, so the intensity flag alone does not change the font. */
    bold?: boolean;
    faint?: boolean;
    italic?: boolean;
    /** 1 is a single underline, 2 is the ECMA-48 double underline. */
    underline?: 1 | 2;
    /** 1 is slow blink, 2 is rapid. The glyph stays visible; the buffer has no blink clock. */
    blink?: 1 | 2;
    reverse?: boolean;
    conceal?: boolean;
    strike?: boolean;
    overline?: boolean;
    framed?: boolean;
    encircled?: boolean;
    fraktur?: boolean;
    /** Alternate font 1–9 (SGR 11–19). The grid still paints a monospace face. */
    font?: number;
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
    readReply(): string;
}
/**
 * Cell buffer that draws through a Canvas.
 * `write` and `put` follow ECMA-48 (ANSI X3.64, ISO/IEC 6429), including
 * ISO 8613-6 colors. Cells are painted in screen space, so the camera
 * does not scroll them.
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
    /** Intensity flag stored on cells written from now on. Indexes 0–7 draw as 8–15. */
    bright: boolean;
    private readonly cellWidth;
    private readonly cellHeight;
    private readonly cells;
    private readonly keys;
    private readonly keyHandlers;
    private readonly tabs;
    private readonly gset;
    private readonly replies;
    private batch;
    private dirty;
    /**
     * ECMA-48 newline mode (LNM, mode 20). The standard powers up with LNM
     * reset, so a line feed would keep the column. This buffer starts with
     * LNM set: `\n` returns to column 0, which is what `write` already did.
     * `CSI 20 l` selects the standard line feed.
     */
    private newlineMode;
    /** ECMA-48 insertion-replacement mode (IRM, mode 4). Reset means overwrite. */
    private insertMode;
    private bold;
    private faint;
    private italic;
    private underline;
    private blink;
    private reverse;
    private conceal;
    private strike;
    private overline;
    private framed;
    private encircled;
    private fraktur;
    private font;
    private fgRgb;
    private bgRgb;
    private gl;
    private singleShift;
    private lastGlyph;
    private saved;
    private audio;
    private state;
    private params;
    private intermediates;
    private privateMarker;
    private csiInvalid;
    private digits;
    private sawDigit;
    private numberCommitted;
    private fillingSub;
    private stringKind;
    /** Build a cell buffer and paint it through `options.canvas`, or a new canvas. */
    constructor(options?: TerminalOptions);
    /**
     * Write a string at the cursor.
     * Code points are stored one per cell. ECMA-48 / ANSI X3.64 sequences are
     * obeyed. `\n` and `\r` still start a new line and return to column 0
     * while newline mode is set, which is how the buffer starts.
     * The buffer wraps and scrolls.
     */
    write(text: string): void;
    /**
     * Feed one code point through the same parser as `write`, then redraw.
     * Extra code points in `ch` are ignored. `set` does not parse controls.
     */
    put(ch: string): void;
    /** Replace the cell at a column and row. Out-of-range writes are ignored. */
    set(col: number, row: number, value: Cell | string): void;
    /** Copy the cell at a column and row. Out-of-range reads are a space. */
    get(col: number, row: number): Cell;
    /** Fill the buffer with spaces and move the cursor home. The pen is kept. */
    clear(): void;
    /**
     * Set the color indexes used by later `write` and `put` calls.
     * An omitted background is left alone, including a direct-color background.
     * The foreground index replaces a direct-color foreground.
     */
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
     * Return the next device report (`CSI 5 n`, `CSI 6 n`, `CSI c`), or `''`
     * when none is waiting. Reports stay queued until read.
     */
    readReply(): string;
    /**
     * Paint the buffer in screen space. The camera is ignored so a following
     * view does not scroll the grid off the bitmap.
     */
    draw(ctx: CanvasRenderingContext2D, _camera: Point): void;
    private paintCell;
    private feed;
    private feedGround;
    private feedEscape;
    private feedCsi;
    private feedString;
    private feedStringEsc;
    private executeC0;
    private executeC1;
    private runEsc;
    private dispatchCsi;
    /** Omitted parameters and 0 mean the default 1. ECMA-48 states this for CUP, CUU, ICH, and the rest of the Pn movers. */
    private pn;
    /** Selective parameter. Omitted means 0. Zero is a real value for erase and tab clear. */
    private ps;
    private repeatCount;
    private enterCsi;
    private beginString;
    private ground;
    private commitNumber;
    private writeGraphic;
    private putGlyph;
    private translate;
    private designate;
    private lineFeed;
    private nextLine;
    private indexDown;
    private reverseIndex;
    private carriageReturn;
    private backspace;
    private moveBy;
    /** Cursor addressing stops at the edges. It does not scroll. */
    private place;
    private tab;
    private setTab;
    private clearTabs;
    private resetTabs;
    private repeat;
    private insertChars;
    private deleteChars;
    private insertLines;
    private deleteLines;
    private eraseChars;
    private eraseDisplay;
    private eraseLine;
    /** Erased cells match `clear`: a space with no colors, so the layers behind stay visible. */
    private eraseSpan;
    private scrollUp;
    private scrollDown;
    private scrollLeft;
    private scrollRight;
    private setMode;
    private selectRendition;
    private applySgr;
    /**
     * ISO/IEC 8613-6 color, carried as ECMA-48 subparameters (`:`).
     * Direct color uses a color-space slot (`38:2::r:g:b` or `38:2:0:r:g:b`).
     * A three-number form with no empty slot (`38:2:r:g:b`) is the shorthand
     * emitters send. Any other color space is left unchanged.
     */
    private applyIsoColor;
    /** Semicolon form used in the field: `38;5;n` and `38;2;r;g;b`. */
    private consumeLegacyColor;
    private setIndex;
    private setRgb;
    private clearChannel;
    private resetPen;
    private deviceAttributes;
    private deviceStatus;
    private reply;
    private saveCursor;
    private restoreCursor;
    private capture;
    private restore;
    private resetTerminal;
    private scrollIntoView;
    private ink;
    private fillBlank;
    private inRange;
    private flush;
    private bell;
    private armKeys;
}
export {};
