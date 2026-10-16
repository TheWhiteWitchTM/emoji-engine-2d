# Architecture

emoji-engine-2d is four pieces. Each one owns a single job. Application code is the only thing that may compose all four.

```text
application
  ├─ Utilities.wrap(canvas | engine | terminal | element)
  ├─ Engine  ── uses ──▶ Canvas
  └─ Terminal ─ uses ─▶ Canvas
```

| Piece | Owns | Leaves alone |
| --- | --- | --- |
| Canvas | The `HTMLCanvasElement`, the 2D context, named layers, the camera | Sprites, input, audio, header, footer |
| Terminal | The cell buffer and how those cells are painted | Motion, collision, chrome |
| Engine | Sprites, velocity, circle tests, the frame loop, keys, beep | Creating a header or footer |
| Utilities | The optional title bar and footer | Drawing and game rules |

Canvas, Terminal, and Engine do not import Utilities. Utilities does not import them. It accepts a target by shape: an element, an object with `element` (a Canvas), or an object with `canvas.element` (an Engine or a Terminal).

## Canvas

`src/canvas.ts` creates the bitmap and the 2D context and does not insert them into the document. Drawables register on named layers. A layer is created the first time something is added to it. Layers paint in that first-seen order, back to front, and an emptied layer keeps its place so later draws stay in the same order. Inside a layer, drawables paint in insertion order. Adding a drawable that is already attached moves it to the end of the destination layer.

The camera is the world point drawn at the top-left of the bitmap. `setCamera` stores that point. `follow(target)` recenters on the target at the start of `draw`, and it keeps winning over `setCamera` until `follow(null)`. `draw` clears the bitmap and then asks every drawable to paint. `clear` wipes pixels and leaves the layer lists alone.

`drawEmoji` paints one emoji in world coordinates. Sprites use the same helper, so a sprite and a direct call share one placement rule: screen position is world position minus the camera, and the glyph is centered on that point.

## Terminal

`src/terminal.ts` is a cell buffer and a `Drawable`. It always has a `canvas`. Pass one in to share a surface with the engine, or omit it and the terminal creates a canvas sized to the grid.

`write`, `put`, `set`, and `clear` edit the buffer. `get` returns a copy of one cell. `write` walks the string one code point at a time, honors `\n` and `\r`, wraps at the last column, and scrolls when the cursor leaves the bottom row. `put` writes a single code point at the cursor and advances. Cells remember an optional ANSI index, an optional RGB override, and a bright flag. A missing background stays transparent, so sprite layers can show through empty cells.

The grid is painted in screen space. `draw` accepts the camera, because every drawable does, and ignores it. Following a sprite therefore does not scroll the text off the bitmap.

After a mutation the terminal asks its canvas to `draw`, which repaints every layer on that surface. `beginFrame` / `endFrame` hold those redraws. The calls nest, and the outermost `endFrame` paints once if anything changed. A terminal-only program can refresh this way. It does not need `Engine.start`.

`cursor`, `fg`, `bg`, and `bright` are the write state. `color(fg, bg)` sets the indexes used by later writes. `onKey` and `isKeyDown` listen on `window` when it exists. They keep their own key set.

## Engine

`src/engine.ts` is the game systems layer. The constructor uses the canvas you pass, or creates one. It never builds chrome.

`sprite(emoji, x, y, size, layer)` builds a sprite, stores it, and adds it to that canvas layer. Any layer name is valid. The default layer is `default`. `size` is the font size in pixels and defaults to 32. `motion` writes `vx` and `vy` in pixels per frame.

`update` moves every living sprite by its velocity, then tests pairs. Two living sprites collide when the distance between centers is within `radius + radius`. `radius` is always `size / 2`. Each overlapping pair is reported once per update, earlier sprite first, to every `onCollision` callback. The report repeats on later frames while the circles still overlap. A sprite with `alive === false` does not move, collide, or paint. It stays in the list so the game can revive it.

`start` schedules `requestAnimationFrame`. Each frame calls `update` and then `canvas.draw`. `stop` cancels the next frame. `start` does nothing if the loop is already running.

`isKeyDown` tracks `KeyboardEvent.key` on `window` when that exists. `beep(freq, duration)` plays a short square wave through the Web Audio API. With no `AudioContext`, or if playback is rejected, it returns without throwing.

## Utilities

`src/utilities.ts` exports one object, `Utilities`, with one method, `wrap(target, options)`. Call it from application code.

`wrap` returns `{ wrap, headerMiddle, footer, setTitle }`.

- `wrap` is a column.
- The header, when present, is a `header` element: title on the left, `headerMiddle` in the center, fullscreen button on the right.
- `footer` is a plain `div` under the target. The caller fills it.
- `setTitle` replaces the title text.

`header` and `footer` in the options both default to on. Set either to `false` and the matching node comes back `null`. `setTitle` is a no-op when the header was omitted. The fullscreen button requests fullscreen on the wrap column, or leaves fullscreen when the document is already there. A rejected fullscreen request is ignored.

`append` moves the target element into the column between the bars. `document.body.appendChild(ui.wrap)` is the call that puts the whole stack on the page.

## Source map

```text
src/canvas.ts       Canvas, Point, Drawable
src/terminal.ts     Terminal, Cell
src/engine.ts       Engine, Sprite
src/utilities.ts    Utilities, wrap result
src/index.ts        public re-exports
examples/demo.ts    runnable scene
examples/dom-shim.ts
```

`package.json` is `"type": "module"`. `tsconfig.json` targets ES2022 and includes the DOM library. Nothing is precompiled. `npm run demo` runs `examples/demo.ts` with tsx.

The shim exists so that one command can construct a canvas under Node. It is outside the engine. Canvas and Utilities require `document`. Engine and Terminal listen on `window` only when it exists. `beep` returns when audio is missing. `start` requires `requestAnimationFrame`.
