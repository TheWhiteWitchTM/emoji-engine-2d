"use strict";
var EmojiEngine = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // dist/index.js
  var index_exports = {};
  __export(index_exports, {
    Canvas: () => Canvas,
    Engine: () => Engine,
    Terminal: () => Terminal,
    Utilities: () => Utilities
  });

  // dist/canvas.js
  var Canvas = class {
    /** The bitmap element. */
    element;
    /** The 2D drawing context for `element`. */
    ctx;
    /** World position shown at the top-left of the bitmap. */
    camera = { x: 0, y: 0 };
    layers = /* @__PURE__ */ new Map();
    followTarget = null;
    /** Create a canvas element and a 2D context. Nothing is added to the document. */
    constructor(options = {}) {
      const element = document.createElement("canvas");
      element.width = options.width ?? 800;
      element.height = options.height ?? 600;
      const ctx = element.getContext("2d");
      if (!ctx)
        throw new Error("2D canvas context is unavailable");
      this.element = element;
      this.ctx = ctx;
    }
    /** Draw one emoji centered on a world position. */
    drawEmoji(emoji, x, y, size) {
      paintEmoji(this.ctx, this.camera, emoji, x, y, size);
    }
    /**
     * Add a drawable to a named layer, creating the layer on first use.
     * Layers paint in the order they were first created, back to front.
     * An empty layer keeps its place. Adding a drawable that is already
     * on the canvas moves it.
     */
    add(drawable, layer = "default") {
      this.remove(drawable);
      let list = this.layers.get(layer);
      if (!list) {
        list = [];
        this.layers.set(layer, list);
      }
      list.push(drawable);
    }
    /** Remove a drawable from whichever layer holds it. */
    remove(drawable) {
      for (const list of this.layers.values()) {
        const index = list.indexOf(drawable);
        if (index < 0)
          continue;
        list.splice(index, 1);
        return;
      }
    }
    /** Clear the bitmap and paint every layer. Applies `follow` first. */
    draw() {
      const target = this.followTarget;
      if (target) {
        this.camera.x = target.x - this.element.width / 2;
        this.camera.y = target.y - this.element.height / 2;
      }
      this.clear();
      for (const list of this.layers.values()) {
        for (const drawable of list)
          drawable.draw(this.ctx, this.camera);
      }
    }
    /** Clear the bitmap. Drawables stay registered. */
    clear() {
      this.ctx.clearRect(0, 0, this.element.width, this.element.height);
    }
    /** Place the camera so this world point sits at the top-left. */
    setCamera(x, y) {
      this.camera.x = x;
      this.camera.y = y;
    }
    /**
     * Keep `target` centered on later `draw` calls.
     * Pass null to stop following. The camera stays where it is.
     * A follow target wins over `setCamera` until following stops.
     */
    follow(target) {
      this.followTarget = target;
    }
  };
  function paintEmoji(ctx, camera, emoji, x, y, size) {
    ctx.save();
    ctx.font = `${size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, x - camera.x, y - camera.y);
    ctx.restore();
  }

  // dist/terminal.js
  var CLASSIC = [
    "#000000",
    "#aa0000",
    "#00aa00",
    "#aa5500",
    "#0000aa",
    "#aa00aa",
    "#00aaaa",
    "#aaaaaa",
    "#555555",
    "#ff5555",
    "#55ff55",
    "#ffff55",
    "#5555ff",
    "#ff55ff",
    "#55ffff",
    "#ffffff"
  ];
  var DEC_SPECIAL = {
    95: " ",
    96: "◆",
    97: "▒",
    98: "␉",
    99: "␌",
    100: "␍",
    101: "␊",
    102: "°",
    103: "±",
    104: "␤",
    105: "␋",
    106: "┘",
    107: "┐",
    108: "┌",
    109: "└",
    110: "┼",
    111: "⎺",
    112: "⎻",
    113: "─",
    114: "⎼",
    115: "⎽",
    116: "├",
    117: "┤",
    118: "┴",
    119: "┬",
    120: "│",
    121: "≤",
    122: "≥",
    123: "π",
    124: "≠",
    125: "£",
    126: "·"
  };
  var Terminal = class {
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
    keys = /* @__PURE__ */ new Set();
    keyHandlers = [];
    tabs = /* @__PURE__ */ new Set();
    gset = {
      G0: "ascii",
      G1: "ascii",
      G2: "ascii",
      G3: "ascii"
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
    gl = "G0";
    singleShift = null;
    lastGlyph = null;
    saved;
    audio = null;
    state = "ground";
    params = [];
    intermediates = "";
    privateMarker = "";
    csiInvalid = false;
    digits = "";
    sawDigit = false;
    numberCommitted = false;
    fillingSub = false;
    stringKind = "osc";
    /** Build a cell buffer and paint it through `options.canvas`, or a new canvas. */
    constructor(options = {}) {
      this.cols = options.cols ?? 40;
      this.rows = options.rows ?? 12;
      this.cellWidth = options.cellWidth ?? 16;
      this.cellHeight = options.cellHeight ?? 20;
      this.canvas = options.canvas ?? new Canvas({
        width: this.cols * this.cellWidth,
        height: this.rows * this.cellHeight
      });
      this.cells = [];
      this.fillBlank();
      this.resetTabs();
      this.saved = this.capture();
      this.canvas.add(this, options.layer ?? "terminal");
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
      this.cells[row][col] = typeof value === "string" ? this.ink(value) : { ...value };
      this.flush();
    }
    /** Copy the cell at a column and row. Out-of-range reads are a space. */
    get(col, row) {
      if (!this.inRange(col, row))
        return { ch: " " };
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
      if (bg === void 0)
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
      return this.replies.shift() ?? "";
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
      ctx.fillStyle = "#9ee";
      ctx.fillRect(barX, barY, width, 2);
      ctx.restore();
    }
    paintCell(ctx, cell, x, y, width, height, size) {
      let fg = cssColor(cell, "fg") ?? "#eeeeee";
      let bg = cssColor(cell, "bg");
      if (cell.reverse) {
        const ink = bg ?? "#000000";
        bg = fg;
        fg = ink;
      }
      ctx.globalAlpha = 1;
      if (bg) {
        ctx.fillStyle = bg;
        ctx.fillRect(x, y, width, height);
      }
      const hidden = cell.conceal === true;
      const glyph = !hidden && !!cell.ch && cell.ch !== " ";
      const underline = hidden ? 0 : cell.underline ?? 0;
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
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
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
      if (code === 0 || code === 127)
        return;
      if (code === 24 || code === 26) {
        this.ground();
        return;
      }
      if (code === 27) {
        if (this.state === "string") {
          this.state = "string-esc";
          return;
        }
        this.ground();
        this.state = "escape";
        return;
      }
      switch (this.state) {
        case "ground":
          this.feedGround(ch, code);
          return;
        case "escape":
        case "esc-intermediate":
          this.feedEscape(ch, code);
          return;
        case "csi":
          this.feedCsi(ch, code);
          return;
        case "string":
          this.feedString(code);
          return;
        case "string-esc":
          this.feedStringEsc(ch);
          return;
        default:
          this.ground();
      }
    }
    feedGround(ch, code) {
      if (code < 32) {
        this.executeC0(code);
        return;
      }
      if (code >= 128 && code <= 159) {
        this.executeC1(code);
        return;
      }
      this.writeGraphic(ch);
    }
    feedEscape(ch, code) {
      if (code < 32) {
        this.executeC0(code);
        return;
      }
      if (code >= 128 && code <= 159) {
        this.ground();
        this.executeC1(code);
        return;
      }
      if (code >= 32 && code <= 47) {
        if (this.state === "escape")
          this.intermediates = "";
        this.state = "esc-intermediate";
        if (this.intermediates.length < 2)
          this.intermediates += ch;
        return;
      }
      if (code >= 48 && code <= 126) {
        const intermediate = this.state === "esc-intermediate" ? this.intermediates : "";
        this.runEsc(ch, intermediate);
        return;
      }
      this.ground();
      this.writeGraphic(ch);
    }
    feedCsi(ch, code) {
      if (code < 32) {
        this.executeC0(code);
        return;
      }
      if (code >= 128 && code <= 159) {
        this.ground();
        this.executeC1(code);
        return;
      }
      if (code > 126) {
        this.ground();
        this.writeGraphic(ch);
        return;
      }
      if (ch === ";" || ch === ":") {
        this.commitNumber();
        if (ch === ";") {
          if (this.params.length < 32)
            this.params.push({ value: null, sub: [] });
          this.fillingSub = false;
        } else {
          this.fillingSub = true;
        }
        this.numberCommitted = false;
        return;
      }
      if (ch >= "0" && ch <= "9") {
        if (this.intermediates.length > 0 || this.numberCommitted) {
          this.csiInvalid = true;
          return;
        }
        this.sawDigit = true;
        if (this.digits.length < 6)
          this.digits += ch;
        return;
      }
      if (ch === "<" || ch === "=" || ch === ">" || ch === "?") {
        const fresh = !this.sawDigit && !this.numberCommitted && !this.fillingSub && this.params.length === 1 && this.privateMarker === "" && this.intermediates === "";
        if (fresh)
          this.privateMarker = ch;
        else
          this.csiInvalid = true;
        return;
      }
      if (code >= 32 && code <= 47) {
        this.commitNumber();
        if (this.intermediates.length < 2)
          this.intermediates += ch;
        else
          this.csiInvalid = true;
        return;
      }
      if (code >= 64 && code <= 126) {
        this.commitNumber();
        this.dispatchCsi(ch);
        this.ground();
      }
    }
    feedString(code) {
      if (code === 156 || code === 7 && this.stringKind === "osc") {
        this.ground();
        return;
      }
    }
    feedStringEsc(ch) {
      if (ch === "\\") {
        this.ground();
        return;
      }
      this.ground();
      this.state = "escape";
      this.feed(ch);
    }
    executeC0(code) {
      switch (code) {
        case 7:
          this.bell();
          return;
        case 8:
          this.backspace();
          return;
        case 9:
          this.tab(1, 1);
          return;
        case 10:
        case 11:
        case 12:
          this.lineFeed();
          return;
        case 13:
          this.carriageReturn();
          return;
        case 14:
          this.gl = "G1";
          return;
        case 15:
          this.gl = "G0";
          return;
        default:
          return;
      }
    }
    executeC1(code) {
      switch (code) {
        case 132:
          this.indexDown();
          return;
        case 133:
          this.nextLine();
          return;
        case 136:
          this.setTab();
          return;
        case 141:
          this.reverseIndex();
          return;
        case 142:
          this.singleShift = "G2";
          return;
        case 143:
          this.singleShift = "G3";
          return;
        case 144:
          this.beginString("dcs");
          return;
        case 152:
        case 158:
        case 159:
          this.beginString("sos");
          return;
        case 155:
          this.enterCsi();
          return;
        case 157:
          this.beginString("osc");
          return;
        default:
          return;
      }
    }
    runEsc(final, intermediate) {
      this.ground();
      if (intermediate === "(" || intermediate === ")" || intermediate === "*" || intermediate === "+" || intermediate === "-" || intermediate === "." || intermediate === "/") {
        this.designate(intermediate, final);
        return;
      }
      if (intermediate !== "")
        return;
      switch (final) {
        case "[":
          this.enterCsi();
          return;
        case "]":
          this.beginString("osc");
          return;
        case "P":
          this.beginString("dcs");
          return;
        case "X":
        case "^":
        case "_":
          this.beginString("sos");
          return;
        case "\\":
          return;
        case "D":
          this.indexDown();
          return;
        case "E":
          this.nextLine();
          return;
        case "H":
          this.setTab();
          return;
        case "M":
          this.reverseIndex();
          return;
        case "c":
          this.resetTerminal();
          return;
        case "7":
          this.saveCursor();
          return;
        case "8":
          this.restoreCursor();
          return;
        case "N":
          this.singleShift = "G2";
          return;
        case "O":
          this.singleShift = "G3";
          return;
        case "n":
          this.gl = "G2";
          return;
        case "o":
          this.gl = "G3";
          return;
        default:
          return;
      }
    }
    dispatchCsi(final) {
      if (this.csiInvalid || this.privateMarker)
        return;
      if (this.intermediates === " ") {
        if (final === "@")
          this.scrollLeft(this.pn(0));
        else if (final === "A")
          this.scrollRight(this.pn(0));
        return;
      }
      if (this.intermediates !== "")
        return;
      switch (final) {
        case "@":
          this.insertChars(this.pn(0));
          return;
        case "A":
          this.moveBy(0, -this.pn(0));
          return;
        case "B":
          this.moveBy(0, this.pn(0));
          return;
        case "C":
          this.moveBy(this.pn(0), 0);
          return;
        case "D":
          this.moveBy(-this.pn(0), 0);
          return;
        case "E":
          this.place(0, this.cursor.row + this.pn(0));
          return;
        case "F":
          this.place(0, this.cursor.row - this.pn(0));
          return;
        case "G":
          this.place(this.pn(0) - 1, this.cursor.row);
          return;
        case "H":
          this.place(this.pn(1) - 1, this.pn(0) - 1);
          return;
        case "I":
          this.tab(1, this.pn(0));
          return;
        case "J":
          this.eraseDisplay(this.ps(0));
          return;
        case "K":
          this.eraseLine(this.ps(0));
          return;
        case "L":
          this.insertLines(this.pn(0));
          return;
        case "M":
          this.deleteLines(this.pn(0));
          return;
        case "P":
          this.deleteChars(this.pn(0));
          return;
        case "S":
          this.scrollUp(this.pn(0));
          return;
        case "T":
          this.scrollDown(this.pn(0));
          return;
        case "X":
          this.eraseChars(this.pn(0));
          return;
        case "Z":
          this.tab(-1, this.pn(0));
          return;
        case "`":
          this.place(this.pn(0) - 1, this.cursor.row);
          return;
        case "a":
          this.moveBy(this.pn(0), 0);
          return;
        case "b":
          this.repeat(this.repeatCount());
          return;
        case "c":
          this.deviceAttributes();
          return;
        case "d":
          this.place(this.cursor.col, this.pn(0) - 1);
          return;
        case "e":
          this.moveBy(0, this.pn(0));
          return;
        case "f":
          this.place(this.pn(1) - 1, this.pn(0) - 1);
          return;
        case "g":
          this.clearTabs(this.ps(0));
          return;
        case "h":
          this.setMode(true);
          return;
        case "l":
          this.setMode(false);
          return;
        case "m":
          this.selectRendition();
          return;
        case "n":
          this.deviceStatus();
          return;
        case "s":
          this.saveCursor();
          return;
        case "u":
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
      return Math.min(value, 1e4);
    }
    enterCsi() {
      this.state = "csi";
      this.params = [{ value: null, sub: [] }];
      this.intermediates = "";
      this.privateMarker = "";
      this.csiInvalid = false;
      this.digits = "";
      this.sawDigit = false;
      this.numberCommitted = false;
      this.fillingSub = false;
    }
    beginString(kind) {
      this.stringKind = kind;
      this.state = "string";
    }
    ground() {
      this.state = "ground";
      this.params = [];
      this.intermediates = "";
      this.privateMarker = "";
      this.csiInvalid = false;
      this.digits = "";
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
        } else {
          current.value = value;
        }
      }
      this.digits = "";
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
      if (code < 32 || code > 126)
        return ch;
      const set = this.gset[slot];
      if (set === "dec")
        return DEC_SPECIAL[code] ?? ch;
      if (set === "uk" && code === 35)
        return "£";
      return ch;
    }
    designate(intermediate, final) {
      const slot = intermediate === "(" ? "G0" : intermediate === ")" || intermediate === "-" ? "G1" : intermediate === "*" || intermediate === "." ? "G2" : intermediate === "+" || intermediate === "/" ? "G3" : null;
      if (!slot)
        return;
      this.gset[slot] = final === "0" ? "dec" : final === "A" ? "uk" : "ascii";
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
        } else if (this.cursor.col <= 0) {
          this.cursor.col = 0;
          break;
        } else {
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
      const times = Math.min(count, 1e4);
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
        line.push({ ch: " " });
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
      } else {
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
        line[col] = { ch: " " };
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
          line.push({ ch: " " });
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
          const channel = code === 38 ? "fg" : "bg";
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
        this.setIndex("fg", code - 30);
        return;
      }
      if (code >= 40 && code <= 47) {
        this.setIndex("bg", code - 40);
        return;
      }
      if (code >= 90 && code <= 97) {
        this.setIndex("fg", code - 82);
        return;
      }
      if (code >= 100 && code <= 107) {
        this.setIndex("bg", code - 92);
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
      if (channel === "fg") {
        this.fg = index;
        this.fgRgb = null;
        return;
      }
      this.bg = index;
      this.bgRgb = null;
    }
    setRgb(channel, r, g, b) {
      const rgb = { r: byte(r), g: byte(g), b: byte(b) };
      if (channel === "fg") {
        this.fgRgb = rgb;
        this.fg = null;
        return;
      }
      this.bgRgb = rgb;
      this.bg = null;
    }
    clearChannel(channel) {
      if (channel === "fg") {
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
      this.reply("\x1B[?0c");
    }
    deviceStatus() {
      const request = this.ps(0);
      if (request === 5) {
        this.reply("\x1B[0n");
        return;
      }
      if (request !== 6)
        return;
      const row = clamp(this.cursor.row + 1, 1, Math.max(1, this.rows));
      const col = clamp(this.cursor.col + 1, 1, Math.max(1, this.cols));
      this.reply(`\x1B[${row};${col}R`);
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
        gset: { ...this.gset }
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
      this.gl = "G0";
      this.singleShift = null;
      this.gset.G0 = "ascii";
      this.gset.G1 = "ascii";
      this.gset.G2 = "ascii";
      this.gset.G3 = "ascii";
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
      if (typeof AudioCtor !== "function")
        return;
      try {
        const audio = this.audio ?? new AudioCtor();
        this.audio = audio;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = "square";
        osc.frequency.value = 880;
        gain.gain.value = 0.04;
        osc.connect(gain);
        gain.connect(audio.destination);
        const stopAt = audio.currentTime + 0.04;
        gain.gain.exponentialRampToValueAtTime(1e-4, stopAt);
        osc.start();
        osc.stop(stopAt);
      } catch {
      }
    }
    armKeys() {
      if (typeof window === "undefined" || typeof window.addEventListener !== "function")
        return;
      window.addEventListener("keydown", (event) => {
        this.keys.add(event.key);
        for (const handler of this.keyHandlers)
          handler(event.key);
      });
      window.addEventListener("keyup", (event) => {
        this.keys.delete(event.key);
      });
    }
  };
  function blankRow(cols) {
    const row = [];
    for (let col = 0; col < cols; col += 1)
      row.push({ ch: " " });
    return row;
  }
  function blanks(count) {
    return Array.from({ length: count }, () => ({ ch: " " }));
  }
  function cssColor(cell, channel) {
    const rgb = channel === "fg" ? cell.fgRgb : cell.bgRgb;
    if (rgb)
      return `rgb(${rgb.r | 0}, ${rgb.g | 0}, ${rgb.b | 0})`;
    let index = channel === "fg" ? cell.fg : cell.bg;
    if (index == null)
      return null;
    if (channel === "fg" && cell.bright && index >= 0 && index < 8)
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
      const level = (step) => step === 0 ? 0 : 55 + step * 40;
      return `rgb(${level(red)}, ${level(green)}, ${level(blue)})`;
    }
    const gray = 8 + (index - 232) * 10;
    return `rgb(${gray}, ${gray}, ${gray})`;
  }
  function faceFor(cell, size) {
    const weight = cell.bold ? "bold " : "";
    const slant = cell.italic ? "italic " : "";
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
    return typeof ctx.ellipse === "function" && typeof ctx.beginPath === "function" && typeof ctx.stroke === "function";
  }
  function paintEllipse(ctx, x, y, width, height) {
    ctx.beginPath();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 1;
    ctx.ellipse(x + width / 2, y + height / 2, Math.max(1, width / 2 - 1), Math.max(1, height / 2 - 1), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  function directComponents(mode, rest) {
    const need = mode === 4 ? 4 : 3;
    const itu = rest.some((item) => item == null);
    let comps;
    if (itu) {
      if (rest[0] != null && rest[0] !== 0)
        return null;
      comps = rest.slice(1);
    } else if (rest.length === need) {
      comps = rest;
    } else if (rest.length > need && rest[0] === 0) {
      comps = rest.slice(1);
    } else {
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
      b: Math.round(255 * (1 - yellow) * (1 - black))
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

  // dist/engine.js
  var Engine = class {
    canvas;
    sprites = [];
    collisions = [];
    keys = /* @__PURE__ */ new Set();
    audio = null;
    raf = 0;
    running = false;
    inUpdate = false;
    /** Use `options.canvas`, or create one. Does not build page chrome. */
    constructor(options = {}) {
      this.canvas = options.canvas ?? new Canvas({
        width: options.width,
        height: options.height
      });
      this.armKeys();
    }
    /**
     * Create a sprite and place it on a named canvas layer.
     * `size` is the font size in pixels and defaults to 32.
     * `layer` defaults to `default`.
     */
    sprite(emoji, x, y, size = 32, layer = "default") {
      const sprite = new EmojiSprite(emoji, x, y, size, layer);
      this.sprites.push(sprite);
      this.canvas.add(sprite, layer);
      return sprite;
    }
    /** Set per-frame velocity in pixels. */
    motion(sprite, vx, vy) {
      sprite.vx = vx;
      sprite.vy = vy;
    }
    /**
     * Register a callback for living sprites whose circles overlap.
     * The returned function removes this registration. Calling it again does nothing.
     * Two registrations of one function are removed separately.
     */
    onCollision(handler) {
      const entry = { handler };
      this.collisions.push(entry);
      return () => {
        const index = this.collisions.indexOf(entry);
        if (index >= 0)
          this.collisions.splice(index, 1);
      };
    }
    /**
     * Move living sprites by `vx`/`vy`, then report circle overlaps.
     * Pairs are chosen after the move and do not change while handlers run.
     * Throws when called from a collision handler.
     */
    update() {
      if (this.inUpdate) {
        throw new Error("Engine.update cannot be called from a collision handler");
      }
      this.inUpdate = true;
      try {
        const live = [];
        for (const sprite of this.sprites) {
          if (!sprite.alive)
            continue;
          sprite.x += sprite.vx;
          sprite.y += sprite.vy;
          live.push(sprite);
        }
        const pairs = [];
        for (let i = 0; i < live.length; i += 1) {
          for (let j = i + 1; j < live.length; j += 1) {
            const a = live[i];
            const b = live[j];
            if (a === b || !circlesOverlap(a, b))
              continue;
            pairs.push([a, b]);
          }
        }
        const handlers = this.collisions.slice();
        for (const [a, b] of pairs) {
          for (const entry of handlers) {
            if (this.collisions.indexOf(entry) < 0)
              continue;
            entry.handler(a, b);
          }
        }
      } finally {
        this.inUpdate = false;
      }
    }
    /** Start the `requestAnimationFrame` loop. Each frame updates, then draws. */
    start() {
      if (this.running)
        return;
      if (typeof requestAnimationFrame !== "function") {
        throw new Error("requestAnimationFrame is unavailable");
      }
      this.running = true;
      this.raf = requestAnimationFrame(this.tick);
    }
    /** Stop the frame loop. */
    stop() {
      this.running = false;
      if (typeof cancelAnimationFrame === "function")
        cancelAnimationFrame(this.raf);
    }
    /** True while `key` (`KeyboardEvent.key`) is held. */
    isKeyDown(key) {
      return this.keys.has(key);
    }
    /**
     * Play a short square-wave beep.
     * `freq` is Hertz (default 440) and `duration` is milliseconds (default 120).
     * Does nothing when the Web Audio API is missing.
     */
    beep(freq = 440, duration = 120) {
      const AudioCtor = globalThis.AudioContext;
      if (typeof AudioCtor !== "function")
        return;
      try {
        const audio = this.audio ?? new AudioCtor();
        this.audio = audio;
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        osc.type = "square";
        osc.frequency.value = freq;
        gain.gain.value = 0.05;
        osc.connect(gain);
        gain.connect(audio.destination);
        const stopAt = audio.currentTime + duration / 1e3;
        gain.gain.exponentialRampToValueAtTime(1e-4, stopAt);
        osc.start();
        osc.stop(stopAt);
      } catch {
      }
    }
    tick = () => {
      if (!this.running)
        return;
      try {
        this.update();
        this.canvas.draw();
      } catch (error) {
        this.running = false;
        throw error;
      }
      if (!this.running)
        return;
      this.raf = requestAnimationFrame(this.tick);
    };
    armKeys() {
      if (typeof window === "undefined" || typeof window.addEventListener !== "function")
        return;
      window.addEventListener("keydown", (event) => {
        this.keys.add(event.key);
      });
      window.addEventListener("keyup", (event) => {
        this.keys.delete(event.key);
      });
    }
  };
  var EmojiSprite = class {
    emoji;
    x;
    y;
    size;
    vx = 0;
    vy = 0;
    layer;
    alive = true;
    data = {};
    constructor(emoji, x, y, size, layer) {
      this.emoji = emoji;
      this.x = x;
      this.y = y;
      this.size = size;
      this.layer = layer;
    }
    get radius() {
      return this.size / 2;
    }
    draw(ctx, camera) {
      if (!this.alive)
        return;
      paintEmoji(ctx, camera, this.emoji, this.x, this.y, this.size);
    }
  };
  function circlesOverlap(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const reach = a.radius + b.radius;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(reach))
      return false;
    return dx * dx + dy * dy <= reach * reach;
  }

  // dist/utilities.js
  var Utilities = {
    /**
     * Wrap a target in a column. The header has a title, a middle slot, and a
     * fullscreen button. The footer is a plain div. Either bar can be omitted.
     */
    wrap(target, options = {}) {
      const surface = resolveElement(target);
      const showHeader = options.header !== false;
      const showFooter = options.footer !== false;
      const wrap = document.createElement("div");
      wrap.className = "ee-wrap";
      assign(wrap, {
        display: "flex",
        flexDirection: "column",
        width: "fit-content",
        background: "#16161a",
        color: "#f2f2f2",
        fontFamily: "sans-serif",
        fontSize: "14px"
      });
      let titleEl = null;
      let headerMiddle = null;
      if (showHeader) {
        const header = document.createElement("header");
        header.className = "ee-header";
        assign(header, {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 10px"
        });
        titleEl = document.createElement("span");
        titleEl.className = "ee-title";
        titleEl.textContent = options.title ?? "";
        assign(titleEl, { fontWeight: "600" });
        headerMiddle = document.createElement("div");
        headerMiddle.className = "ee-middle";
        assign(headerMiddle, {
          flex: "1 1 auto",
          textAlign: "center",
          minWidth: "0"
        });
        const button = document.createElement("button");
        button.className = "ee-fullscreen";
        button.textContent = "Fullscreen";
        button.setAttribute("type", "button");
        button.setAttribute("aria-label", "Fullscreen");
        assign(button, {
          marginLeft: "8px",
          cursor: "pointer",
          background: "transparent",
          color: "inherit",
          border: "1px solid #666",
          borderRadius: "4px",
          padding: "2px 8px"
        });
        button.addEventListener("click", () => toggleFullscreen(wrap));
        header.append(titleEl, headerMiddle, button);
        wrap.append(header);
      }
      assign(surface, { display: "block" });
      wrap.append(surface);
      let footer = null;
      if (showFooter) {
        footer = document.createElement("div");
        footer.className = "ee-footer";
        assign(footer, {
          padding: "4px 10px",
          minHeight: "1.4em",
          fontFamily: "ui-monospace, monospace",
          fontSize: "12px"
        });
        wrap.append(footer);
      }
      return {
        wrap,
        headerMiddle,
        footer,
        setTitle(title) {
          if (titleEl)
            titleEl.textContent = title;
        }
      };
    }
  };
  function resolveElement(target) {
    if (isElement(target))
      return target;
    if (isElementHost(target))
      return target.element;
    if (isCanvasHost(target))
      return target.canvas.element;
    throw new TypeError("Utilities.wrap target must be an element, a Canvas, or an object with a canvas");
  }
  function isElement(value) {
    return typeof value === "object" && value !== null && "nodeType" in value && value.nodeType === 1;
  }
  function isElementHost(value) {
    return typeof value === "object" && value !== null && "element" in value && isNodeElement(value.element);
  }
  function isCanvasHost(value) {
    if (typeof value !== "object" || value === null || !("canvas" in value))
      return false;
    const canvas = value.canvas;
    return typeof canvas === "object" && canvas !== null && "element" in canvas && isNodeElement(canvas.element);
  }
  function isNodeElement(value) {
    return typeof value === "object" && value !== null && "nodeType" in value && value.nodeType === 1;
  }
  function assign(element, rules) {
    Object.assign(element.style, rules);
  }
  function toggleFullscreen(wrap) {
    const request = document.fullscreenElement ? document.exitFullscreen() : wrap.requestFullscreen();
    void request.catch(() => {
    });
  }
  return __toCommonJS(index_exports);
})();
globalThis.EmojiEngine = EmojiEngine;
