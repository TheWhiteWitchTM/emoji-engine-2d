# Changes

emoji-engine-2d is alpha, at package version 0.1.0. Entries here describe behavior a caller can observe. Until a release candidate, a later version may change any of this again. See the status note in [README.md](README.md).

## Unreleased

### Screen, cursor, and fullscreen

The default palette is still the classic ANSI set, so existing `color` indexes do not move. Index 7 stays gray (`#aaaaaa`) and index 3 stays brown (`#aa5500`).

- `colorStyle('c64')` switches indexes 0–15 to VIC-II order. Index 6 is blue (`#0000aa`), 7 is yellow (`#eeee77`), 14 is light blue (`#0088ff`), and white is 1. Indexes 16–255 stay the 256-color cube. On `c64`, the bright flag does not shift 0–7 into 8–15. `ESC c` does not change the palette. An unknown name is ignored.
- A cell with no foreground index paints palette entry 15. That is `#ffffff` on `ansi`. It used to paint `#eeeeee`.
- `background(color)` paints the paper behind cells that have no background of their own. A number is a palette index, a string is CSS, and null leaves those cells transparent. `color`, erase, scroll, and `clear` still do not paint the pen background into empty cells. `ESC c` does not clear the paper.
- `border(color, width?)` sets a solid CSS border on the canvas. The width defaults to 2 pixels and is kept when a later call omits it. Null clears the border this method set. A border the game put on the element itself is left alone until `border` is used. A border index follows `colorStyle`.
- The caret is drawn by default. `cursorLit === false` hides it, and `cursorColor` is its color (default `#9ee`). Both are read on the next draw, which is what a frame loop that assigns them already does. The caret is clamped onto the grid, so it stays visible when the column sits just past the last cell. `setCursorStyle` accepts `underline` (the bottom bar, the default), `bar`, and `block`.
- `cursorSpeed(ms)` blinks the caret. `ms` is the lit time and the dark time. 0 keeps it steady. `cursorLit === false` hides it either way.
- `blinkSpeed(ms)` blinks SGR 5. SGR 6 uses half of that. 0, the default, keeps those glyphs drawn.
- The same values can be passed to `new Terminal(options)`: `colorStyle`, `background`, `border`, `borderWidth`, `showCursor`, `cursorColor`, `cursorStyle`, `cursorSpeed`, `blinkSpeed`.
- The fullscreen button reads `F11 Fullscreen` until the document is fullscreen, then `Esc Exit`. It checks at creation, so a page that is already fullscreen does not start on the F11 label, and it follows `fullscreenchange` when some other element is the fullscreen one. The button still does not listen for the F11 key.

The terminal cell buffer follows ECMA-48 (ANSI X3.64 / ISO/IEC 6429). [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [INTERFACES.md](INTERFACES.md) describe that contract. `examples/demo.js` checks the sequences below.

### Terminal

`write` and `put` parse C0 controls, ESC, CSI, and the 8-bit C1 forms. A sequence may be split across calls. Bytes that used to be stored as characters are now interpreted when they form a control sequence.

- Newline mode starts on. `\n`, vertical tab, and form feed also return to column 0. `CSI 20 l` keeps the column. `\r` only returns. Index (`ESC D`) never returns. Next line (`ESC E`) always does.
- Cursor addressing stops at the edges and does not scroll. Index scrolls at the bottom. Reverse index scrolls at the top.
- `readReply()` returns the next device report, or `''` when none is waiting. `CSI c` replies `CSI ? 0 c`. `CSI 5 n` replies `CSI 0 n`. `CSI 6 n` replies a 1-based cursor position.
- Color indexes run from 0 to 255. Indexes 0–15 stay the classic palette. Indexes 16–231 are the 6×6×6 cube. Indexes 232–255 are the gray ramp. SGR 38 and 48 accept ISO 8613-6 direct color (`38:2::r:g:b`, `38:5:n`, the `38:2:r:g:b` shorthand, and the semicolon forms). CMY and CMYK are accepted and converted. A color space other than the default is ignored.
- Cells store ECMA-48 rendition: bold, faint, italic, underline (single and double), blink, reverse, conceal, strike, overline, frame, circle, fraktur, and an alternate font number. Blink is stored and the glyph stays drawn. Alternate fonts and fraktur stay on the monospace grid.
- `bright` only shifts foreground indexes 0–7 to 8–15. SGR 1 sets that flag and a separate bold face. SGR 22 clears both. SGR 90–97 and 100–107 select palette entries 8–15.
- `ESC ( 0` selects the VT100 special-graphics set (`q` is `─`, `x` is `│`). `ESC ( B` is US ASCII. `ESC ( A` is the UK set. Shift Out, Shift In, locking shifts, and single shifts invoke the designated sets. An unknown designation falls back to ASCII.
- Erase and scroll clear to an uncolored space. They do not paint the current background. ED 2 does not home the cursor. ED 3 is ignored.
- `clear` blanks the screen and homes the cursor. The pen is kept. `ESC c` resets the screen, the pen, the character sets, and the tabs.
- `color(fg, bg)` replaces a direct-color foreground with the index. An omitted background is left alone, including a direct-color background.
- `set` with a string stores that string as the cell text and does not parse controls. The current pen is applied. A `Cell` is copied as given.
- OSC, DCS, SOS, PM, and APC are discarded through their string terminator. They do not change the palette or the document title. Private CSI parameters are ignored. BEL rings when audio is available.
- Insert mode (mode 4), tabs (default stops every 8 columns), and repeat (REP) are implemented.

### Unchanged

Canvas and Engine are unchanged in this pass. The terminal still paints in screen space, ignores the camera, and redraws through its canvas. `beginFrame` and `endFrame` still batch those redraws. `color(fg, bg)` still means the pen, and an omitted background is still left alone.
