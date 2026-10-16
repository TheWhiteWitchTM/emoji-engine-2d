# emoji-engine-2d

A small, interface-driven 2D engine for emoji-native games.

It supports two complementary styles in one package:

- **Terminal / cell-buffer** games (VT100-style, roguelikes, classic text adventures, grid-based titles)
- **Free pixel / sprite** games (TI-Extended-BASIC-inspired sprites, layers, camera, collision callbacks)

Both styles share the same Canvas underneath. You can mix them. Header and footer chrome are optional and live in Utilities, which the other three pieces never construct.

Designed for the kind of games that lived between the late 1970s and the early 2000s — terminal classics, sprite-based arcade and adventure games, and modern emoji reinterpretations of them — while remaining lightweight enough to embed or extend.

## Features

- Canvas with named layers, a camera, and `drawEmoji`
- Sprites you place on any layer, move with `vx` / `vy`, and collide as circles
- Terminal cell buffer (cursor, 16-color cells, batched redraw) that paints through a Canvas, ignores the camera, and exposes that canvas
- Optional Utilities chrome: title, middle slot, fullscreen button, plain footer div
- `isKeyDown`, `onKey`, and a short `beep`
- Plain JavaScript in `dist/` for an `import` or a script tag

The surface is intentionally small. Tilemaps, animation, and scenes can grow on top of these four pieces.

## Install and run the demo

```bash
npm install
npm run demo
```

`npm install` compiles `src/` into `dist/`. `npm run build` does that again after you change the TypeScript. The demo imports the built files with Node, so it does not need tsx. It wraps a canvas, writes two lines through a Terminal, places a witch and a moving hunter on different layers, and exits when the collision callback fires:

```text
Witch Hunt
A hunter crosses the heath.
🧙‍♀️ hit ✝️
demo ok
```

Under Node the example installs a tiny DOM stand-in (`examples/dom-shim.js`) so those classes can be constructed. Browsers already have `document` and `requestAnimationFrame`, and the stand-in stays dormant there.

The same scene is in `examples/play.html`. From the repository root:

```bash
python3 -m http.server 8765
```

Open `http://localhost:8765/examples/play.html`. It loads `dist/emoji-engine-2d.js`, so run `npm run build` first. Arrow keys steer the witch. The footer reads `browser ok` when the page's own checks pass.

## Use the API

After `npm install`, import the built module. From this repository that path is `./dist/index.js`. A project that depends on this package imports `emoji-engine-2d` instead.

```js
import { Engine, Terminal, Utilities } from './dist/index.js';

const engine = new Engine({ width: 800, height: 600 });
const ui = Utilities.wrap(engine.canvas, { title: 'Witch Hunt' });
document.body.appendChild(ui.wrap);
ui.headerMiddle.textContent = 'score 0';
ui.footer.textContent = 'ready';

const term = new Terminal({ cols: 40, rows: 6, canvas: engine.canvas });
term.write('The heath is quiet.\n');

const witch = engine.sprite('🧙‍♀️', 400, 300, 48);
const hunter = engine.sprite('✝️', 100, 300, 36, 'entities');
engine.motion(hunter, 1.2, 0.3);

const off = engine.onCollision((a, b) => {
  console.log(a.emoji, 'hit', b.emoji);
  engine.beep(523, 80);
  off();
});

engine.start();
```

A page can load the same constructors from the script build. `EmojiEngine` is the global. `dist/emoji-engine-2d.min.js` is the same script, minified.

```html
<script src="./dist/emoji-engine-2d.min.js"></script>
<script>
  const { Engine, Terminal, Utilities } = EmojiEngine;
</script>
```

`<script type="module">` can import `./dist/index.js` instead. `sprite` takes `(emoji, x, y, size = 32, layer = 'default')`. Velocity is pixels per frame. Pass `header: false` or `footer: false` to `wrap` when you want one bar or neither. `onCollision` returns a function that removes that callback.

`dist/index.js` exports `Canvas`, `Terminal`, `Engine`, and `Utilities`. TypeScript declarations are in `dist/index.d.ts`.

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — the four pieces and how a frame runs
- [INTERFACES.md](INTERFACES.md) — the contracts the source implements

## License

MIT. See [LICENSE](LICENSE).
