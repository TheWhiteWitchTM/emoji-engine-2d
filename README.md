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
- Terminal cell buffer (cursor, 16-color cells, batched redraw) that paints through a Canvas and exposes it
- Optional Utilities chrome: title, middle slot, fullscreen button, plain footer div
- `isKeyDown`, `onKey`, and a short `beep`
- TypeScript source you can run directly with tsx

The surface is intentionally small. Tilemaps, animation, and scenes can grow on top of these four pieces.

## Run the demo

```bash
npm install
npm run demo
```

`npx tsx examples/demo.ts` is the same command. The demo wraps a canvas, writes two lines through a Terminal, places a witch and a moving hunter on different layers, and exits when the collision callback fires:

```text
Witch Hunt
A hunter crosses the heath.
🧙‍♀️ hit ✝️
demo ok
```

Under Node the example installs a tiny DOM stand-in (`examples/dom-shim.ts`) so those classes can be constructed. Browsers already have `document` and `requestAnimationFrame`, and the stand-in stays dormant there.

## Use the API

```js
import { Engine, Terminal, Utilities } from './src/index.ts';

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

engine.onCollision((a, b) => {
  console.log(a.emoji, 'hit', b.emoji);
  engine.beep(523, 80);
});

engine.start();
```

`sprite` takes `(emoji, x, y, size = 32, layer = 'default')`. Velocity is pixels per frame. Pass `header: false` or `footer: false` to `wrap` when you want one bar or neither.

`src/index.ts` re-exports `Canvas`, `Terminal`, `Engine`, `Utilities`, and the supporting types.

## Docs

- [ARCHITECTURE.md](ARCHITECTURE.md) — the four pieces and how a frame runs
- [INTERFACES.md](INTERFACES.md) — the contracts the source implements

## License

MIT. See [LICENSE](LICENSE).
