import { Canvas, type Drawable, type Point } from './canvas.js';

/**
 * One cell in the terminal buffer.
 * Indexes 0–15 use the active palette (`ansi` by default, or `c64`).
 * Indexes 16–255 are the indexed color cube. A direct color, when set, is what gets painted.
 */
export interface Cell {
  ch: string;
  /** Color index 0–255, or null when a direct color or the default ink is in use. */
  fg?: number | null;
  /** Color index 0–255. Null and omitted both leave the background transparent. */
  bg?: number | null;
  fgRgb?: { r: number; g: number; b: number } | null;
  bgRgb?: { r: number; g: number; b: number } | null;
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

/** Indexes 0–15. `ansi` is the classic palette. `c64` is the VIC-II order. */
export type ColorStyle = 'ansi' | 'c64';

/** How the caret is drawn. `underline` is the bottom bar. */
export type CursorStyle = 'underline' | 'block' | 'bar';

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
  /** Palette for indexes 0–15. Default `ansi`. */
  colorStyle?: ColorStyle;
  /**
   * Paper behind cells that have no background of their own.
   * A number is a palette index. Default null, which stays transparent.
   */
  background?: string | number | null;
  /** Border color around the canvas. A number is a palette index. Default null. */
  border?: string | number | null;
  /** Border thickness in CSS pixels. Default 2 once a border color is set. */
  borderWidth?: number;
  /** Draw the caret. Default true. */
  showCursor?: boolean;
  /** Caret color. Default `#9ee`. */
  cursorColor?: string;
  /** Caret shape. Default `underline`. */
  cursorStyle?: CursorStyle;
  /** Milliseconds between caret blinks. 0 stays lit. Default 0. */
  cursorSpeed?: number;
  /**
   * Milliseconds for one slow-blink half cycle (SGR 5).
   * Rapid blink (SGR 6) uses half of that. 0 keeps the glyph drawn. Default 0.
   */
  blinkSpeed?: number;
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
  colorStyle(style: ColorStyle): void;
  background(color: string | number | null): void;
  border(color: string | number | null, width?: number): void;
  setCursorStyle(style: CursorStyle): void;
  cursorSpeed(ms: number): void;
  blinkSpeed(ms: number): void;
  beginFrame(): void;
  endFrame(): void;
  onKey(handler: KeyHandler): void;
  isKeyDown(key: string): boolean;
  readReply(): string;
}

type ParseState = 'ground' | 'escape' | 'esc-intermediate' | 'csi' | 'string' | 'string-esc';
type GSlot = 'G0' | 'G1' | 'G2' | 'G3';
type GlyphSet = 'ascii' | 'uk' | 'dec';
type StringKind = 'osc' | 'dcs' | 'sos';

interface CsiParam {
  value: number | null;
  sub: (number | null)[];
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface CursorMark {
  col: number;
  row: number;
  fg: number | null;
  bg: number | null;
  bright: boolean;
  bold: boolean;
  fgRgb: Rgb | null;
  bgRgb: Rgb | null;
  faint: boolean;
  italic: boolean;
  underline: 0 | 1 | 2;
  blink: 0 | 1 | 2;
  reverse: boolean;
  conceal: boolean;
  strike: boolean;
  overline: boolean;
  framed: boolean;
  encircled: boolean;
  fraktur: boolean;
  font: number;
  gl: GSlot;
  single: GSlot | null;
  gset: Record<GSlot, GlyphSet>;
}

/** Classic ANSI colors. Index 3 is brown. Index 7 is gray, not white. */
const ANSI = [
  '#000000', '#aa0000', '#00aa00', '#aa5500',
  '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa',
  '#555555', '#ff5555', '#55ff55', '#ffff55',
  '#5555ff', '#ff55ff', '#55ffff', '#ffffff',
];

/**
 * VIC-II colors in register order, the bright set people mean by a C64 screen.
 * Index 6 is blue and index 7 is yellow. White is 1, not 15.
 */
const C64 = [
  '#000000', '#ffffff', '#880000', '#aaffee',
  '#cc44cc', '#00cc55', '#0000aa', '#eeee77',
  '#dd8855', '#664400', '#ff7777', '#333333',
  '#777777', '#aaff66', '#0088ff', '#bbbbbb',
];

/**
 * VT100 special graphics, the character-cell line drawing set.
 * Invoked with `ESC ( 0` (G0) or `ESC ) 0` (G1) and Shift Out / Shift In.
 */
const DEC_SPECIAL: Readonly<Record<number, string>> = {
  0x5f: ' ',
  0x60: '◆',
  0x61: '▒',
  0x62: '␉',
  0x63: '␌',
  0x64: '␍',
  0x65: '␊',
  0x66: '°',
  0x67: '±',
  0x68: '␤',
  0x69: '␋',
  0x6a: '┘',
  0x6b: '┐',
  0x6c: '┌',
  0x6d: '└',
  0x6e: '┼',
  0x6f: '⎺',
  0x70: '⎻',
  0x71: '─',
  0x72: '⎼',
  0x73: '⎽',
  0x74: '├',
  0x75: '┤',
  0x76: '┴',
  0x77: '┬',
  0x78: '│',
  0x79: '≤',
  0x7a: '≥',
  0x7b: 'π',
  0x7c: '≠',
  0x7d: '£',
  0x7e: '·',
};

/**
 * Cell buffer that draws through a Canvas.
 * `write` and `put` follow ECMA-48 (ANSI X3.64, ISO/IEC 6429), including
 * ISO 8613-6 colors. Cells are painted in screen space, so the camera
 * does not scroll them.
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
  /** Intensity flag stored on cells written from now on. Indexes 0–7 draw as 8–15 on `ansi`. */
  bright = false;
  /**
   * Palette for indexes 0–15. `ansi` keeps the classic colors, including gray at 7.
   * Assigning this retints on the next draw. `colorStyle` also redraws and updates a border index.
   */
  palette: ColorStyle = 'ansi';
  /**
   * Paper behind cells with no background. A number is a palette index.
   * Null leaves those cells transparent. `background` applies it and redraws.
   */
  screenColor: string | number | null = null;
  /** Border color around the canvas. A number is a palette index. Null draws no border. */
  borderColor: string | number | null = null;
  /** Border thickness in CSS pixels. */
  borderWidth = 0;
  /** When false, the caret is not drawn. Games toggle this. Default true. */
  cursorLit = true;
  /** Caret color. Default `#9ee`. Games assign this. */
  cursorColor = '#9ee';
  /** Caret shape. `underline` is the bottom bar and the default. */
  cursorStyle: CursorStyle = 'underline';

  private readonly cellWidth: number;
  private readonly cellHeight: number;
  private readonly cells: Cell[][];
  private readonly keys = new Set<string>();
  private readonly keyHandlers: KeyHandler[] = [];
  private readonly tabs = new Set<number>();
  private readonly gset: Record<GSlot, GlyphSet> = {
    G0: 'ascii',
    G1: 'ascii',
    G2: 'ascii',
    G3: 'ascii',
  };
  private readonly replies: string[] = [];
  private batch = 0;
  private dirty = false;
  /**
   * ECMA-48 newline mode (LNM, mode 20). The standard powers up with LNM
   * reset, so a line feed would keep the column. This buffer starts with
   * LNM set: `\n` returns to column 0, which is what `write` already did.
   * `CSI 20 l` selects the standard line feed.
   */
  private newlineMode = true;
  /** ECMA-48 insertion-replacement mode (IRM, mode 4). Reset means overwrite. */
  private insertMode = false;
  private bold = false;
  private faint = false;
  private italic = false;
  private underline: 0 | 1 | 2 = 0;
  private blink: 0 | 1 | 2 = 0;
  private reverse = false;
  private conceal = false;
  private strike = false;
  private overline = false;
  private framed = false;
  private encircled = false;
  private fraktur = false;
  private font = 0;
  private fgRgb: Rgb | null = null;
  private bgRgb: Rgb | null = null;
  private gl: GSlot = 'G0';
  private singleShift: GSlot | null = null;
  private lastGlyph: string | null = null;
  private saved: CursorMark;
  private audio: AudioContext | null = null;
  private state: ParseState = 'ground';
  private params: CsiParam[] = [];
  private intermediates = '';
  private privateMarker = '';
  private csiInvalid = false;
  private digits = '';
  private sawDigit = false;
  private numberCommitted = false;
  private fillingSub = false;
  private stringKind: StringKind = 'osc';
  private cursorMs = 0;
  private blinkMs = 0;
  private cursorEpoch = 0;
  private blinkEpoch = 0;
  private cursorTimer: ReturnType<typeof setInterval> | null = null;
  private blinkTimer: ReturnType<typeof setInterval> | null = null;
  /** Last border written by this terminal, so a game's own CSS border is left alone. */
  private lastBorder = '';

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
    this.resetTabs();
    this.saved = this.capture();
    this.canvas.add(this, options.layer ?? 'terminal');
    this.armKeys();
    this.applyOptions(options);
    this.flush();
  }

  /**
   * Write a string at the cursor.
   * Code points are stored one per cell. ECMA-48 / ANSI X3.64 sequences are
   * obeyed. `\n` and `\r` still start a new line and return to column 0
   * while newline mode is set, which is how the buffer starts.
   * The buffer wraps and scrolls.
   */
  write(text: string): void {
    this.beginFrame();
    for (const ch of text) this.feed(ch);
    this.endFrame();
  }

  /**
   * Feed one code point through the same parser as `write`, then redraw.
   * Extra code points in `ch` are ignored. `set` does not parse controls.
   */
  put(ch: string): void {
    const first = Array.from(ch)[0];
    if (!first) return;
    this.feed(first);
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

  /** Fill the buffer with spaces and move the cursor home. The pen is kept. */
  clear(): void {
    this.fillBlank();
    this.cursor.col = 0;
    this.cursor.row = 0;
    this.flush();
  }

  /**
   * Set the color indexes used by later `write` and `put` calls.
   * An omitted background is left alone, including a direct-color background.
   * The foreground index replaces a direct-color foreground.
   */
  color(fg: number | null, bg?: number | null): void {
    this.fg = fg;
    this.fgRgb = null;
    if (bg === undefined) return;
    this.bg = bg;
    this.bgRgb = null;
  }

  /**
   * Select the palette used for indexes 0–15.
   * `ansi` is the classic set (7 is gray). `c64` is VIC-II order (7 is yellow, 6 is blue).
   * Indexes 16–255 stay the 256-color cube. An unknown name is ignored.
   * The pen, stored cells, paper, and border index are retinted. `ESC c` does not change this.
   */
  colorStyle(style: ColorStyle): void {
    if (style !== 'ansi' && style !== 'c64') return;
    if (style === this.palette) return;
    this.palette = style;
    this.syncBorder();
    this.flush();
  }

  /**
   * Fill the grid behind cells that have no background of their own.
   * A number is a palette index. Null, or a blank string, leaves those cells transparent
   * so the layers behind the terminal stay visible. This is not the pen background:
   * `color`, erase, and `clear` do not change it.
   */
  background(color: string | number | null): void {
    const next = normalizeColor(this.activeStyle(), color);
    if (typeof color === 'number' && next == null) return;
    this.screenColor = next;
    this.flush();
  }

  /**
   * Draw a solid border around the canvas. A number is a palette index.
   * Null clears the border this method set. The width is CSS pixels and defaults
   * to 2 when a color is set and the current width is 0. A later call that omits
   * the width keeps it. A border set on the element by the game is left alone
   * until this method is used.
   */
  border(color: string | number | null, width?: number): void {
    const next = normalizeColor(this.activeStyle(), color);
    if (typeof color === 'number' && next == null) return;
    this.borderColor = next;
    if (width !== undefined && Number.isFinite(width)) {
      this.borderWidth = Math.max(0, Math.floor(width));
    } else if (next == null) {
      this.borderWidth = 0;
    } else if (this.borderWidth <= 0) {
      this.borderWidth = 2;
    }
    this.syncBorder();
  }

  /** Caret shape. `underline` is the bottom bar, `bar` is a vertical beam, `block` fills the cell. */
  setCursorStyle(style: CursorStyle): void {
    if (style !== 'underline' && style !== 'block' && style !== 'bar') return;
    this.cursorStyle = style;
    this.flush();
  }

  /**
   * Blink the caret. `ms` is the time it stays lit and the time it stays dark.
   * 0, or anything that is not a positive number, leaves it steady.
   * `cursorLit === false` hides it either way.
   */
  cursorSpeed(ms: number): void {
    this.setSpeed('cursor', ms);
  }

  /**
   * Blink cells marked with SGR 5. `ms` is one half cycle.
   * SGR 6 uses half of that. 0 keeps every blinking glyph drawn, which is the default.
   */
  blinkSpeed(ms: number): void {
    this.setSpeed('blink', ms);
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
   * Return the next device report (`CSI 5 n`, `CSI 6 n`, `CSI c`), or `''`
   * when none is waiting. Reports stay queued until read.
   */
  readReply(): string {
    return this.replies.shift() ?? '';
  }

  /**
   * Paint the buffer in screen space. The camera is ignored so a following
   * view does not scroll the grid off the bitmap.
   */
  draw(ctx: CanvasRenderingContext2D, _camera: Point): void {
    const { cellWidth: width, cellHeight: height } = this;
    const size = Math.floor(height * 0.8);
    const style = this.activeStyle();
    ctx.save();
    ctx.globalAlpha = 1;
    const paper = resolveColor(style, this.screenColor);
    if (paper && this.cols > 0 && this.rows > 0) {
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, this.cols * width, this.rows * height);
    }
    for (let row = 0; row < this.rows; row += 1) {
      for (let col = 0; col < this.cols; col += 1) {
        this.paintCell(ctx, this.cells[row][col], col * width, row * height, width, height, size, style);
      }
    }
    this.paintCursor(ctx, width, height);
    ctx.restore();
    this.syncBorder();
  }

  private paintCell(
    ctx: CanvasRenderingContext2D,
    cell: Cell,
    x: number,
    y: number,
    width: number,
    height: number,
    size: number,
    style: ColorStyle,
  ): void {
    let fg = cssColor(cell, 'fg', style) ?? paletteColor(style, 15) ?? '#ffffff';
    let bg = cssColor(cell, 'bg', style);
    if (cell.reverse) {
      const ink = bg ?? '#000000';
      bg = fg;
      fg = ink;
    }
    ctx.globalAlpha = 1;
    if (bg) {
      ctx.fillStyle = bg;
      ctx.fillRect(x, y, width, height);
    }
    const hidden = cell.conceal === true || this.blinkHidden(cell);
    const glyph = !hidden && !!cell.ch && cell.ch !== ' ';
    const underline = hidden ? 0 : (cell.underline ?? 0);
    const strike = !hidden && cell.strike === true;
    const overline = !hidden && cell.overline === true;
    const framed = !hidden && cell.framed === true;
    const encircled = !hidden && cell.encircled === true;
    if (!glyph && underline === 0 && !strike && !overline && !framed && !encircled) return;
    ctx.globalAlpha = cell.faint ? 0.6 : 1;
    ctx.fillStyle = fg;
    if (glyph) {
      ctx.font = faceFor(cell, size);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cell.ch, x + width / 2, y + height / 2);
    }
    if (underline === 1) ctx.fillRect(x, y + height - 2, width, 1);
    else if (underline === 2) {
      ctx.fillRect(x, y + Math.max(0, height - 4), width, 1);
      ctx.fillRect(x, y + height - 2, width, 1);
    }
    if (strike) ctx.fillRect(x, y + Math.floor(height / 2), width, 1);
    if (overline) ctx.fillRect(x, y, width, 1);
    if (encircled && canEllipse(ctx)) paintEllipse(ctx, x, y, width, height);
    else if (framed || encircled) paintFrame(ctx, x, y, width, height);
    ctx.globalAlpha = 1;
  }

  private feed(ch: string): void {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x00 || code === 0x7f) return;
    if (code === 0x18 || code === 0x1a) {
      this.ground();
      return;
    }
    if (code === 0x1b) {
      if (this.state === 'string') {
        this.state = 'string-esc';
        return;
      }
      this.ground();
      this.state = 'escape';
      return;
    }
    switch (this.state) {
      case 'ground':
        this.feedGround(ch, code);
        return;
      case 'escape':
      case 'esc-intermediate':
        this.feedEscape(ch, code);
        return;
      case 'csi':
        this.feedCsi(ch, code);
        return;
      case 'string':
        this.feedString(code);
        return;
      case 'string-esc':
        this.feedStringEsc(ch);
        return;
      default:
        this.ground();
    }
  }

  private feedGround(ch: string, code: number): void {
    if (code < 0x20) {
      this.executeC0(code);
      return;
    }
    if (code >= 0x80 && code <= 0x9f) {
      this.executeC1(code);
      return;
    }
    this.writeGraphic(ch);
  }

  private feedEscape(ch: string, code: number): void {
    if (code < 0x20) {
      this.executeC0(code);
      return;
    }
    if (code >= 0x80 && code <= 0x9f) {
      this.ground();
      this.executeC1(code);
      return;
    }
    if (code >= 0x20 && code <= 0x2f) {
      if (this.state === 'escape') this.intermediates = '';
      this.state = 'esc-intermediate';
      if (this.intermediates.length < 2) this.intermediates += ch;
      return;
    }
    if (code >= 0x30 && code <= 0x7e) {
      const intermediate = this.state === 'esc-intermediate' ? this.intermediates : '';
      this.runEsc(ch, intermediate);
      return;
    }
    this.ground();
    this.writeGraphic(ch);
  }

  private feedCsi(ch: string, code: number): void {
    if (code < 0x20) {
      this.executeC0(code);
      return;
    }
    if (code >= 0x80 && code <= 0x9f) {
      this.ground();
      this.executeC1(code);
      return;
    }
    if (code > 0x7e) {
      this.ground();
      this.writeGraphic(ch);
      return;
    }
    if (ch === ';' || ch === ':') {
      this.commitNumber();
      if (ch === ';') {
        if (this.params.length < 32) this.params.push({ value: null, sub: [] });
        this.fillingSub = false;
      } else {
        this.fillingSub = true;
      }
      this.numberCommitted = false;
      return;
    }
    if (ch >= '0' && ch <= '9') {
      if (this.intermediates.length > 0 || this.numberCommitted) {
        this.csiInvalid = true;
        return;
      }
      this.sawDigit = true;
      if (this.digits.length < 6) this.digits += ch;
      return;
    }
    if (ch === '<' || ch === '=' || ch === '>' || ch === '?') {
      const fresh = !this.sawDigit && !this.numberCommitted && !this.fillingSub
        && this.params.length === 1 && this.privateMarker === '' && this.intermediates === '';
      if (fresh) this.privateMarker = ch;
      else this.csiInvalid = true;
      return;
    }
    if (code >= 0x20 && code <= 0x2f) {
      this.commitNumber();
      if (this.intermediates.length < 2) this.intermediates += ch;
      else this.csiInvalid = true;
      return;
    }
    if (code >= 0x40 && code <= 0x7e) {
      this.commitNumber();
      this.dispatchCsi(ch);
      this.ground();
    }
  }

  private feedString(code: number): void {
    if (code === 0x9c || (code === 0x07 && this.stringKind === 'osc')) {
      this.ground();
      return;
    }
    // String contents are not interpreted. OSC must not retint the palette or the page.
  }

  private feedStringEsc(ch: string): void {
    if (ch === '\\') {
      this.ground();
      return;
    }
    this.ground();
    this.state = 'escape';
    this.feed(ch);
  }

  private executeC0(code: number): void {
    switch (code) {
      case 0x07:
        this.bell();
        return;
      case 0x08:
        this.backspace();
        return;
      case 0x09:
        this.tab(1, 1);
        return;
      case 0x0a:
      case 0x0b:
      case 0x0c:
        this.lineFeed();
        return;
      case 0x0d:
        this.carriageReturn();
        return;
      case 0x0e:
        this.gl = 'G1';
        return;
      case 0x0f:
        this.gl = 'G0';
        return;
      default:
        return;
    }
  }

  private executeC1(code: number): void {
    switch (code) {
      case 0x84:
        this.indexDown();
        return;
      case 0x85:
        this.nextLine();
        return;
      case 0x88:
        this.setTab();
        return;
      case 0x8d:
        this.reverseIndex();
        return;
      case 0x8e:
        this.singleShift = 'G2';
        return;
      case 0x8f:
        this.singleShift = 'G3';
        return;
      case 0x90:
        this.beginString('dcs');
        return;
      case 0x98:
      case 0x9e:
      case 0x9f:
        this.beginString('sos');
        return;
      case 0x9b:
        this.enterCsi();
        return;
      case 0x9d:
        this.beginString('osc');
        return;
      default:
        return;
    }
  }

  private runEsc(final: string, intermediate: string): void {
    this.ground();
    if (
      intermediate === '(' || intermediate === ')' || intermediate === '*' || intermediate === '+'
      || intermediate === '-' || intermediate === '.' || intermediate === '/'
    ) {
      this.designate(intermediate, final);
      return;
    }
    if (intermediate !== '') return;
    switch (final) {
      case '[':
        this.enterCsi();
        return;
      case ']':
        this.beginString('osc');
        return;
      case 'P':
        this.beginString('dcs');
        return;
      case 'X':
      case '^':
      case '_':
        this.beginString('sos');
        return;
      case '\\':
        return;
      case 'D':
        this.indexDown();
        return;
      case 'E':
        this.nextLine();
        return;
      case 'H':
        this.setTab();
        return;
      case 'M':
        this.reverseIndex();
        return;
      case 'c':
        this.resetTerminal();
        return;
      case '7':
        this.saveCursor();
        return;
      case '8':
        this.restoreCursor();
        return;
      case 'N':
        this.singleShift = 'G2';
        return;
      case 'O':
        this.singleShift = 'G3';
        return;
      case 'n':
        this.gl = 'G2';
        return;
      case 'o':
        this.gl = 'G3';
        return;
      default:
        return;
    }
  }

  private dispatchCsi(final: string): void {
    if (this.csiInvalid || this.privateMarker) return;
    if (this.intermediates === ' ') {
      if (final === '@') this.scrollLeft(this.pn(0));
      else if (final === 'A') this.scrollRight(this.pn(0));
      return;
    }
    if (this.intermediates !== '') return;
    switch (final) {
      case '@':
        this.insertChars(this.pn(0));
        return;
      case 'A':
        this.moveBy(0, -this.pn(0));
        return;
      case 'B':
        this.moveBy(0, this.pn(0));
        return;
      case 'C':
        this.moveBy(this.pn(0), 0);
        return;
      case 'D':
        this.moveBy(-this.pn(0), 0);
        return;
      case 'E':
        this.place(0, this.cursor.row + this.pn(0));
        return;
      case 'F':
        this.place(0, this.cursor.row - this.pn(0));
        return;
      case 'G':
        this.place(this.pn(0) - 1, this.cursor.row);
        return;
      case 'H':
        this.place(this.pn(1) - 1, this.pn(0) - 1);
        return;
      case 'I':
        this.tab(1, this.pn(0));
        return;
      case 'J':
        this.eraseDisplay(this.ps(0));
        return;
      case 'K':
        this.eraseLine(this.ps(0));
        return;
      case 'L':
        this.insertLines(this.pn(0));
        return;
      case 'M':
        this.deleteLines(this.pn(0));
        return;
      case 'P':
        this.deleteChars(this.pn(0));
        return;
      case 'S':
        this.scrollUp(this.pn(0));
        return;
      case 'T':
        this.scrollDown(this.pn(0));
        return;
      case 'X':
        this.eraseChars(this.pn(0));
        return;
      case 'Z':
        this.tab(-1, this.pn(0));
        return;
      case '`':
        this.place(this.pn(0) - 1, this.cursor.row);
        return;
      case 'a':
        this.moveBy(this.pn(0), 0);
        return;
      case 'b':
        this.repeat(this.repeatCount());
        return;
      case 'c':
        this.deviceAttributes();
        return;
      case 'd':
        this.place(this.cursor.col, this.pn(0) - 1);
        return;
      case 'e':
        this.moveBy(0, this.pn(0));
        return;
      case 'f':
        this.place(this.pn(1) - 1, this.pn(0) - 1);
        return;
      case 'g':
        this.clearTabs(this.ps(0));
        return;
      case 'h':
        this.setMode(true);
        return;
      case 'l':
        this.setMode(false);
        return;
      case 'm':
        this.selectRendition();
        return;
      case 'n':
        this.deviceStatus();
        return;
      case 's':
        this.saveCursor();
        return;
      case 'u':
        this.restoreCursor();
        return;
      default:
        return;
    }
  }

  /** Omitted parameters and 0 mean the default 1. ECMA-48 states this for CUP, CUU, ICH, and the rest of the Pn movers. */
  private pn(index: number): number {
    const value = this.params[index]?.value;
    if (value == null || value < 1) return 1;
    return value;
  }

  /** Selective parameter. Omitted means 0. Zero is a real value for erase and tab clear. */
  private ps(index: number): number {
    const value = this.params[index]?.value;
    if (value == null || value < 0) return 0;
    return value;
  }

  private repeatCount(): number {
    const value = this.params[0]?.value;
    if (value == null) return 1;
    if (value < 1) return 0;
    return Math.min(value, 10000);
  }

  private enterCsi(): void {
    this.state = 'csi';
    this.params = [{ value: null, sub: [] }];
    this.intermediates = '';
    this.privateMarker = '';
    this.csiInvalid = false;
    this.digits = '';
    this.sawDigit = false;
    this.numberCommitted = false;
    this.fillingSub = false;
  }

  private beginString(kind: StringKind): void {
    this.stringKind = kind;
    this.state = 'string';
  }

  private ground(): void {
    this.state = 'ground';
    this.params = [];
    this.intermediates = '';
    this.privateMarker = '';
    this.csiInvalid = false;
    this.digits = '';
    this.sawDigit = false;
    this.numberCommitted = false;
    this.fillingSub = false;
  }

  private commitNumber(): void {
    if (this.numberCommitted) return;
    const current = this.params[this.params.length - 1];
    const value = this.sawDigit ? Number(this.digits) : null;
    if (current) {
      if (this.fillingSub) {
        if (current.sub.length < 8) current.sub.push(value);
      } else {
        current.value = value;
      }
    }
    this.digits = '';
    this.sawDigit = false;
    this.numberCommitted = true;
  }

  private writeGraphic(ch: string): void {
    this.putGlyph(this.translate(ch));
  }

  private putGlyph(glyph: string): void {
    this.lastGlyph = glyph;
    if (this.insertMode && this.inRange(this.cursor.col, this.cursor.row)) {
      const line = this.cells[this.cursor.row];
      for (let col = this.cols - 1; col > this.cursor.col; col -= 1) line[col] = line[col - 1];
    }
    if (this.inRange(this.cursor.col, this.cursor.row)) {
      this.cells[this.cursor.row][this.cursor.col] = this.ink(glyph);
    }
    this.cursor.col += 1;
    if (this.cursor.col >= this.cols) {
      this.cursor.col = 0;
      this.cursor.row += 1;
    }
    this.scrollIntoView();
  }

  private translate(ch: string): string {
    const slot = this.singleShift ?? this.gl;
    this.singleShift = null;
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code > 0x7e) return ch;
    const set = this.gset[slot];
    if (set === 'dec') return DEC_SPECIAL[code] ?? ch;
    if (set === 'uk' && code === 0x23) return '£';
    return ch;
  }

  private designate(intermediate: string, final: string): void {
    const slot: GSlot | null = intermediate === '(' ? 'G0'
      : intermediate === ')' || intermediate === '-' ? 'G1'
      : intermediate === '*' || intermediate === '.' ? 'G2'
      : intermediate === '+' || intermediate === '/' ? 'G3'
      : null;
    if (!slot) return;
    this.gset[slot] = final === '0' ? 'dec' : final === 'A' ? 'uk' : 'ascii';
  }

  private lineFeed(): void {
    if (this.newlineMode) this.cursor.col = 0;
    this.indexDown();
  }

  private nextLine(): void {
    this.cursor.col = 0;
    this.indexDown();
  }

  private indexDown(): void {
    this.cursor.row += 1;
    this.scrollIntoView();
  }

  private reverseIndex(): void {
    if (this.cursor.row > 0) {
      this.cursor.row -= 1;
      this.dirty = true;
      return;
    }
    this.cursor.row = 0;
    this.scrollDown(1);
  }

  private carriageReturn(): void {
    this.cursor.col = 0;
    this.dirty = true;
  }

  private backspace(): void {
    if (this.cursor.col >= this.cols) this.cursor.col = Math.max(0, this.cols - 1);
    else if (this.cursor.col > 0) this.cursor.col -= 1;
    this.dirty = true;
  }

  private moveBy(colDelta: number, rowDelta: number): void {
    this.place(this.cursor.col + colDelta, this.cursor.row + rowDelta);
  }

  /** Cursor addressing stops at the edges. It does not scroll. */
  private place(col: number, row: number): void {
    this.cursor.col = clamp(col, 0, Math.max(0, this.cols - 1));
    this.cursor.row = clamp(row, 0, Math.max(0, this.rows - 1));
    this.dirty = true;
  }

  private tab(direction: 1 | -1, count: number): void {
    const steps = Math.min(count, Math.max(1, this.cols));
    for (let i = 0; i < steps; i += 1) {
      if (direction > 0) {
        if (this.cursor.col >= this.cols - 1) {
          this.cursor.col = Math.max(0, this.cols - 1);
          break;
        }
        let next = this.cols - 1;
        for (const stop of this.tabs) {
          if (stop > this.cursor.col && stop < next) next = stop;
        }
        this.cursor.col = next;
      } else if (this.cursor.col <= 0) {
        this.cursor.col = 0;
        break;
      } else {
        let prev = 0;
        for (const stop of this.tabs) {
          if (stop < this.cursor.col && stop > prev) prev = stop;
        }
        this.cursor.col = prev;
      }
    }
    this.dirty = true;
  }

  private setTab(): void {
    if (this.cursor.col >= 0 && this.cursor.col < this.cols) this.tabs.add(this.cursor.col);
  }

  private clearTabs(mode: number): void {
    if (mode === 0) this.tabs.delete(this.cursor.col);
    else if (mode === 2 || mode === 3 || mode === 5) this.tabs.clear();
  }

  private resetTabs(): void {
    this.tabs.clear();
    for (let col = 8; col < this.cols; col += 8) this.tabs.add(col);
  }

  private repeat(count: number): void {
    if (!this.lastGlyph || count < 1) return;
    const times = Math.min(count, 10000);
    const glyph = this.lastGlyph;
    for (let i = 0; i < times; i += 1) this.putGlyph(glyph);
  }

  private insertChars(count: number): void {
    const { col, row } = this.cursor;
    if (!this.inRange(col, row) || count < 1) return;
    const lines = Math.min(count, this.cols - col);
    const line = this.cells[row];
    line.splice(col, 0, ...blanks(lines));
    line.length = this.cols;
    this.dirty = true;
  }

  private deleteChars(count: number): void {
    const { col, row } = this.cursor;
    if (!this.inRange(col, row) || count < 1) return;
    const lines = Math.min(count, this.cols - col);
    const line = this.cells[row];
    line.splice(col, lines);
    for (let i = 0; i < lines; i += 1) line.push({ ch: ' ' });
    this.dirty = true;
  }

  private insertLines(count: number): void {
    const row = this.cursor.row;
    if (row < 0 || row >= this.rows || count < 1) return;
    const lines = Math.min(count, this.rows - row);
    this.cells.splice(row, 0, ...Array.from({ length: lines }, () => blankRow(this.cols)));
    this.cells.length = this.rows;
    this.dirty = true;
  }

  private deleteLines(count: number): void {
    const row = this.cursor.row;
    if (row < 0 || row >= this.rows || count < 1) return;
    const lines = Math.min(count, this.rows - row);
    this.cells.splice(row, lines);
    for (let i = 0; i < lines; i += 1) this.cells.push(blankRow(this.cols));
    this.dirty = true;
  }

  private eraseChars(count: number): void {
    if (count < 1 || this.cursor.row < 0 || this.cursor.row >= this.rows) return;
    this.eraseSpan(this.cursor.row, this.cursor.col, this.cursor.col + count - 1);
    this.dirty = true;
  }

  private eraseDisplay(mode: number): void {
    if (mode === 2) {
      this.fillBlank();
      this.dirty = true;
      return;
    }
    if (mode !== 0 && mode !== 1) return;
    const row = this.cursor.row;
    if (row < 0 || row >= this.rows) return;
    if (mode === 0) {
      this.eraseSpan(row, this.cursor.col, this.cols - 1);
      for (let y = row + 1; y < this.rows; y += 1) this.cells[y] = blankRow(this.cols);
    } else {
      for (let y = 0; y < row; y += 1) this.cells[y] = blankRow(this.cols);
      this.eraseSpan(row, 0, this.cursor.col);
    }
    this.dirty = true;
  }

  private eraseLine(mode: number): void {
    const row = this.cursor.row;
    if (row < 0 || row >= this.rows) return;
    if (mode === 2) this.cells[row] = blankRow(this.cols);
    else if (mode === 0) this.eraseSpan(row, this.cursor.col, this.cols - 1);
    else if (mode === 1) this.eraseSpan(row, 0, this.cursor.col);
    else return;
    this.dirty = true;
  }

  /** Erased cells match `clear`: a space with no colors, so the layers behind stay visible. */
  private eraseSpan(row: number, from: number, to: number): void {
    const start = Math.max(0, from);
    const end = Math.min(this.cols - 1, to);
    if (start > end) return;
    const line = this.cells[row];
    for (let col = start; col <= end; col += 1) line[col] = { ch: ' ' };
  }

  private scrollUp(count: number): void {
    const lines = Math.min(Math.max(0, count), this.rows);
    for (let i = 0; i < lines; i += 1) {
      this.cells.shift();
      this.cells.push(blankRow(this.cols));
    }
    this.dirty = true;
  }

  private scrollDown(count: number): void {
    const lines = Math.min(Math.max(0, count), this.rows);
    for (let i = 0; i < lines; i += 1) {
      this.cells.pop();
      this.cells.unshift(blankRow(this.cols));
    }
    this.dirty = true;
  }

  private scrollLeft(count: number): void {
    const n = Math.min(Math.max(0, count), this.cols);
    if (n === 0) return;
    for (const line of this.cells) {
      line.splice(0, n);
      for (let i = 0; i < n; i += 1) line.push({ ch: ' ' });
    }
    this.dirty = true;
  }

  private scrollRight(count: number): void {
    const n = Math.min(Math.max(0, count), this.cols);
    if (n === 0) return;
    for (const line of this.cells) {
      line.splice(0, 0, ...blanks(n));
      line.length = this.cols;
    }
    this.dirty = true;
  }

  private setMode(on: boolean): void {
    for (const param of this.params) {
      if (param.value === 4) this.insertMode = on;
      else if (param.value === 20) this.newlineMode = on;
    }
  }

  private selectRendition(): void {
    if (this.params.length === 0) {
      this.resetPen();
      return;
    }
    let index = 0;
    while (index < this.params.length) {
      const param = this.params[index];
      const code = param.value ?? 0;
      if (code === 38 || code === 48) {
        const channel = code === 38 ? 'fg' : 'bg';
        if (param.sub.length > 0) {
          this.applyIsoColor(channel, param.sub);
          index += 1;
        } else {
          index += this.consumeLegacyColor(channel, index);
        }
        continue;
      }
      this.applySgr(code);
      index += 1;
    }
  }

  private applySgr(code: number): void {
    if (code === 0) {
      this.resetPen();
      return;
    }
    if (code >= 10 && code <= 19) {
      this.font = code - 10;
      return;
    }
    if (code >= 30 && code <= 37) {
      this.setIndex('fg', code - 30);
      return;
    }
    if (code >= 40 && code <= 47) {
      this.setIndex('bg', code - 40);
      return;
    }
    if (code >= 90 && code <= 97) {
      this.setIndex('fg', code - 82);
      return;
    }
    if (code >= 100 && code <= 107) {
      this.setIndex('bg', code - 92);
      return;
    }
    switch (code) {
      case 1:
        this.bold = true;
        this.bright = true;
        return;
      case 2:
        this.faint = true;
        return;
      case 3:
        this.italic = true;
        return;
      case 4:
        this.underline = 1;
        return;
      case 5:
        this.blink = 1;
        return;
      case 6:
        this.blink = 2;
        return;
      case 7:
        this.reverse = true;
        return;
      case 8:
        this.conceal = true;
        return;
      case 9:
        this.strike = true;
        return;
      case 20:
        this.fraktur = true;
        return;
      case 21:
        // ECMA-48: doubly underlined. Not "bold off".
        this.underline = 2;
        return;
      case 22:
        this.bold = false;
        this.bright = false;
        this.faint = false;
        return;
      case 23:
        this.italic = false;
        this.fraktur = false;
        return;
      case 24:
        this.underline = 0;
        return;
      case 25:
        this.blink = 0;
        return;
      case 27:
        this.reverse = false;
        return;
      case 28:
        this.conceal = false;
        return;
      case 29:
        this.strike = false;
        return;
      case 39:
        this.fg = 15;
        this.fgRgb = null;
        return;
      case 49:
        this.bg = null;
        this.bgRgb = null;
        return;
      case 51:
        this.framed = true;
        return;
      case 52:
        this.encircled = true;
        return;
      case 53:
        this.overline = true;
        return;
      case 54:
        this.framed = false;
        this.encircled = false;
        return;
      case 55:
        this.overline = false;
        return;
      default:
        return;
    }
  }

  /**
   * ISO/IEC 8613-6 color, carried as ECMA-48 subparameters (`:`).
   * Direct color uses a color-space slot (`38:2::r:g:b` or `38:2:0:r:g:b`).
   * A three-number form with no empty slot (`38:2:r:g:b`) is the shorthand
   * emitters send. Any other color space is left unchanged.
   */
  private applyIsoColor(channel: 'fg' | 'bg', sub: (number | null)[]): void {
    const mode = sub[0];
    if (mode === 1) {
      this.clearChannel(channel);
      return;
    }
    if (mode === 5) {
      const index = sub[1];
      if (index != null && index >= 0 && index <= 255) this.setIndex(channel, index);
      return;
    }
    if (mode === 2 || mode === 3 || mode === 4) {
      const parts = directComponents(mode, sub.slice(1));
      if (!parts) return;
      this.setRgb(channel, parts.r, parts.g, parts.b);
    }
  }

  /** Semicolon form used in the field: `38;5;n` and `38;2;r;g;b`. */
  private consumeLegacyColor(channel: 'fg' | 'bg', index: number): number {
    const mode = this.params[index + 1];
    if (!mode) return 1;
    if (mode.value === 1) {
      this.clearChannel(channel);
      return 2;
    }
    if (mode.value === 5) {
      const color = this.params[index + 2];
      if (color?.value != null && color.value >= 0 && color.value <= 255) {
        this.setIndex(channel, color.value);
      }
      return color ? 3 : 2;
    }
    if (mode.value === 2) {
      const red = this.params[index + 2];
      const green = this.params[index + 3];
      const blue = this.params[index + 4];
      if (red?.value != null && green?.value != null && blue?.value != null) {
        this.setRgb(channel, red.value, green.value, blue.value);
      }
      return 2 + [red, green, blue].filter((item) => item != null).length;
    }
    return 2;
  }

  private setIndex(channel: 'fg' | 'bg', index: number): void {
    if (channel === 'fg') {
      this.fg = index;
      this.fgRgb = null;
      return;
    }
    this.bg = index;
    this.bgRgb = null;
  }

  private setRgb(channel: 'fg' | 'bg', r: number, g: number, b: number): void {
    const rgb = { r: byte(r), g: byte(g), b: byte(b) };
    if (channel === 'fg') {
      this.fgRgb = rgb;
      this.fg = null;
      return;
    }
    this.bgRgb = rgb;
    this.bg = null;
  }

  private clearChannel(channel: 'fg' | 'bg'): void {
    if (channel === 'fg') {
      this.fg = null;
      this.fgRgb = null;
      return;
    }
    this.bg = null;
    this.bgRgb = null;
  }

  private resetPen(): void {
    this.fg = 15;
    this.bg = null;
    this.bright = false;
    this.bold = false;
    this.faint = false;
    this.italic = false;
    this.underline = 0;
    this.blink = 0;
    this.reverse = false;
    this.conceal = false;
    this.strike = false;
    this.overline = false;
    this.framed = false;
    this.encircled = false;
    this.fraktur = false;
    this.font = 0;
    this.fgRgb = null;
    this.bgRgb = null;
  }

  private deviceAttributes(): void {
    if ((this.params[0]?.value ?? 0) !== 0) return;
    this.reply('\x1b[?0c');
  }

  private deviceStatus(): void {
    const request = this.ps(0);
    if (request === 5) {
      this.reply('\x1b[0n');
      return;
    }
    if (request !== 6) return;
    const row = clamp(this.cursor.row + 1, 1, Math.max(1, this.rows));
    const col = clamp(this.cursor.col + 1, 1, Math.max(1, this.cols));
    this.reply(`\x1b[${row};${col}R`);
  }

  private reply(text: string): void {
    this.replies.push(text);
    if (this.replies.length > 32) this.replies.shift();
  }

  private saveCursor(): void {
    this.saved = this.capture();
  }

  private restoreCursor(): void {
    this.restore(this.saved);
  }

  private capture(): CursorMark {
    return {
      col: this.cursor.col,
      row: this.cursor.row,
      fg: this.fg,
      bg: this.bg,
      bright: this.bright,
      bold: this.bold,
      fgRgb: this.fgRgb ? { ...this.fgRgb } : null,
      bgRgb: this.bgRgb ? { ...this.bgRgb } : null,
      faint: this.faint,
      italic: this.italic,
      underline: this.underline,
      blink: this.blink,
      reverse: this.reverse,
      conceal: this.conceal,
      strike: this.strike,
      overline: this.overline,
      framed: this.framed,
      encircled: this.encircled,
      fraktur: this.fraktur,
      font: this.font,
      gl: this.gl,
      single: this.singleShift,
      gset: { ...this.gset },
    };
  }

  private restore(mark: CursorMark): void {
    this.place(mark.col, mark.row);
    this.fg = mark.fg;
    this.bg = mark.bg;
    this.bright = mark.bright;
    this.bold = mark.bold;
    this.fgRgb = mark.fgRgb ? { ...mark.fgRgb } : null;
    this.bgRgb = mark.bgRgb ? { ...mark.bgRgb } : null;
    this.faint = mark.faint;
    this.italic = mark.italic;
    this.underline = mark.underline;
    this.blink = mark.blink;
    this.reverse = mark.reverse;
    this.conceal = mark.conceal;
    this.strike = mark.strike;
    this.overline = mark.overline;
    this.framed = mark.framed;
    this.encircled = mark.encircled;
    this.fraktur = mark.fraktur;
    this.font = mark.font;
    this.gl = mark.gl;
    this.singleShift = mark.single;
    this.gset.G0 = mark.gset.G0;
    this.gset.G1 = mark.gset.G1;
    this.gset.G2 = mark.gset.G2;
    this.gset.G3 = mark.gset.G3;
  }

  private resetTerminal(): void {
    this.fillBlank();
    this.cursor.col = 0;
    this.cursor.row = 0;
    this.resetPen();
    this.newlineMode = true;
    this.insertMode = false;
    this.gl = 'G0';
    this.singleShift = null;
    this.gset.G0 = 'ascii';
    this.gset.G1 = 'ascii';
    this.gset.G2 = 'ascii';
    this.gset.G3 = 'ascii';
    this.resetTabs();
    this.lastGlyph = null;
    this.replies.length = 0;
    this.saved = this.capture();
    this.dirty = true;
    this.ground();
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
    const cell: Cell = { ch, fg: this.fg, bg: this.bg, bright: this.bright };
    if (this.fgRgb) cell.fgRgb = { r: this.fgRgb.r, g: this.fgRgb.g, b: this.fgRgb.b };
    if (this.bgRgb) cell.bgRgb = { r: this.bgRgb.r, g: this.bgRgb.g, b: this.bgRgb.b };
    if (this.bold) cell.bold = true;
    if (this.faint) cell.faint = true;
    if (this.italic) cell.italic = true;
    if (this.underline) cell.underline = this.underline;
    if (this.blink) cell.blink = this.blink;
    if (this.reverse) cell.reverse = true;
    if (this.conceal) cell.conceal = true;
    if (this.strike) cell.strike = true;
    if (this.overline) cell.overline = true;
    if (this.framed) cell.framed = true;
    if (this.encircled) cell.encircled = true;
    if (this.fraktur) cell.fraktur = true;
    if (this.font) cell.font = this.font;
    return cell;
  }

  private applyOptions(options: TerminalOptions): void {
    if (options.colorStyle === 'c64') this.palette = 'c64';
    if (options.background !== undefined) {
      const next = normalizeColor(this.activeStyle(), options.background);
      if (!(typeof options.background === 'number' && next == null)) this.screenColor = next;
    }
    if (options.showCursor === false) this.cursorLit = false;
    if (typeof options.cursorColor === 'string' && options.cursorColor) this.cursorColor = options.cursorColor;
    if (isCursorStyle(options.cursorStyle)) this.cursorStyle = options.cursorStyle;
    if (options.border !== undefined) this.border(options.border, options.borderWidth);
    if (options.cursorSpeed != null) this.setSpeed('cursor', options.cursorSpeed);
    if (options.blinkSpeed != null) this.setSpeed('blink', options.blinkSpeed);
  }

  private activeStyle(): ColorStyle {
    return this.palette === 'c64' ? 'c64' : 'ansi';
  }

  private setSpeed(kind: 'cursor' | 'blink', ms: number): void {
    const next = sanitizeMs(ms);
    if (kind === 'cursor') {
      this.cursorMs = next;
      this.cursorEpoch = Date.now();
    } else {
      this.blinkMs = next;
      this.blinkEpoch = Date.now();
    }
    this.armTimer(kind);
    this.flush();
  }

  private armTimer(kind: 'cursor' | 'blink'): void {
    const previous = kind === 'cursor' ? this.cursorTimer : this.blinkTimer;
    if (previous != null) clearInterval(previous);
    const ms = kind === 'cursor' ? this.cursorMs : this.blinkMs;
    if (ms <= 0) {
      if (kind === 'cursor') this.cursorTimer = null;
      else this.blinkTimer = null;
      return;
    }
    const timer = setInterval(() => {
      if (this.batch > 0) return;
      this.flush();
    }, ms);
    const handle = timer as unknown as { unref?: () => void };
    handle.unref?.();
    if (kind === 'cursor') this.cursorTimer = timer;
    else this.blinkTimer = timer;
  }

  private phaseOn(epoch: number, ms: number): boolean {
    if (ms <= 0) return true;
    return Math.floor((Date.now() - epoch) / ms) % 2 === 0;
  }

  private blinkHidden(cell: Cell): boolean {
    if (!cell.blink || this.blinkMs <= 0) return false;
    const step = cell.blink === 2 ? Math.max(1, Math.floor(this.blinkMs / 2)) : this.blinkMs;
    return Math.floor((Date.now() - this.blinkEpoch) / step) % 2 === 1;
  }

  private paintCursor(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.cursorLit === false || this.cols < 1 || this.rows < 1) return;
    if (!this.phaseOn(this.cursorEpoch, this.cursorMs)) return;
    const col = clamp(this.cursor.col, 0, this.cols - 1);
    const row = clamp(this.cursor.row, 0, this.rows - 1);
    const x = col * width;
    const y = row * height;
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.cursorColor || '#9ee';
    if (this.cursorStyle === 'block') {
      ctx.fillRect(x, y, width, height);
      return;
    }
    if (this.cursorStyle === 'bar') {
      ctx.fillRect(x, y, Math.min(2, width), height);
      return;
    }
    const bar = Math.min(2, height);
    ctx.fillRect(x, y + height - bar, width, bar);
  }

  /**
   * Write the canvas border only when it differs from the last value this
   * terminal set. A game that styled the element itself is not cleared.
   */
  private syncBorder(): void {
    let next = '';
    if (this.borderColor != null && this.borderWidth > 0) {
      const css = resolveColor(this.activeStyle(), this.borderColor);
      if (css) next = `${this.borderWidth}px solid ${css}`;
    }
    if (next === this.lastBorder) return;
    this.lastBorder = next;
    this.canvas.element.style.border = next;
  }

  private fillBlank(): void {
    this.cells.length = 0;
    for (let row = 0; row < this.rows; row += 1) this.cells.push(blankRow(this.cols));
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

  private bell(): void {
    const AudioCtor = globalThis.AudioContext;
    if (typeof AudioCtor !== 'function') return;
    try {
      const audio = this.audio ?? new AudioCtor();
      this.audio = audio;
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gain.gain.value = 0.04;
      osc.connect(gain);
      gain.connect(audio.destination);
      const stopAt = audio.currentTime + 0.04;
      gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
      osc.start();
      osc.stop(stopAt);
    } catch {
      // Missing audio or a rejected autoplay policy leaves the buffer alone.
    }
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

function blanks(count: number): Cell[] {
  return Array.from({ length: count }, () => ({ ch: ' ' }));
}

function cssColor(cell: Cell, channel: 'fg' | 'bg', style: ColorStyle): string | null {
  const rgb = channel === 'fg' ? cell.fgRgb : cell.bgRgb;
  if (rgb) return `rgb(${rgb.r | 0}, ${rgb.g | 0}, ${rgb.b | 0})`;
  let index = channel === 'fg' ? cell.fg : cell.bg;
  if (index == null) return null;
  // The C64 set has no bright half. Shifting 0–7 would turn yellow into orange.
  if (style !== 'c64' && channel === 'fg' && cell.bright && index >= 0 && index < 8) index += 8;
  return paletteColor(style, index);
}

function paletteColor(style: ColorStyle, index: number): string | null {
  if (!Number.isInteger(index) || index < 0 || index > 255) return null;
  if (index < 16) return (style === 'c64' ? C64 : ANSI)[index];
  if (index < 232) {
    const cube = index - 16;
    const red = Math.floor(cube / 36);
    const green = Math.floor(cube / 6) % 6;
    const blue = cube % 6;
    const level = (step: number) => (step === 0 ? 0 : 55 + step * 40);
    return `rgb(${level(red)}, ${level(green)}, ${level(blue)})`;
  }
  const gray = 8 + (index - 232) * 10;
  return `rgb(${gray}, ${gray}, ${gray})`;
}

function resolveColor(style: ColorStyle, color: string | number | null): string | null {
  if (typeof color === 'number') return paletteColor(style, color);
  if (typeof color === 'string' && color) return color;
  return null;
}

function normalizeColor(style: ColorStyle, color: string | number | null): string | number | null {
  if (color == null || color === '') return null;
  if (typeof color === 'number') return paletteColor(style, color) == null ? null : color;
  if (typeof color === 'string') return color;
  return null;
}

function isCursorStyle(style: CursorStyle | undefined): style is CursorStyle {
  return style === 'underline' || style === 'block' || style === 'bar';
}

function sanitizeMs(ms: number): number {
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.min(10_000, Math.floor(ms));
}

function faceFor(cell: Cell, size: number): string {
  const weight = cell.bold ? 'bold ' : '';
  const slant = cell.italic ? 'italic ' : '';
  if (!weight && !slant) return `${size}px monospace`;
  return `${weight}${slant}${size}px monospace`;
}

function paintFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  ctx.fillRect(x, y, width, 1);
  ctx.fillRect(x, y + height - 1, width, 1);
  ctx.fillRect(x, y, 1, height);
  ctx.fillRect(x + width - 1, y, 1, height);
}

function canEllipse(ctx: CanvasRenderingContext2D): boolean {
  return typeof ctx.ellipse === 'function'
    && typeof ctx.beginPath === 'function'
    && typeof ctx.stroke === 'function';
}

function paintEllipse(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  ctx.beginPath();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 1;
  ctx.ellipse(
    x + width / 2,
    y + height / 2,
    Math.max(1, width / 2 - 1),
    Math.max(1, height / 2 - 1),
    0,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
}

/**
 * ISO 8613-6 direct color. An empty or zero color-space slot selects the
 * default RGB space. A list with no empty slot and exactly the component
 * count is the shorthand form. CMY and CMYK convert into that RGB space.
 */
function directComponents(
  mode: 2 | 3 | 4,
  rest: (number | null)[],
): Rgb | null {
  const need = mode === 4 ? 4 : 3;
  const itu = rest.some((item) => item == null);
  let comps: (number | null)[];
  if (itu) {
    if (rest[0] != null && rest[0] !== 0) return null;
    comps = rest.slice(1);
  } else if (rest.length === need) {
    comps = rest;
  } else if (rest.length > need && rest[0] === 0) {
    comps = rest.slice(1);
  } else {
    return null;
  }
  if (comps.length < need || comps.slice(0, need).some((item) => item == null)) return null;
  const values = comps.slice(0, need).map((item) => byte(item ?? 0));
  if (mode === 2) return { r: values[0], g: values[1], b: values[2] };
  if (mode === 3) return { r: 255 - values[0], g: 255 - values[1], b: 255 - values[2] };
  const cyan = values[0] / 255;
  const magenta = values[1] / 255;
  const yellow = values[2] / 255;
  const black = values[3] / 255;
  return {
    r: Math.round(255 * (1 - cyan) * (1 - black)),
    g: Math.round(255 * (1 - magenta) * (1 - black)),
    b: Math.round(255 * (1 - yellow) * (1 - black)),
  };
}

function byte(value: number): number {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value | 0;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}
