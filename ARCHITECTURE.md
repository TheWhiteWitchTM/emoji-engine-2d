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

`write`, `put`, `set`, and `clear` edit the buffer. `get` returns a copy of one cell. `write` and `put` walk code points and obey ECMA-48 (ANSI X3.64 / ISO/IEC 6429): C0 controls, ESC, CSI, and the 8-bit C1 forms. `set` stores its string as one cell and does not parse controls. A printable code point occupies one cell, so a multi-code-point emoji still occupies several. The cursor wraps at the last column and scrolls when a line feed, index, or wrap moves it off the bottom row. Cursor addressing stops at the edges and does not scroll.

`\n`, vertical tab, and form feed are line feeds. The buffer starts in ECMA-48 newline mode, so a line feed also returns to column 0. That is the line break `write` already used. `CSI 20 l` selects the standard default, where a line feed keeps the column. `\r` only returns. Index (`ESC D`) never returns; next line (`ESC E`) always does.

Cells remember a color index from 0 to 255, an optional direct RGB color, the bright flag, and the ECMA-48 rendition (bold, faint, italic, underline, blink, reverse, conceal, strike, overline, frame, circle, fraktur, font). Indexes 0–15 use the active palette. The default is the classic ANSI set, brown included, so index 7 is gray. `colorStyle('c64')` selects VIC-II order instead, and on that palette the bright flag does not shift indexes. Indexes 16–231 are the 6×6×6 cube and 232–255 are the gray ramp. Direct color is SGR 38/48 as ISO 8613-6 subparameters (`38:2::r:g:b`, `38:5:n`) and as the semicolon form (`38;2;r;g;b`, `38;5;n`). A missing cell background stays transparent, so sprite layers show through empty cells, unless `background` has painted a paper color behind them. Erase and scroll clear to that same blank cell; they do not paint the current pen background. SGR 21 is the ECMA-48 double underline. Blink is stored. The glyph stays drawn unless `blinkSpeed` is set, because the buffer otherwise paints when the text changes. Alternate fonts and fraktur are stored, and the grid stays monospace. Proportional spacing is ignored for the same reason.

`ESC ( 0` selects the VT100 special-graphics set, the character-cell line drawing. `ESC ( B` returns to US ASCII and `ESC ( A` selects the UK set. Shift Out / Shift In and the single shifts invoke the designated sets. Unknown designations fall back to ASCII. Operating-system and device-control strings are consumed and ignored, so a title or palette command cannot retint the page. Private CSI parameters are ignored. `readReply` returns a cursor report or the device-attributes reply `CSI ? 0 c`.

The grid is painted in screen space. `draw` accepts the camera, because every drawable does, and ignores it. Following a sprite therefore does not scroll the text off the bitmap.

After a mutation the terminal asks its canvas to `draw`, which repaints every layer on that surface. `beginFrame` / `endFrame` hold those redraws. The calls nest, and the outermost `endFrame` paints once if anything changed. A terminal-only program can refresh this way. It does not need `Engine.start`.

`cursor`, `fg`, `bg`, and `bright` are the write state. `bright` still means only the color shift from indexes 0–7 to 8–15, and only while the palette is `ansi`. SGR 1 sets that flag and a separate bold face; SGR 22 clears both. `color(fg, bg)` sets indexes. An omitted background is left alone, including a direct-color background. `background` and `border` are the glass, not the pen: the paper shows through uncolored cells, and the border is CSS on the canvas. `clear` blanks the screen and homes the cursor without resetting the pen or the glass. `ESC c` resets the pen, the sets, the tabs, and the screen, and leaves the palette, paper, border, and caret settings alone. The caret is on by default. `cursorLit` and `cursorColor` are read when the grid paints, and the caret is clamped into the grid. `onKey` and `isKeyDown` listen on `window` when it exists. They keep their own key set.

## Engine

`src/engine.ts` is the game systems layer. The constructor uses the canvas you pass, or creates one. It never builds chrome.

`sprite(emoji, x, y, size, layer)` builds a sprite, stores it, and adds it to that canvas layer. Any layer name is valid. The default layer is `default`. `size` is the font size in pixels and defaults to 32. `motion` writes `vx` and `vy` in pixels per frame.

`update` moves every living sprite by its velocity, then tests pairs. Two living sprites collide when the distance between centers is within `radius + radius`. `radius` is always `size / 2`. The layer is ignored. Positions and the sum of the radii must be finite; otherwise that pair is not a hit. The test uses the positions after the move, so a sprite that jumps completely past another in one update is not a hit.

Each overlapping pair is collected once, with the sprite created earlier as `a`. Handlers then run for that fixed list. Moving or killing a sprite inside a handler does not add or drop pairs until the next update. The same pair is reported again on the next update while the circles still overlap. `onCollision` returns a function that removes that registration. A handler removed before its turn does not run. A handler added during the update waits until the next update. Calling the returned function again does nothing. Two registrations of one function are removed separately. `update` throws if a handler calls it. A sprite with `alive === false` does not move, collide, or paint. It stays in the list so the game can revive it.

`start` schedules `requestAnimationFrame`. Each frame calls `update` and then `canvas.draw`. `stop` cancels the next frame. `start` does nothing if the loop is already running. If `update` or `canvas.draw` throws, the loop stops, and a later `start` runs again.

`isKeyDown` tracks `KeyboardEvent.key` on `window` when that exists. `beep(freq, duration)` plays a short square wave through the Web Audio API. With no `AudioContext`, or if playback is rejected, it returns without throwing.

## Utilities

`src/utilities.ts` exports one object, `Utilities`, with one method, `wrap(target, options)`. Call it from application code.

`wrap` returns `{ wrap, headerMiddle, footer, setTitle }`.

- `wrap` is a column.
- The header, when present, is a `header` element: title on the left, `headerMiddle` in the center, fullscreen button on the right.
- `footer` is a plain `div` under the target. The caller fills it.
- `setTitle` replaces the title text.

`header` and `footer` in the options both default to on. Set either to `false` and the matching node comes back `null`. `setTitle` is a no-op when the header was omitted. The fullscreen button requests fullscreen on the wrap column, or leaves fullscreen when the document is already there. A rejected fullscreen request is ignored. Its label is `F11 Fullscreen`, or `Esc Exit` while `document.fullscreenElement` is set, including when that element is not the wrap and including when fullscreen was already active at the moment `wrap` ran. A `fullscreenchange` event updates the label. The button does not listen for the F11 key.

`append` moves the target element into the column between the bars. `document.body.appendChild(ui.wrap)` is the call that puts the whole stack on the page.

## Source map

```text
src/canvas.ts       Canvas, Point, Drawable
src/terminal.ts     Terminal, Cell
src/engine.ts       Engine, Sprite
src/utilities.ts    Utilities, wrap result
src/index.ts        public re-exports
dist/               plain JavaScript modules and declarations
browser/            script-tag bundle and its minified build
examples/demo.js    runnable scene
examples/play.html  the same scene in a browser
examples/dom-shim.js
```

`package.json` is `"type": "module"`. `tsconfig.json` targets ES2022 and includes the DOM library. `npm run build` compiles `src/` to JavaScript and declarations in `dist/`, then bundles `browser/emoji-engine-2d.js` for a script tag and writes the minified `browser/emoji-engine-2d.min.js`. `npm install` runs that build. `npm run demo` runs `examples/demo.js` with Node against `dist/`. Using the engine does not require a TypeScript loader.

Import `emoji-engine-2d` or `./dist/index.js` from an ES module. A classic page loads `browser/emoji-engine-2d.js` or `browser/emoji-engine-2d.min.js` and reads `EmojiEngine.Canvas`, `EmojiEngine.Terminal`, `EmojiEngine.Engine`, and `EmojiEngine.Utilities`.

The shim exists so that one command can construct a canvas under Node. It is outside the engine. Canvas and Utilities require `document`. Engine and Terminal listen on `window` only when it exists. `beep` returns when audio is missing. `start` requires `requestAnimationFrame`.
