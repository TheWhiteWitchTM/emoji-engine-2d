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
  var PALETTE = [
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
    /** Bright flag stored on cells written from now on. */
    bright = false;
    cellWidth;
    cellHeight;
    cells;
    keys = /* @__PURE__ */ new Set();
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
        height: this.rows * this.cellHeight
      });
      this.cells = [];
      this.fillBlank();
      this.canvas.add(this, options.layer ?? "terminal");
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
      this.cells[row][col] = typeof value === "string" ? this.ink(value) : { ...value };
      this.flush();
    }
    /** Copy the cell at a column and row. Out-of-range reads are a space. */
    get(col, row) {
      if (!this.inRange(col, row))
        return { ch: " " };
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
          const background = cssColor(cell, "bg");
          if (background) {
            ctx.fillStyle = background;
            ctx.fillRect(x, y, width, height);
          }
          if (cell.ch && cell.ch !== " ") {
            ctx.fillStyle = cssColor(cell, "fg") ?? "#eeeeee";
            ctx.font = `${Math.floor(height * 0.8)}px monospace`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(cell.ch, x + width / 2, y + height / 2);
          }
        }
      }
      const barX = this.cursor.col * width;
      const barY = (this.cursor.row + 1) * height - 2;
      ctx.fillStyle = "#9ee";
      ctx.fillRect(barX, barY, width, 2);
      ctx.restore();
    }
    typeChar(ch) {
      if (ch === "\n") {
        this.cursor.col = 0;
        this.cursor.row += 1;
        this.scrollIntoView();
        return;
      }
      if (ch === "\r") {
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
  function cssColor(cell, channel) {
    const rgb = channel === "fg" ? cell.fgRgb : cell.bgRgb;
    if (rgb)
      return `rgb(${rgb.r | 0}, ${rgb.g | 0}, ${rgb.b | 0})`;
    let index = channel === "fg" ? cell.fg : cell.bg;
    if (index == null)
      return null;
    if (channel === "fg" && cell.bright && index >= 0 && index < 8)
      index += 8;
    return PALETTE[index] ?? null;
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
