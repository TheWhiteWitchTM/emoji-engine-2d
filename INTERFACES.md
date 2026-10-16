# Public interfaces

These four interfaces are the contract for emoji-engine-2d. The classes in `src/` implement them, and `src/index.ts` exports the classes plus the supporting types below. `npm run build` writes that same module to `dist/index.js`, with declarations in `dist/index.d.ts`.

The shapes are ordinary TypeScript interfaces, so plain JavaScript can call the same methods.

## Supporting types

```ts
interface Point {
  x: number;
  y: number;
}

interface Drawable {
  draw(ctx: CanvasRenderingContext2D, camera: Point): void;
}

interface Sprite extends Drawable {
  emoji: string;
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  layer: string;
  alive: boolean;
  /** Collision radius in pixels (circle test). Always `size / 2`. */
  readonly radius: number;
  data: Record<string, unknown>;
}

interface Cell {
  ch: string;
  fg?: number | null;   // 0–255, or null when fgRgb or the default ink is used
  bg?: number | null;   // 0–255; null and omitted stay transparent
  fgRgb?: { r: number; g: number; b: number } | null;
  bgRgb?: { r: number; g: number; b: number } | null;
  bright?: boolean;     // foreground indexes 0–7 draw as 8–15
  bold?: boolean;       // SGR bold face; not implied by bright
  faint?: boolean;
  italic?: boolean;
  underline?: 1 | 2;    // 1 single, 2 ECMA-48 double
  blink?: 1 | 2;        // stored; the glyph stays visible
  reverse?: boolean;
  conceal?: boolean;
  strike?: boolean;
  overline?: boolean;
  framed?: boolean;
  encircled?: boolean;
  fraktur?: boolean;
  font?: number;        // alternate font 1–9; the grid stays monospace
}

interface CanvasOptions {
  width?: number;  // default 800
  height?: number; // default 600
}

interface TerminalOptions {
  cols?: number;       // default 40
  rows?: number;       // default 12
  canvas?: Canvas;     // created from the grid size when omitted
  cellWidth?: number;  // default 16
  cellHeight?: number; // default 20
  layer?: string;      // default "terminal"
}

interface EngineOptions {
  width?: number;   // default 800, ignored when canvas is passed
  height?: number;  // default 600, ignored when canvas is passed
  canvas?: Canvas;
}

type WrapTarget =
  | HTMLElement
  | { element: HTMLElement }                 // Canvas
  | { canvas: { element: HTMLElement } };    // Engine or Terminal

interface WrapOptions {
  title?: string;
  header?: boolean; // default true
  footer?: boolean; // default true
}

interface WrapResult {
  wrap: HTMLElement;
  headerMiddle: HTMLElement | null;
  footer: HTMLElement | null;
  setTitle(title: string): void;
}

type CollisionHandler = (a: Sprite, b: Sprite) => void;
type KeyHandler = (key: string) => void;
```

`vx` and `vy` are pixels per `Engine.update`. `data` is an empty object the game can hang its own state on.

## Canvas

Constructed with `new Canvas(options?: CanvasOptions)`. The element is not inserted into the document.

```ts
interface Canvas {
  readonly element: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** World point drawn at the top-left of the bitmap. */
  readonly camera: Point;

  /** Draw one emoji centered on a world position. */
  drawEmoji(emoji: string, x: number, y: number, size: number): void;

  /**
   * Add a drawable to a named layer. The layer is created on first use.
   * Paint order is the order layers were first created, back to front.
   * Re-adding a drawable moves it.
   */
  add(drawable: Drawable, layer?: string): void;

  /** Remove a drawable. The layer keeps its place in the paint order. */
  remove(drawable: Drawable): void;

  /** Apply follow, clear the bitmap, and paint every layer. */
  draw(): void;

  /** Clear the bitmap. Drawables stay registered. */
  clear(): void;

  /** Move the camera. Ignored on later draws while a follow target is set. */
  setCamera(x: number, y: number): void;

  /**
   * Center this point during draw. Pass null to stop.
   * The camera stays where the last draw left it.
   */
  follow(target: Point | null): void;
}
```

`layer` defaults to `"default"`. World pixels map to the bitmap as `(x - camera.x, y - camera.y)`. The emoji is centered on that pixel.

## Terminal

Constructed with `new Terminal(options?: TerminalOptions)`. The terminal adds itself to its canvas as a drawable. `canvas` on the instance is the surface it paints through.

```ts
interface Terminal extends Drawable {
  readonly cols: number;
  readonly rows: number;
  readonly canvas: Canvas;

  /** Write position. Assign col and row to move it. */
  readonly cursor: { col: number; row: number };
  /** Foreground index used by write and put. Default 15. */
  fg: number | null;
  /** Background index used by write and put. Default null (transparent). */
  bg: number | null;
  /** Stored on cells written from now on. Default false. */
  bright: boolean;

  /**
   * Write text at the cursor.
   * Obeys ECMA-48 / ANSI X3.64, wraps, and scrolls.
   * \n, VT, and FF are line feeds. Newline mode starts on, so they
   * also return to column 0. CSI 20 l keeps the column.
   */
  write(text: string): void;

  /** Feed one code point through the same parser as write, then redraw. */
  put(ch: string): void;

  /** Replace one cell. A string is stored as-is and is not parsed. Out of range is ignored. */
  set(col: number, row: number, value: Cell | string): void;

  /** Copy one cell. Out of range returns a space. */
  get(col: number, row: number): Cell;

  /** Fill the buffer with spaces and move the cursor home. The pen is kept. */
  clear(): void;

  /**
   * Set the color indexes for later write and put calls.
   * An omitted bg is kept, including a direct-color background.
   * The fg index replaces a direct-color foreground.
   */
  color(fg: number | null, bg?: number | null): void;

  /** Hold redraws. Calls may nest. */
  beginFrame(): void;

  /** Release one beginFrame. The outermost call redraws if the buffer changed. */
  endFrame(): void;

  /** Keydown subscription. key is KeyboardEvent.key. */
  onKey(handler: KeyHandler): void;

  /** True while key (KeyboardEvent.key) is held. */
  isKeyDown(key: string): boolean;

  /** Next device report, or '' when none is waiting. */
  readReply(): string;

  /**
   * Paint the grid in screen space. The camera argument is ignored,
   * so a following view does not scroll the cells.
   */
  draw(ctx: CanvasRenderingContext2D, camera: Point): void;
}
```

Indexes 0–15 use the classic palette (`#aa5500` is color 3). `bright` draws foreground indexes 0–7 as 8–15 and does not change the font. Indexes 16–231 are the 6×6×6 cube (`0` is 0, otherwise `55 + step * 40`) and 232–255 are gray `8 + 10 * (index - 232)`. `fgRgb` and `bgRgb` override the index. A null background does not fill the cell, including after erase, scroll, and `clear`.

`write` and `put` parse ECMA-48. The sequences that change the buffer:

| Sequence | Effect |
| --- | --- |
| CUU CUD CUF CUB CNL CPL CHA CUP VPA HVP HPA HPR VPR | Move. Stops at the edge. `0` and omitted mean 1. Does not scroll. |
| IND `ESC D`, RI `ESC M`, NEL `ESC E`, LF VT FF CR BS HT | Index scrolls at the bottom. Reverse index scrolls at the top. |
| ED EL ECH ICH DCH IL DL SU SD, SL `CSI Pn SP @`, SR `CSI Pn SP A` | Edit. Erased cells are uncolored spaces. ED 2 does not home. ED 3 is ignored. |
| SGR | Rendition and color, below. |
| SM RM | Mode 4 is insert. Mode 20 is newline. Other modes are ignored. |
| HTS TBC CHT CBT | Tabs. Default stops are every 8 columns. |
| REP | Repeat the preceding graphic with the current pen. Omitted means 1. `0` repeats nothing. |
| DA DSR | `CSI c` replies `CSI ? 0 c`. `CSI 5 n` replies `CSI 0 n`. `CSI 6 n` replies `CSI r ; c R`, 1-based. |
| `ESC 7` / `ESC 8`, `CSI s` / `CSI u` | DEC and SCO save and restore of the cursor, the pen, and the character sets. |
| `ESC c` | Reset the screen, the pen, the sets, and the tabs. |
| `ESC (`, `ESC )`, `ESC *`, `ESC +` | Designate a set: `B` ASCII, `A` UK, `0` DEC special graphics. |

SGR 0 resets the pen to foreground 15, a transparent background, and no rendition. 1 is bold and bright, 2 faint, 3 italic, 4 underline, 5 slow blink, 6 rapid blink, 7 reverse, 8 conceal, 9 strike, 10–19 fonts, 20 fraktur, 21 double underline, 22 normal intensity, 23 not italic or fraktur, 24 not underlined, 25 steady, 27 positive, 28 revealed, 29 not struck, 30–37 and 40–47 the classic colors, 39 and 49 the defaults, 51 frame, 52 encircle, 53 overline, 54 and 55 cancel those. 90–97 and 100–107 select palette entries 8–15. They are the usual bright colors, not an ECMA-48 parameter. 38 and 48 take an ISO 8613-6 color: `38:2::r:g:b`, `38:2:0:r:g:b`, `38:5:n`, plus CMY (`:3:`) and CMYK (`:4:`). A color space other than the default is ignored. The shorthand `38:2:r:g:b` and the semicolon forms `38;2;r;g;b` and `38;5;n` are accepted. An empty SGR parameter is 0.

`ESC ( 0` maps the VT100 special-graphics bytes onto the Unicode line-drawing characters (`q` is `─`, `x` is `│`, and the rest of that set). Shift Out invokes G1, Shift In invokes G0, `ESC n` and `ESC o` lock G2 and G3, and `ESC N` and `ESC O` are single shifts. BEL rings when audio is available. Other C0 controls are ignored and are not stored. CAN and SUB cancel a sequence. OSC, DCS, SOS, PM, and APC are discarded through ST (`ESC \`), and OSC also ends on BEL, so they cannot change the palette or the document title. A CSI parameter that starts with `<`, `=`, `>`, or `?` is private and is ignored.

`write` iterates code points, so a multi-code-point emoji occupies several cells. `put` keeps the first code point and drops the rest. A sequence may be split across `write` and `put` calls.

Mutations redraw through `canvas.draw()` unless a `beginFrame` is open. That redraw paints every layer on the shared canvas, including sprites.

`onKey` and `isKeyDown` attach to `window` when it exists. They are independent of `Engine.isKeyDown`.

## Engine

Constructed with `new Engine(options?: EngineOptions)`. Passing `canvas` reuses that surface and ignores `width` and `height`.

```ts
interface Engine {
  readonly canvas: Canvas;

  /**
   * Create a sprite and add it to a named layer.
   * size defaults to 32. layer defaults to "default".
   */
  sprite(emoji: string, x: number, y: number, size?: number, layer?: string): Sprite;

  /** Set per-frame velocity in pixels. */
  motion(sprite: Sprite, vx: number, vy: number): void;

  /**
   * Register a callback for living sprites whose circles overlap.
   * Returns a function that removes this registration.
   */
  onCollision(handler: CollisionHandler): () => void;

  /** Move living sprites, then report overlaps. */
  update(): void;

  /** Run update and canvas.draw on requestAnimationFrame. */
  start(): void;

  /** Cancel the frame loop. */
  stop(): void;

  /** True while key (KeyboardEvent.key) is held. */
  isKeyDown(key: string): boolean;

  /**
   * Play a square-wave beep.
   * freq is Hertz (default 440). duration is milliseconds (default 120).
   * Returns immediately when audio is unavailable.
   */
  beep(freq?: number, duration?: number): void;
}
```

Circle test, evaluated after the move. The layer is ignored. A pair with a non-finite position or a non-finite sum of radii is not a hit.

```text
(ax - bx)² + (ay - by)² <= (a.radius + b.radius)²
a.radius = a.size / 2
```

Each unordered pair of living sprites is collected once per `update`, with the sprite created earlier as `a`. Handlers then run for that fixed list. A handler that moves or kills a sprite does not add or drop pairs until the next update. The callback runs again on the next update if the circles still overlap.

`onCollision` returns a function that removes that registration. Calling it again does nothing. Two registrations of one function are removed separately. A handler removed before its turn does not run for later pairs. A handler registered during an update starts on the next update. Every registration that is still present when a pair is delivered receives that pair. `update` throws if it is called from a collision handler. Sprites with `alive === false` skip motion, collision, and painting.

`start` throws if `requestAnimationFrame` is missing. A second `start` while the loop is running does nothing. `stop` during `update` still lets that frame's `canvas.draw` run, then the loop ends. If `update` or `draw` throws, the loop stops and `start` may be called again.

`isKeyDown` reads `keydown` / `keyup` on `window` when `window.addEventListener` exists. There is no listener on a headless host, so every key reads as up.

## Utilities

`Utilities` is a single object. There is no constructor. Canvas, Terminal, and Engine never call it.

```ts
interface Utilities {
  /**
   * Build an optional header and footer around a target.
   * The header is a title, a middle slot, and a fullscreen button.
   * The footer is a plain div. Either bar can be turned off.
   */
  wrap(target: WrapTarget, options?: WrapOptions): WrapResult;
}
```

`wrap` resolution order:

1. An element (`nodeType === 1`), including a raw `HTMLCanvasElement`.
2. An object with `element`, which is how a Canvas is accepted.
3. An object with `canvas.element`, which is how an Engine or a Terminal is accepted.

The returned column is `header` (optional), then the target element, then the footer `div` (optional). `headerMiddle` is the empty center node of the header, ready for a score or a status string. It is `null` when `options.header` is `false`. `footer` is `null` when `options.footer` is `false`.

`setTitle(title)` replaces the left-hand title. It does nothing when the header was not built.

The fullscreen button calls `requestFullscreen` on the column, or `exitFullscreen` when the document is already fullscreen. A rejected request is ignored.

Class names on the chrome, for styling: `ee-wrap`, `ee-header`, `ee-title`, `ee-middle`, `ee-fullscreen`, `ee-footer`.

## Minimal scene

```js
import { Engine, Terminal, Utilities } from 'emoji-engine-2d';

const engine = new Engine({ width: 800, height: 600 });
const ui = Utilities.wrap(engine.canvas, { title: 'Witch Hunt' });
document.body.appendChild(ui.wrap);

const term = new Terminal({ cols: 40, rows: 4, canvas: engine.canvas });
term.write('Witch Hunt\n');

const witch = engine.sprite('🧙‍♀️', 400, 300, 48);
const hunter = engine.sprite('✝️', 100, 300, 36, 'entities');
engine.motion(hunter, 1.2, 0.3);
const off = engine.onCollision((a, b) => {
  console.log(a.emoji, 'hit', b.emoji);
  off();
});
engine.start();
```

`examples/demo.js` is this scene with positions that meet, plus checks for the wrap, the terminal buffer, the layers, the camera, and collision. It imports `../dist/index.js`. `npm run demo` builds, then runs it with Node. The script-tag builds are `browser/emoji-engine-2d.js` and the minified `browser/emoji-engine-2d.min.js`. Both assign `globalThis.EmojiEngine`.
