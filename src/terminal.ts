import { Canvas, type Drawable, type Point } from './canvas.js';

/** One cell in the terminal buffer. Colors are optional. */
export interface Cell {
  ch: string;
  /** ANSI-style color index, typically 0–15. */
  fg?: number | null;
  /** ANSI-style color index, typically 0–15. */
  bg?: number | null;
  fgRgb?: { r: number; g: number; b: number } | null;
  bgRgb?: { r: number; g: number; b: number } | null;
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
  readonly cursor: { col: number; row: number };
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

const PALETTE = [
  '#000000', '#aa0000', '#00aa00', '#aa5500',
  '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa',
  '#555555', '#ff5555', '#55ff55', '#ffff55',
  '#5555ff', '#ff55ff', '#55ffff', '#ffffff',
];

/**
 * VT100-style cell buffer that draws through a Canvas.
 * Cells are painted in screen space, so the camera does not scroll them.
 */
export class Terminal implements TerminalContract, Drawable {
  readonly cols: number;
  readonly rows: number;
  readonly canvas: Canvas;
  /** Write position. Assign `col` and `row` to move it. */
  readonly cursor = { col: 0, row: 0 };
  /** Foreground color index used by `write` and `put`. */
  fg: number | null = 15;
  /** Background color index used by `write` and `put`. Null stays transparent. */
  bg: number | null = null;
  /** Bright flag stored on cells written from now on. */
  bright = false;

  private readonly cellWidth: number;
  private readonly cellHeight: number;
  private readonly cells: Cell[][];
  private readonly keys = new Set<string>();
  private readonly keyHandlers: KeyHandler[] = [];
  private batch = 0;
  private dirty = false;

  /** Build a cell buffer and paint it through `options.canvas`, or a new canvas. */
  constructor(options: TerminalOptions = {}) {
    this.cols = options.cols ?? 40;
    this.rows = options.rows ?? 12;
    this.cellWidth = options.cellWidth ?? 16;
    this.cellHeight = options.cellHeight ?? 20;
    this.canvas = options.canvas ?? new Canvas({
      width: this.cols * this.cellWidth,
      height: this.rows * this.cellHeight,
    });
    this.cells = [];
    this.fillBlank();
    this.canvas.add(this, options.layer ?? 'terminal');
    this.armKeys();
    this.flush();
  }

  /** Write a string at the cursor. `\n` and `\r` are honored. The buffer scrolls. */
  write(text: string): void {
    this.beginFrame();
    for (const ch of text) this.typeChar(ch);
    this.endFrame();
  }

  /** Write one character at the cursor and advance. Extra code points are ignored. */
  put(ch: string): void {
    const first = Array.from(ch)[0];
    if (!first) return;
    this.typeChar(first);
    this.flush();
  }

  /** Replace the cell at a column and row. Out-of-range writes are ignored. */
  set(col: number, row: number, value: Cell | string): void {
    if (!this.inRange(col, row)) return;
    this.cells[row][col] = typeof value === 'string' ? this.ink(value) : { ...value };
    this.flush();
  }

  /** Copy the cell at a column and row. Out-of-range reads are a space. */
  get(col: number, row: number): Cell {
    if (!this.inRange(col, row)) return { ch: ' ' };
    return { ...this.cells[row][col] };
  }

  /** Fill the buffer with spaces and move the cursor home. */
  clear(): void {
    this.fillBlank();
    this.cursor.col = 0;
    this.cursor.row = 0;
    this.flush();
  }

  /** Set the colors used by later `write` and `put` calls. */
  color(fg: number | null, bg: number | null = this.bg): void {
    this.fg = fg;
    this.bg = bg;
  }

  /** Hold redraws until the matching `endFrame`. Calls may nest. */
  beginFrame(): void {
    this.batch += 1;
  }

  /** Release one `beginFrame`. The last one redraws if anything changed. */
  endFrame(): void {
    if (this.batch > 0) this.batch -= 1;
    if (this.batch === 0 && this.dirty) this.flush();
  }

  /** Subscribe to keydown events. `key` matches `KeyboardEvent.key`. */
  onKey(handler: KeyHandler): void {
    this.keyHandlers.push(handler);
  }

  /** True while `key` (`KeyboardEvent.key`) is held. */
  isKeyDown(key: string): boolean {
    return this.keys.has(key);
  }

  /**
   * Paint the buffer in screen space. The camera is ignored so a following
   * view does not scroll the grid off the bitmap.
   */
  draw(ctx: CanvasRenderingContext2D, _camera: Point): void {
    const { cellWidth: width, cellHeight: height } = this;
    ctx.save();
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        const cell = this.cells[row][col];
        const x = col * width;
        const y = row * height;
        const background = cssColor(cell, 'bg');
        if (background) {
          ctx.fillStyle = background;
          ctx.fillRect(x, y, width, height);
        }
        if (cell.ch && cell.ch !== ' ') {
          ctx.fillStyle = cssColor(cell, 'fg') ?? '#eeeeee';
          ctx.font = `${Math.floor(height * 0.8)}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(cell.ch, x + width / 2, y + height / 2);
        }
      }
    }
    const barX = this.cursor.col * width;
    const barY = (this.cursor.row + 1) * height - 2;
    ctx.fillStyle = '#9ee';
    ctx.fillRect(barX, barY, width, 2);
    ctx.restore();
  }

  private typeChar(ch: string): void {
    if (ch === '\n') {
      this.cursor.col = 0;
      this.cursor.row += 1;
      this.scrollIntoView();
      return;
    }
    if (ch === '\r') {
      this.cursor.col = 0;
      this.dirty = true;
      return;
    }
    if (this.inRange(this.cursor.col, this.cursor.row)) {
      this.cells[this.cursor.row][this.cursor.col] = this.ink(ch);
    }
    this.cursor.col += 1;
    if (this.cursor.col >= this.cols) {
      this.cursor.col = 0;
      this.cursor.row += 1;
    }
    this.scrollIntoView();
  }

  private scrollIntoView(): void {
    while (this.cursor.row >= this.rows) {
      this.cells.shift();
      this.cells.push(blankRow(this.cols));
      this.cursor.row -= 1;
    }
    if (this.cursor.row < 0) this.cursor.row = 0;
    if (this.cursor.col < 0) this.cursor.col = 0;
    if (this.cursor.col > this.cols) this.cursor.col = this.cols;
    this.dirty = true;
  }

  private ink(ch: string): Cell {
    return { ch, fg: this.fg, bg: this.bg, bright: this.bright };
  }

  private fillBlank(): void {
    this.cells.length = 0;
    for (let row = 0; row < this.rows; row += 1) {
      this.cells.push(blankRow(this.cols));
    }
  }

  private inRange(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  private flush(): void {
    if (this.batch > 0) {
      this.dirty = true;
      return;
    }
    this.dirty = false;
    this.canvas.draw();
  }

  private armKeys(): void {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    window.addEventListener('keydown', (event) => {
      this.keys.add(event.key);
      for (const handler of this.keyHandlers) handler(event.key);
    });
    window.addEventListener('keyup', (event) => {
      this.keys.delete(event.key);
    });
  }
}

function blankRow(cols: number): Cell[] {
  const row: Cell[] = [];
  for (let col = 0; col < cols; col += 1) row.push({ ch: ' ' });
  return row;
}

function cssColor(cell: Cell, channel: 'fg' | 'bg'): string | null {
  const rgb = channel === 'fg' ? cell.fgRgb : cell.bgRgb;
  if (rgb) return `rgb(${rgb.r | 0}, ${rgb.g | 0}, ${rgb.b | 0})`;
  let index = channel === 'fg' ? cell.fg : cell.bg;
  if (index == null) return null;
  if (channel === 'fg' && cell.bright && index >= 0 && index < 8) index += 8;
  return PALETTE[index] ?? null;
}
