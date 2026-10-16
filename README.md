# emoji-engine-2d

A small, interface-driven 2D engine for emoji-native games.

It supports two complementary styles in one package:

- **Terminal / cell-buffer** games (VT100-style, roguelikes, classic text adventures, grid-based titles)
- **Free pixel / sprite** games (TI-Extended-BASIC-inspired sprites, layers, camera, collision callbacks)

Both styles share the same Canvas underneath. You can mix them. Header and footer chrome are optional.

Designed for the kind of games that lived between the late 1970s and the early 2000s — terminal classics, sprite-based arcade and adventure games, and modern emoji reinterpretations of them — while remaining lightweight enough to embed or extend.

## Features

- Pixel-accurate Canvas with named layers and camera
- TI-style sprites: create, give them velocity, receive collision callbacks
- Full Terminal facade (cell buffer, colors, cursor, ANSI subset, drawing primitives) that renders onto the Canvas and exposes it
- Optional Utilities chrome (title bar with middle slot + fullscreen, status footer)
- Input helpers, simple audio beeps, camera follow
- TypeScript-first with clean JavaScript usability
- Intentionally small surface so you can grow it (tilemaps, animation, scenes/chapters, etc.)

## Quick start

```html
<script src="emoji-engine-2d.js"></script>
<script>
  const engine = new Engine({ width: 800, height: 600 });
  const ui = Utilities.wrap(engine.canvas, { title: 'Witch Hunt' });
  document.body.appendChild(ui.wrap);

  const witch = engine.sprite('🧙‍♀️', 400, 300, 48);
  const hunter = engine.sprite('✝️', 100, 100, 36, 'entities');
  engine.motion(hunter, 1.2, 0.3);

  engine.onCollision((a, b) => {
    console.log(a.emoji, 'hit', b.emoji);
  });

  engine.start();
</script>
