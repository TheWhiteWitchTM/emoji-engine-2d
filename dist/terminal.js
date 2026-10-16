import { Canvas } from './canvas.js';
const CLASSIC = [
    '#000000', '#aa0000', '#00aa00', '#aa5500',
    '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa',
    '#555555', '#ff5555', '#55ff55', '#ffff55',
    '#5555ff', '#ff55ff', '#55ffff', '#ffffff',
];
/**
 * VT100 special graphics, the character-cell line drawing set.
 * Invoked with `ESC ( 0` (G0) or `ESC ) 0` (G1) and Shift Out / Shift In.
 */
const DEC_SPECIAL = {
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
    /** Intensity flag stored on cells written from now on. Indexes 0–7 draw as 8–15. */
    bright = false;
    cellWidth;
    cellHeight;
    cells;
    keys = new Set();
    keyHandlers = [];
    tabs = new Set();
    gset = {
        G0: 'ascii',
        G1: 'ascii',
        G2: 'ascii',
        G3: 'ascii',
    };
    replies = [];
    batch = 0;
    dirty = false;
    /**
     * ECMA-48 newline mode (LNM, mode 20). The standard powers up with LNM
     * reset, so a line feed would keep the column. This buffer starts with
     * LNM set: `\n` returns to column 0, which is what `write` already did.
     * `CSI 20 l` selects the standard line feed.
     */
    newlineMode = true;
    /** ECMA-48 insertion-replacement mode (IRM, mode 4). Reset means overwrite. */
    insertMode = false;
    bold = false;
    faint = false;
    italic = false;
    underline = 0;
    blink = 0;
    reverse = false;
    conceal = false;
    strike = false;
    overline = false;
    framed = false;
    encircled = false;
    fraktur = false;
    font = 0;
    fgRgb = null;
    bgRgb = null;
    gl = 'G0';
    singleShift = null;
    lastGlyph = null;
    saved;
    audio = null;
    state = 'ground';
    params = [];
    intermediates = '';
    privateMarker = '';
    csiInvalid = false;
    digits = '';
    sawDigit = false;
    numberCommitted = false;
    fillingSub = false;
    stringKind = 'osc';
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
        this.resetTabs();
        this.saved = this.capture();
        this.canvas.add(this, options.layer ?? 'terminal');
        this.armKeys();
        this.flush();
    }
    /**
     * Write a string at the cursor.
     * Code points are stored one per cell. ECMA-48 / ANSI X3.64 sequences are
     * obeyed. `\n` and `\r` still start a new line and return to column 0
     * while newline mode is set, which is how the buffer starts.
     * The buffer wraps and scrolls.
     */
    write(text) {
        this.beginFrame();
        for (const ch of text)
            this.feed(ch);
        this.endFrame();
    }
    /**
     * Feed one code point through the same parser as `write`, then redraw.
     * Extra code points in `ch` are ignored. `set` does not parse controls.
     */
    put(ch) {
        const first = Array.from(ch)[0];
        if (!first)
            return;
        this.feed(first);
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
    /** Fill the buffer with spaces and move the cursor home. The pen is kept. */
    clear() {
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
    color(fg, bg) {
        this.fg = fg;
        this.fgRgb = null;
        if (bg === undefined)
            return;
        this.bg = bg;
        this.bgRgb = null;
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
     * Return the next device report (`CSI 5 n`, `CSI 6 n`, `CSI c`), or `''`
     * when none is waiting. Reports stay queued until read.
     */
    readReply() {
        return this.replies.shift() ?? '';
    }
    /**
     * Paint the buffer in screen space. The camera is ignored so a following
     * view does not scroll the grid off the bitmap.
     */
    draw(ctx, _camera) {
        const { cellWidth: width, cellHeight: height } = this;
        const size = Math.floor(height * 0.8);
        ctx.save();
        for (let row = 0; row < this.rows; row += 1) {
            for (let col = 0; col < this.cols; col += 1) {
                this.paintCell(ctx, this.cells[row][col], col * width, row * height, width, height, size);
            }
        }
        ctx.globalAlpha = 1;
        const barX = this.cursor.col * width;
        const barY = (this.cursor.row + 1) * height - 2;
        ctx.fillStyle = '#9ee';
        ctx.fillRect(barX, barY, width, 2);
        ctx.restore();
    }
    paintCell(ctx, cell, x, y, width, height, size) {
        let fg = cssColor(cell, 'fg') ?? '#eeeeee';
        let bg = cssColor(cell, 'bg');
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
        const hidden = cell.conceal === true;
        const glyph = !hidden && !!cell.ch && cell.ch !== ' ';
        const underline = hidden ? 0 : (cell.underline ?? 0);
        const strike = !hidden && cell.strike === true;
        const overline = !hidden && cell.overline === true;
        const framed = !hidden && cell.framed === true;
        const encircled = !hidden && cell.encircled === true;
        if (!glyph && underline === 0 && !strike && !overline && !framed && !encircled)
            return;
        ctx.globalAlpha = cell.faint ? 0.6 : 1;
        ctx.fillStyle = fg;
        if (glyph) {
            ctx.font = faceFor(cell, size);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cell.ch, x + width / 2, y + height / 2);
        }
        if (underline === 1)
            ctx.fillRect(x, y + height - 2, width, 1);
        else if (underline === 2) {
            ctx.fillRect(x, y + Math.max(0, height - 4), width, 1);
            ctx.fillRect(x, y + height - 2, width, 1);
        }
        if (strike)
            ctx.fillRect(x, y + Math.floor(height / 2), width, 1);
        if (overline)
            ctx.fillRect(x, y, width, 1);
        if (encircled && canEllipse(ctx))
            paintEllipse(ctx, x, y, width, height);
        else if (framed || encircled)
            paintFrame(ctx, x, y, width, height);
        ctx.globalAlpha = 1;
    }
    feed(ch) {
        const code = ch.codePointAt(0) ?? 0;
        if (code === 0x00 || code === 0x7f)
            return;
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
    feedGround(ch, code) {
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
    feedEscape(ch, code) {
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
            if (this.state === 'escape')
                this.intermediates = '';
            this.state = 'esc-intermediate';
            if (this.intermediates.length < 2)
                this.intermediates += ch;
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
    feedCsi(ch, code) {
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
                if (this.params.length < 32)
                    this.params.push({ value: null, sub: [] });
                this.fillingSub = false;
            }
            else {
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
            if (this.digits.length < 6)
                this.digits += ch;
            return;
        }
        if (ch === '<' || ch === '=' || ch === '>' || ch === '?') {
            const fresh = !this.sawDigit && !this.numberCommitted && !this.fillingSub
                && this.params.length === 1 && this.privateMarker === '' && this.intermediates === '';
            if (fresh)
                this.privateMarker = ch;
            else
                this.csiInvalid = true;
            return;
        }
        if (code >= 0x20 && code <= 0x2f) {
            this.commitNumber();
            if (this.intermediates.length < 2)
                this.intermediates += ch;
            else
                this.csiInvalid = true;
            return;
        }
        if (code >= 0x40 && code <= 0x7e) {
            this.commitNumber();
            this.dispatchCsi(ch);
            this.ground();
        }
    }
    feedString(code) {
        if (code === 0x9c || (code === 0x07 && this.stringKind === 'osc')) {
            this.ground();
            return;
        }
        // String contents are not interpreted. OSC must not retint the palette or the page.
    }
    feedStringEsc(ch) {
        if (ch === '\\') {
            this.ground();
            return;
        }
        this.ground();
        this.state = 'escape';
        this.feed(ch);
    }
    executeC0(code) {
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
    executeC1(code) {
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
    runEsc(final, intermediate) {
        this.ground();
        if (intermediate === '(' || intermediate === ')' || intermediate === '*' || intermediate === '+'
            || intermediate === '-' || intermediate === '.' || intermediate === '/') {
            this.designate(intermediate, final);
            return;
        }
        if (intermediate !== '')
            return;
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
    dispatchCsi(final) {
        if (this.csiInvalid || this.privateMarker)
            return;
        if (this.intermediates === ' ') {
            if (final === '@')
                this.scrollLeft(this.pn(0));
            else if (final === 'A')
                this.scrollRight(this.pn(0));
            return;
        }
        if (this.intermediates !== '')
            return;
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
    pn(index) {
        const value = this.params[index]?.value;
        if (value == null || value < 1)
            return 1;
        return value;
    }
    /** Selective parameter. Omitted means 0. Zero is a real value for erase and tab clear. */
    ps(index) {
        const value = this.params[index]?.value;
        if (value == null || value < 0)
            return 0;
        return value;
    }
    repeatCount() {
        const value = this.params[0]?.value;
        if (value == null)
            return 1;
        if (value < 1)
            return 0;
        return Math.min(value, 10000);
    }
    enterCsi() {
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
    beginString(kind) {
        this.stringKind = kind;
        this.state = 'string';
    }
    ground() {
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
    commitNumber() {
        if (this.numberCommitted)
            return;
        const current = this.params[this.params.length - 1];
        const value = this.sawDigit ? Number(this.digits) : null;
        if (current) {
            if (this.fillingSub) {
                if (current.sub.length < 8)
                    current.sub.push(value);
            }
            else {
                current.value = value;
            }
        }
        this.digits = '';
        this.sawDigit = false;
        this.numberCommitted = true;
    }
    writeGraphic(ch) {
        this.putGlyph(this.translate(ch));
    }
    putGlyph(glyph) {
        this.lastGlyph = glyph;
        if (this.insertMode && this.inRange(this.cursor.col, this.cursor.row)) {
            const line = this.cells[this.cursor.row];
            for (let col = this.cols - 1; col > this.cursor.col; col -= 1)
                line[col] = line[col - 1];
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
    translate(ch) {
        const slot = this.singleShift ?? this.gl;
        this.singleShift = null;
        const code = ch.codePointAt(0) ?? 0;
        if (code < 0x20 || code > 0x7e)
            return ch;
        const set = this.gset[slot];
        if (set === 'dec')
            return DEC_SPECIAL[code] ?? ch;
        if (set === 'uk' && code === 0x23)
            return '£';
        return ch;
    }
    designate(intermediate, final) {
        const slot = intermediate === '(' ? 'G0'
            : intermediate === ')' || intermediate === '-' ? 'G1'
                : intermediate === '*' || intermediate === '.' ? 'G2'
                    : intermediate === '+' || intermediate === '/' ? 'G3'
                        : null;
        if (!slot)
            return;
        this.gset[slot] = final === '0' ? 'dec' : final === 'A' ? 'uk' : 'ascii';
    }
    lineFeed() {
        if (this.newlineMode)
            this.cursor.col = 0;
        this.indexDown();
    }
    nextLine() {
        this.cursor.col = 0;
        this.indexDown();
    }
    indexDown() {
        this.cursor.row += 1;
        this.scrollIntoView();
    }
    reverseIndex() {
        if (this.cursor.row > 0) {
            this.cursor.row -= 1;
            this.dirty = true;
            return;
        }
        this.cursor.row = 0;
        this.scrollDown(1);
    }
    carriageReturn() {
        this.cursor.col = 0;
        this.dirty = true;
    }
    backspace() {
        if (this.cursor.col >= this.cols)
            this.cursor.col = Math.max(0, this.cols - 1);
        else if (this.cursor.col > 0)
            this.cursor.col -= 1;
        this.dirty = true;
    }
    moveBy(colDelta, rowDelta) {
        this.place(this.cursor.col + colDelta, this.cursor.row + rowDelta);
    }
    /** Cursor addressing stops at the edges. It does not scroll. */
    place(col, row) {
        this.cursor.col = clamp(col, 0, Math.max(0, this.cols - 1));
        this.cursor.row = clamp(row, 0, Math.max(0, this.rows - 1));
        this.dirty = true;
    }
    tab(direction, count) {
        const steps = Math.min(count, Math.max(1, this.cols));
        for (let i = 0; i < steps; i += 1) {
            if (direction > 0) {
                if (this.cursor.col >= this.cols - 1) {
                    this.cursor.col = Math.max(0, this.cols - 1);
                    break;
                }
                let next = this.cols - 1;
                for (const stop of this.tabs) {
                    if (stop > this.cursor.col && stop < next)
                        next = stop;
                }
                this.cursor.col = next;
            }
            else if (this.cursor.col <= 0) {
                this.cursor.col = 0;
                break;
            }
            else {
                let prev = 0;
                for (const stop of this.tabs) {
                    if (stop < this.cursor.col && stop > prev)
                        prev = stop;
                }
                this.cursor.col = prev;
            }
        }
        this.dirty = true;
    }
    setTab() {
        if (this.cursor.col >= 0 && this.cursor.col < this.cols)
            this.tabs.add(this.cursor.col);
    }
    clearTabs(mode) {
        if (mode === 0)
            this.tabs.delete(this.cursor.col);
        else if (mode === 2 || mode === 3 || mode === 5)
            this.tabs.clear();
    }
    resetTabs() {
        this.tabs.clear();
        for (let col = 8; col < this.cols; col += 8)
            this.tabs.add(col);
    }
    repeat(count) {
        if (!this.lastGlyph || count < 1)
            return;
        const times = Math.min(count, 10000);
        const glyph = this.lastGlyph;
        for (let i = 0; i < times; i += 1)
            this.putGlyph(glyph);
    }
    insertChars(count) {
        const { col, row } = this.cursor;
        if (!this.inRange(col, row) || count < 1)
            return;
        const lines = Math.min(count, this.cols - col);
        const line = this.cells[row];
        line.splice(col, 0, ...blanks(lines));
        line.length = this.cols;
        this.dirty = true;
    }
    deleteChars(count) {
        const { col, row } = this.cursor;
        if (!this.inRange(col, row) || count < 1)
            return;
        const lines = Math.min(count, this.cols - col);
        const line = this.cells[row];
        line.splice(col, lines);
        for (let i = 0; i < lines; i += 1)
            line.push({ ch: ' ' });
        this.dirty = true;
    }
    insertLines(count) {
        const row = this.cursor.row;
        if (row < 0 || row >= this.rows || count < 1)
            return;
        const lines = Math.min(count, this.rows - row);
        this.cells.splice(row, 0, ...Array.from({ length: lines }, () => blankRow(this.cols)));
        this.cells.length = this.rows;
        this.dirty = true;
    }
    deleteLines(count) {
        const row = this.cursor.row;
        if (row < 0 || row >= this.rows || count < 1)
            return;
        const lines = Math.min(count, this.rows - row);
        this.cells.splice(row, lines);
        for (let i = 0; i < lines; i += 1)
            this.cells.push(blankRow(this.cols));
        this.dirty = true;
    }
    eraseChars(count) {
        if (count < 1 || this.cursor.row < 0 || this.cursor.row >= this.rows)
            return;
        this.eraseSpan(this.cursor.row, this.cursor.col, this.cursor.col + count - 1);
        this.dirty = true;
    }
    eraseDisplay(mode) {
        if (mode === 2) {
            this.fillBlank();
            this.dirty = true;
            return;
        }
        if (mode !== 0 && mode !== 1)
            return;
        const row = this.cursor.row;
        if (row < 0 || row >= this.rows)
            return;
        if (mode === 0) {
            this.eraseSpan(row, this.cursor.col, this.cols - 1);
            for (let y = row + 1; y < this.rows; y += 1)
                this.cells[y] = blankRow(this.cols);
        }
        else {
            for (let y = 0; y < row; y += 1)
                this.cells[y] = blankRow(this.cols);
            this.eraseSpan(row, 0, this.cursor.col);
        }
        this.dirty = true;
    }
    eraseLine(mode) {
        const row = this.cursor.row;
        if (row < 0 || row >= this.rows)
            return;
        if (mode === 2)
            this.cells[row] = blankRow(this.cols);
        else if (mode === 0)
            this.eraseSpan(row, this.cursor.col, this.cols - 1);
        else if (mode === 1)
            this.eraseSpan(row, 0, this.cursor.col);
        else
            return;
        this.dirty = true;
    }
    /** Erased cells match `clear`: a space with no colors, so the layers behind stay visible. */
    eraseSpan(row, from, to) {
        const start = Math.max(0, from);
        const end = Math.min(this.cols - 1, to);
        if (start > end)
            return;
        const line = this.cells[row];
        for (let col = start; col <= end; col += 1)
            line[col] = { ch: ' ' };
    }
    scrollUp(count) {
        const lines = Math.min(Math.max(0, count), this.rows);
        for (let i = 0; i < lines; i += 1) {
            this.cells.shift();
            this.cells.push(blankRow(this.cols));
        }
        this.dirty = true;
    }
    scrollDown(count) {
        const lines = Math.min(Math.max(0, count), this.rows);
        for (let i = 0; i < lines; i += 1) {
            this.cells.pop();
            this.cells.unshift(blankRow(this.cols));
        }
        this.dirty = true;
    }
    scrollLeft(count) {
        const n = Math.min(Math.max(0, count), this.cols);
        if (n === 0)
            return;
        for (const line of this.cells) {
            line.splice(0, n);
            for (let i = 0; i < n; i += 1)
                line.push({ ch: ' ' });
        }
        this.dirty = true;
    }
    scrollRight(count) {
        const n = Math.min(Math.max(0, count), this.cols);
        if (n === 0)
            return;
        for (const line of this.cells) {
            line.splice(0, 0, ...blanks(n));
            line.length = this.cols;
        }
        this.dirty = true;
    }
    setMode(on) {
        for (const param of this.params) {
            if (param.value === 4)
                this.insertMode = on;
            else if (param.value === 20)
                this.newlineMode = on;
        }
    }
    selectRendition() {
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
                }
                else {
                    index += this.consumeLegacyColor(channel, index);
                }
                continue;
            }
            this.applySgr(code);
            index += 1;
        }
    }
    applySgr(code) {
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
    applyIsoColor(channel, sub) {
        const mode = sub[0];
        if (mode === 1) {
            this.clearChannel(channel);
            return;
        }
        if (mode === 5) {
            const index = sub[1];
            if (index != null && index >= 0 && index <= 255)
                this.setIndex(channel, index);
            return;
        }
        if (mode === 2 || mode === 3 || mode === 4) {
            const parts = directComponents(mode, sub.slice(1));
            if (!parts)
                return;
            this.setRgb(channel, parts.r, parts.g, parts.b);
        }
    }
    /** Semicolon form used in the field: `38;5;n` and `38;2;r;g;b`. */
    consumeLegacyColor(channel, index) {
        const mode = this.params[index + 1];
        if (!mode)
            return 1;
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
    setIndex(channel, index) {
        if (channel === 'fg') {
            this.fg = index;
            this.fgRgb = null;
            return;
        }
        this.bg = index;
        this.bgRgb = null;
    }
    setRgb(channel, r, g, b) {
        const rgb = { r: byte(r), g: byte(g), b: byte(b) };
        if (channel === 'fg') {
            this.fgRgb = rgb;
            this.fg = null;
            return;
        }
        this.bgRgb = rgb;
        this.bg = null;
    }
    clearChannel(channel) {
        if (channel === 'fg') {
            this.fg = null;
            this.fgRgb = null;
            return;
        }
        this.bg = null;
        this.bgRgb = null;
    }
    resetPen() {
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
    deviceAttributes() {
        if ((this.params[0]?.value ?? 0) !== 0)
            return;
        this.reply('\x1b[?0c');
    }
    deviceStatus() {
        const request = this.ps(0);
        if (request === 5) {
            this.reply('\x1b[0n');
            return;
        }
        if (request !== 6)
            return;
        const row = clamp(this.cursor.row + 1, 1, Math.max(1, this.rows));
        const col = clamp(this.cursor.col + 1, 1, Math.max(1, this.cols));
        this.reply(`\x1b[${row};${col}R`);
    }
    reply(text) {
        this.replies.push(text);
        if (this.replies.length > 32)
            this.replies.shift();
    }
    saveCursor() {
        this.saved = this.capture();
    }
    restoreCursor() {
        this.restore(this.saved);
    }
    capture() {
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
    restore(mark) {
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
    resetTerminal() {
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
        const cell = { ch, fg: this.fg, bg: this.bg, bright: this.bright };
        if (this.fgRgb)
            cell.fgRgb = { r: this.fgRgb.r, g: this.fgRgb.g, b: this.fgRgb.b };
        if (this.bgRgb)
            cell.bgRgb = { r: this.bgRgb.r, g: this.bgRgb.g, b: this.bgRgb.b };
        if (this.bold)
            cell.bold = true;
        if (this.faint)
            cell.faint = true;
        if (this.italic)
            cell.italic = true;
        if (this.underline)
            cell.underline = this.underline;
        if (this.blink)
            cell.blink = this.blink;
        if (this.reverse)
            cell.reverse = true;
        if (this.conceal)
            cell.conceal = true;
        if (this.strike)
            cell.strike = true;
        if (this.overline)
            cell.overline = true;
        if (this.framed)
            cell.framed = true;
        if (this.encircled)
            cell.encircled = true;
        if (this.fraktur)
            cell.fraktur = true;
        if (this.font)
            cell.font = this.font;
        return cell;
    }
    fillBlank() {
        this.cells.length = 0;
        for (let row = 0; row < this.rows; row += 1)
            this.cells.push(blankRow(this.cols));
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
    bell() {
        const AudioCtor = globalThis.AudioContext;
        if (typeof AudioCtor !== 'function')
            return;
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
        }
        catch {
            // Missing audio or a rejected autoplay policy leaves the buffer alone.
        }
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
function blanks(count) {
    return Array.from({ length: count }, () => ({ ch: ' ' }));
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
    return palette(index);
}
function palette(index) {
    if (!Number.isInteger(index) || index < 0 || index > 255)
        return null;
    if (index < 16)
        return CLASSIC[index];
    if (index < 232) {
        const cube = index - 16;
        const red = Math.floor(cube / 36);
        const green = Math.floor(cube / 6) % 6;
        const blue = cube % 6;
        const level = (step) => (step === 0 ? 0 : 55 + step * 40);
        return `rgb(${level(red)}, ${level(green)}, ${level(blue)})`;
    }
    const gray = 8 + (index - 232) * 10;
    return `rgb(${gray}, ${gray}, ${gray})`;
}
function faceFor(cell, size) {
    const weight = cell.bold ? 'bold ' : '';
    const slant = cell.italic ? 'italic ' : '';
    if (!weight && !slant)
        return `${size}px monospace`;
    return `${weight}${slant}${size}px monospace`;
}
function paintFrame(ctx, x, y, width, height) {
    ctx.fillRect(x, y, width, 1);
    ctx.fillRect(x, y + height - 1, width, 1);
    ctx.fillRect(x, y, 1, height);
    ctx.fillRect(x + width - 1, y, 1, height);
}
function canEllipse(ctx) {
    return typeof ctx.ellipse === 'function'
        && typeof ctx.beginPath === 'function'
        && typeof ctx.stroke === 'function';
}
function paintEllipse(ctx, x, y, width, height) {
    ctx.beginPath();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1;
    ctx.ellipse(x + width / 2, y + height / 2, Math.max(1, width / 2 - 1), Math.max(1, height / 2 - 1), 0, 0, Math.PI * 2);
    ctx.stroke();
}
/**
 * ISO 8613-6 direct color. An empty or zero color-space slot selects the
 * default RGB space. A list with no empty slot and exactly the component
 * count is the shorthand form. CMY and CMYK convert into that RGB space.
 */
function directComponents(mode, rest) {
    const need = mode === 4 ? 4 : 3;
    const itu = rest.some((item) => item == null);
    let comps;
    if (itu) {
        if (rest[0] != null && rest[0] !== 0)
            return null;
        comps = rest.slice(1);
    }
    else if (rest.length === need) {
        comps = rest;
    }
    else if (rest.length > need && rest[0] === 0) {
        comps = rest.slice(1);
    }
    else {
        return null;
    }
    if (comps.length < need || comps.slice(0, need).some((item) => item == null))
        return null;
    const values = comps.slice(0, need).map((item) => byte(item ?? 0));
    if (mode === 2)
        return { r: values[0], g: values[1], b: values[2] };
    if (mode === 3)
        return { r: 255 - values[0], g: 255 - values[1], b: 255 - values[2] };
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
function byte(value) {
    if (value < 0)
        return 0;
    if (value > 255)
        return 255;
    return value | 0;
}
function clamp(value, min, max) {
    if (value < min)
        return min;
    if (value > max)
        return max;
    return value;
}
//# sourceMappingURL=terminal.js.map