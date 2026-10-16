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
  fg?: number | null;
  bg?: number | null;
  fgRgb?: { r: number; g: number; b: number } | null;
  bgRgb?: { r: number; g: number; b: number } | null;
  bright?: boolean;
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

  /** Write text at the cursor. Honors \n and \r, wraps, and scrolls. */
  write(text: string): void;

  /** Write one code point at the cursor and advance. */
  put(ch: string): void;

  /** Replace one cell. A string uses the current colors. Out of range is ignored. */
  set(col: number, row: number, value: Cell | string): void;

  /** Copy one cell. Out of range returns a space. */
  get(col: number, row: number): Cell;

  /** Fill the buffer with spaces and move the cursor home. */
  clear(): void;

  /** Set the colors for later write and put calls. bg keeps its current value when omitted. */
  color(fg: number | null, bg?: number | null): void;

  /** Hold redraws. Calls may nest. */
  beginFrame(): void;

  /** Release one beginFrame. The outermost call redraws if the buffer changed. */
  endFrame(): void;

  /** Keydown subscription. key is KeyboardEvent.key. */
  onKey(handler: KeyHandler): void;

  /** True while key (KeyboardEvent.key) is held. */
  isKeyDown(key: string): boolean;

  /**
   * Paint the grid in screen space. The camera argument is ignored,
   * so a following view does not scroll the cells.
   */
  draw(ctx: CanvasRenderingContext2D, camera: Point): void;
}
```

Color indexes use the classic 16-color palette. `bright` draws foreground indexes 0–7 as 8–15. `fgRgb` and `bgRgb` override the index on that cell. A null background does not fill the cell.

`write` iterates code points, so a multi-code-point emoji occupies several cells. `put` keeps the first code point and drops the rest.

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

`examples/demo.js` is this scene with positions that meet, plus checks for the wrap, the terminal buffer, the layers, the camera, and collision. It imports `../dist/index.js`. `npm run demo` builds, then runs it with Node. The script-tag build is `dist/emoji-engine-2d.js`, which assigns `globalThis.EmojiEngine`.
