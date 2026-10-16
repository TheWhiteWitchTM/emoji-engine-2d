import { Canvas } from './canvas.js';
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
export class Terminal {
    cols;
    rows;
    canvas;
    /** Write position. Assign `col` and `row` to move it. */
    cursor = { col: 0, row: 0 };
    /** Foreground color index used by `write` and `put`. */
    fg = 15;
    /** Background color index used by `write` and `put`. Null stays transparent. */
    bg = null;
    /** Bright flag stored on cells written from now on. */
    bright = false;
    cellWidth;
    cellHeight;
    cells;
    keys = new Set();
    keyHandlers = [];
    batch = 0;
    dirty = false;
    /** Build a cell buffer and paint it through `options.canvas`, or a new canvas. */
    constructor(options = {}) {
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
    write(text) {
        this.beginFrame();
        for (const ch of text)
            this.typeChar(ch);
        this.endFrame();
    }
    /** Write one character at the cursor and advance. Extra code points are ignored. */
    put(ch) {
        const first = Array.from(ch)[0];
        if (!first)
            return;
        this.typeChar(first);
        this.flush();
    }
    /** Replace the cell at a column and row. Out-of-range writes are ignored. */
    set(col, row, value) {
        if (!this.inRange(col, row))
            return;
        this.cells[row][col] = typeof value === 'string' ? this.ink(value) : { ...value };
        this.flush();
    }
    /** Copy the cell at a column and row. Out-of-range reads are a space. */
    get(col, row) {
        if (!this.inRange(col, row))
            return { ch: ' ' };
        return { ...this.cells[row][col] };
    }
    /** Fill the buffer with spaces and move the cursor home. */
    clear() {
        this.fillBlank();
        this.cursor.col = 0;
        this.cursor.row = 0;
        this.flush();
    }
    /** Set the colors used by later `write` and `put` calls. */
    color(fg, bg = this.bg) {
        this.fg = fg;
        this.bg = bg;
    }
    /** Hold redraws until the matching `endFrame`. Calls may nest. */
    beginFrame() {
        this.batch += 1;
    }
    /** Release one `beginFrame`. The last one redraws if anything changed. */
    endFrame() {
        if (this.batch > 0)
            this.batch -= 1;
        if (this.batch === 0 && this.dirty)
            this.flush();
    }
    /** Subscribe to keydown events. `key` matches `KeyboardEvent.key`. */
    onKey(handler) {
        this.keyHandlers.push(handler);
    }
    /** True while `key` (`KeyboardEvent.key`) is held. */
    isKeyDown(key) {
        return this.keys.has(key);
    }
    /**
     * Paint the buffer in screen space. The camera is ignored so a following
     * view does not scroll the grid off the bitmap.
     */
    draw(ctx, _camera) {
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
    typeChar(ch) {
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
    scrollIntoView() {
        while (this.cursor.row >= this.rows) {
            this.cells.shift();
            this.cells.push(blankRow(this.cols));
            this.cursor.row -= 1;
        }
        if (this.cursor.row < 0)
            this.cursor.row = 0;
        if (this.cursor.col < 0)
            this.cursor.col = 0;
        if (this.cursor.col > this.cols)
            this.cursor.col = this.cols;
        this.dirty = true;
    }
    ink(ch) {
        return { ch, fg: this.fg, bg: this.bg, bright: this.bright };
    }
    fillBlank() {
        this.cells.length = 0;
        for (let row = 0; row < this.rows; row += 1) {
            this.cells.push(blankRow(this.cols));
        }
    }
    inRange(col, row) {
        return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
    }
    flush() {
        if (this.batch > 0) {
            this.dirty = true;
            return;
        }
        this.dirty = false;
        this.canvas.draw();
    }
    armKeys() {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function')
            return;
        window.addEventListener('keydown', (event) => {
            this.keys.add(event.key);
            for (const handler of this.keyHandlers)
                handler(event.key);
        });
        window.addEventListener('keyup', (event) => {
            this.keys.delete(event.key);
        });
    }
}
function blankRow(cols) {
    const row = [];
    for (let col = 0; col < cols; col += 1)
        row.push({ ch: ' ' });
    return row;
}
function cssColor(cell, channel) {
    const rgb = channel === 'fg' ? cell.fgRgb : cell.bgRgb;
    if (rgb)
        return `rgb(${rgb.r | 0}, ${rgb.g | 0}, ${rgb.b | 0})`;
    let index = channel === 'fg' ? cell.fg : cell.bg;
    if (index == null)
        return null;
    if (channel === 'fg' && cell.bright && index >= 0 && index < 8)
        index += 8;
    return PALETTE[index] ?? null;
}
//# sourceMappingURL=terminal.js.map