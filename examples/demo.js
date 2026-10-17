/**
 * Witch Hunt, a one-scene trial of the built public API.
 * Run: npm run demo
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { installHostShims } from './dom-shim.js';
import { Engine, Terminal, Utilities } from '../dist/index.js';

const cellWidth = 12;
const cellHeight = 18;

checkBundle('emoji-engine-2d.js');
checkBundle('emoji-engine-2d.min.js');
installHostShims();

const engine = new Engine({ width: 480, height: 270 });
const ui = Utilities.wrap(engine.canvas, { title: 'Witch Hunt' });
document.body.appendChild(ui.wrap);
if (ui.headerMiddle) ui.headerMiddle.textContent = 'demo';
if (ui.footer) ui.footer.textContent = 'ready';

const term = new Terminal({
  cols: 36,
  rows: 6,
  canvas: engine.canvas,
  cellWidth,
  cellHeight,
  layer: 'terminal',
});
term.write('Witch Hunt\n');
term.write('A hunter crosses the heath.');

checkChrome();
checkTerminal();
checkAnsi();
checkGlass();
checkCollision();

const witch = engine.sprite('🧙‍♀️', 360, 180, 48);
const hunter = engine.sprite('✝️', 48, 180, 36, 'entities');
engine.motion(hunter, 6, 0);

if (witch.layer !== 'default' || witch.radius !== 24) fail('witch was not placed on its layer');
if (hunter.layer !== 'entities' || hunter.radius !== 18) fail('hunter was not placed on entities');

checkCamera(witch);

console.log(line(term, 0));
console.log(line(term, 1));

let finished = false;
const failSafe = setTimeout(() => {
  engine.stop();
  fail('timed out before a collision');
}, 5000);

const off = engine.onCollision((a, b) => {
  off();
  if (finished) return;
  finished = true;
  clearTimeout(failSafe);
  console.log(`${a.emoji} hit ${b.emoji}`);
  term.write(`\n${a.emoji} meets ${b.emoji}`);
  if (ui.footer) ui.footer.textContent = 'contact';
  engine.beep(523, 80);
  engine.stop();
  if (!(hunter.x > 48)) fail('hunter did not move');
  console.log('demo ok');
  exit(0);
});
if (typeof off !== 'function') fail('onCollision must return an unsubscribe function');

engine.start();

function checkBundle(file) {
  const code = readFileSync(new URL(`../browser/${file}`, import.meta.url), 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  try {
    vm.runInContext(code, sandbox, { filename: file });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`${file} did not run: ${message}`);
  }
  const api = sandbox.EmojiEngine;
  const names = api ? Object.keys(api).join(',') : 'missing';
  if (typeof api?.Canvas !== 'function') fail(`${file} missing Canvas (${names})`);
  if (typeof api?.Terminal !== 'function') fail(`${file} missing Terminal (${names})`);
  if (typeof api?.Engine !== 'function') fail(`${file} missing Engine (${names})`);
  if (typeof api?.Utilities?.wrap !== 'function') fail(`${file} missing Utilities.wrap (${names})`);
}

function checkChrome() {
  const middle = ui.headerMiddle;
  const header = middle?.parentElement ?? null;
  if (!middle || !header || !ui.footer) fail('wrap is missing headerMiddle or footer');
  if (header.parentElement !== ui.wrap || ui.footer.parentElement !== ui.wrap) {
    fail('chrome is not inside the wrap');
  }
  const parts = Array.from(header.children);
  if (parts.length !== 3) fail('header must hold title, middle, and fullscreen');
  if (textOf(parts[0]) !== 'Witch Hunt') fail('title');
  if (parts[1] !== middle) fail('headerMiddle is not the center slot');
  if (parts[2]?.tagName.toUpperCase() !== 'BUTTON') fail('fullscreen button');
  if (ui.footer.tagName.toUpperCase() !== 'DIV') fail('footer must be a plain div');
  if (engine.canvas.element.parentElement !== ui.wrap) fail('canvas was not wrapped');
  const column = Array.from(ui.wrap.children).map((node) => node.tagName.toUpperCase());
  if (column.join(',') !== 'HEADER,CANVAS,DIV') fail(`wrap order ${column.join(',')}`);
  ui.setTitle('Night Hunt');
  if (textOf(parts[0]) !== 'Night Hunt') fail('setTitle');
  ui.setTitle('Witch Hunt');
  const button = parts[2];
  expect(textOf(button), 'F11 Fullscreen', 'fullscreen label');
  if (typeof button.click === 'function') button.click();
  expect(textOf(button), 'Esc Exit', 'label while fullscreen');
  const extra = document.createElement('canvas');
  const again = Utilities.wrap(extra, { title: 'Already' });
  const againButton = again.headerMiddle?.parentElement?.children?.[2];
  expect(textOf(againButton), 'Esc Exit', 'wrap opened during fullscreen');
  if (typeof button.click === 'function') button.click();
  expect(textOf(button), 'F11 Fullscreen', 'label after leaving fullscreen');
  expect(textOf(againButton), 'F11 Fullscreen', 'other wrap heard the exit');
}

function checkTerminal() {
  if (line(term, 0) !== 'Witch Hunt') fail(`row 0: ${line(term, 0)}`);
  if (line(term, 1) !== 'A hunter crosses the heath.') fail(`row 1: ${line(term, 1)}`);
  if (term.canvas !== engine.canvas) fail('terminal must draw on the engine canvas');
}

function checkAnsi() {
  const plain = new Terminal({ cols: 4, rows: 1, cellWidth: 12, cellHeight: 18 });
  plain.write('W');
  const cell = plain.get(0, 0);
  expect(cell.ch, 'W', 'plain glyph');
  expect(String(cell.fg), '15', 'plain fg');
  expect(String(cell.bg), 'null', 'plain bg');
  expect(String(cell.bright), 'false', 'plain bright');
  expect(String(cell.bold), 'undefined', 'plain bold');
  expect(String(cell.fgRgb), 'undefined', 'plain rgb');
  const paints = watch(plain);
  const glyph = paints.find((item) => item.kind === 'text');
  if (!glyph || glyph.text !== 'W' || glyph.x !== 6 || glyph.y !== 9) fail('plain glyph anchor');
  expect(glyph.fill, '#ffffff', 'plain ink');
  expect(glyph.font, '14px monospace', 'plain face');
  if (paints.some((item) => item.kind === 'rect' && item.h === 18)) fail('plain cell painted a background');

  const page = new Terminal({ cols: 6, rows: 3 });
  page.write('ab\ncd');
  expect(page.get(0, 0).ch + page.get(1, 0).ch, 'ab', 'newline left the first line');
  expect(page.get(0, 1).ch + page.get(1, 1).ch, 'cd', 'newline started at column 0');
  expect(`${page.cursor.col},${page.cursor.row}`, '2,1', 'cursor after newline');
  page.write('\rZ');
  expect(page.get(0, 1).ch, 'Z', 'carriage return');
  expect(page.get(1, 1).ch, 'd', 'return did not erase');

  const wrapped = new Terminal({ cols: 4, rows: 2 });
  wrapped.write('abcdefgh');
  expect(raw(wrapped, 0), 'efgh', 'wrap scroll');
  expect(`${wrapped.cursor.col},${wrapped.cursor.row}`, '0,1', 'cursor after wrap scroll');
  wrapped.clear();
  wrapped.write('ab\ncd\nef');
  expect(raw(wrapped, 0), 'cd  ', 'newline scroll');
  expect(raw(wrapped, 1).slice(0, 2), 'ef', 'newline scroll bottom');

  const addressed = new Terminal({ cols: 4, rows: 2 });
  addressed.write('ab\ncd\x1b[9A');
  expect(addressed.get(0, 0).ch, 'a', 'cursor up must not scroll');
  expect(`${addressed.cursor.col},${addressed.cursor.row}`, '2,0', 'cursor up clamps');
  addressed.write('\x1b[99;99H');
  expect(addressed.get(0, 1).ch, 'c', 'cup clamp keeps the buffer');
  expect(`${addressed.cursor.col},${addressed.cursor.row}`, '3,1', 'cup clamps inside the page');
  addressed.write('\x1b[H');
  expect(`${addressed.cursor.col},${addressed.cursor.row}`, '0,0', 'cup default');
  addressed.write('\x1b[0;0f');
  expect(`${addressed.cursor.col},${addressed.cursor.row}`, '0,0', 'hvp zero is home');

  const flow = new Terminal({ cols: 4, rows: 2 });
  flow.write('ab\ncd');
  flow.write('\x1bD');
  expect(flow.get(0, 0).ch, 'c', 'index scrolls at the bottom');
  expect(`${flow.cursor.col},${flow.cursor.row}`, '2,1', 'index keeps the column');
  const lifted = new Terminal({ cols: 4, rows: 2 });
  lifted.write('ab\ncd\x1b[H\x1bM');
  expect(lifted.get(0, 1).ch, 'a', 'reverse index scrolls at the top');
  expect(`${lifted.cursor.col},${lifted.cursor.row}`, '0,0', 'reverse index stays home');

  const modes = new Terminal({ cols: 6, rows: 3 });
  modes.write('AB\x1b[20l\nC');
  expect(modes.get(2, 1).ch, 'C', 'standard line feed keeps the column');
  expect(modes.get(0, 1).ch, ' ', 'standard line feed does not return');
  modes.write('\x1b[20h\nD');
  expect(modes.get(0, 2).ch, 'D', 'newline mode returns');

  const edited = new Terminal({ cols: 6, rows: 1 });
  edited.write('ABCD\x1b[1;2H\x1b[2@');
  expect(raw(edited, 0), 'A  BCD', 'insert characters');
  edited.clear();
  edited.write('ABCD\x1b[1;2H\x1b[P');
  expect(raw(edited, 0), 'ACD   ', 'delete character');
  edited.clear();
  edited.write('ABCD\x1b[1;2H\x1b[2X');
  expect(raw(edited, 0), 'A  D  ', 'erase characters');
  expect(`${edited.cursor.col}`, '1', 'erase leaves the cursor');

  const lines = new Terminal({ cols: 4, rows: 3 });
  lines.write('aa\nbb\ncc\x1b[2;1H\x1b[L');
  expect(raw(lines, 0).slice(0, 2) + raw(lines, 1).slice(0, 2) + raw(lines, 2).slice(0, 2), 'aa  bb', 'insert line');
  lines.clear();
  lines.write('aa\nbb\ncc\x1b[2;1H\x1b[M');
  expect(raw(lines, 0).slice(0, 2) + raw(lines, 1).slice(0, 2), 'aacc', 'delete line');

  const shifted = new Terminal({ cols: 4, rows: 1 });
  shifted.write('AB\x1b[1 @');
  expect(raw(shifted, 0), 'B   ', 'scroll left');
  shifted.clear();
  shifted.write('AB\x1b[1 A');
  expect(raw(shifted, 0), ' AB ', 'scroll right');

  const tabs = new Terminal({ cols: 20, rows: 1 });
  tabs.write('A\tB');
  expect(tabs.get(0, 0).ch, 'A', 'tab source');
  expect(tabs.get(8, 0).ch, 'B', 'default tab stop');
  tabs.clear();
  tabs.write('\x1b[3G\x1bH\rX\tY');
  expect(tabs.get(0, 0).ch + tabs.get(2, 0).ch, 'XY', 'set tab stop');
  const margin = new Terminal({ cols: 20, rows: 2 });
  margin.write('\x1b[3g\rA\tB');
  expect(margin.get(19, 0).ch, 'B', 'cleared tabs run to the margin');
  expect(`${margin.cursor.col},${margin.cursor.row}`, '0,1', 'margin wrap');

  const pen = new Terminal({ cols: 8, rows: 1 });
  pen.write('\x1b[1;31;42mZ');
  expect(String(pen.get(0, 0).fg), '1', 'sgr fg');
  expect(String(pen.get(0, 0).bg), '2', 'sgr bg');
  expect(String(pen.get(0, 0).bright), 'true', 'sgr bright');
  expect(String(pen.get(0, 0).bold), 'true', 'sgr bold');
  const boldPaint = watch(pen).find((item) => item.kind === 'text');
  expect(boldPaint && boldPaint.font, 'bold 16px monospace', 'bold face');
  expect(boldPaint && boldPaint.fill, '#ff5555', 'bright red');
  pen.clear();
  pen.write('\x1b[1;21mZ');
  expect(String(pen.bright), 'true', 'double underline is not bold off');
  expect(String(pen.get(0, 0).underline), '2', 'ecma double underline');
  pen.clear();
  pen.write('\x1b[1;22mZ');
  expect(String(pen.bright), 'false', 'intensity off');
  expect(String(pen.get(0, 0).bold), 'undefined', 'bold off');
  pen.clear();
  pen.write('\x1b[1;mZ');
  expect(String(pen.bright), 'false', 'empty sgr parameter resets');
  pen.clear();
  pen.write('\x1b[33mZ');
  expect(watch(pen).find((item) => item.kind === 'text').fill, '#aa5500', 'classic brown');
  pen.clear();
  pen.write('\x1b[90mZ');
  expect(String(pen.get(0, 0).fg), '8', 'aixterm bright black');
  expect(String(pen.bright), 'false', 'aixterm color is not the bold flag');
  pen.clear();
  pen.write('\x1b[38;5;196mZ');
  expect(String(pen.get(0, 0).fg), '196', 'indexed color');
  expect(watch(pen).find((item) => item.kind === 'text').fill, 'rgb(255, 0, 0)', 'color cube');
  pen.clear();
  pen.color(232);
  pen.write('G');
  expect(watch(pen).find((item) => item.kind === 'text').fill, 'rgb(8, 8, 8)', 'gray ramp');
  pen.clear();
  pen.color(15);
  pen.write('\x1b[38;2;10;20;30mZ');
  expect(String(pen.get(0, 0).fg), 'null', 'direct color clears the index');
  expect(rgbOf(pen.get(0, 0).fgRgb), '10,20,30', 'semicolon direct color');
  pen.clear();
  pen.write('\x1b[38:2::9:8:7mZ');
  expect(rgbOf(pen.get(0, 0).fgRgb), '9,8,7', 'iso direct color');
  pen.clear();
  pen.write('\x1b[38:2:4:5:6mZ');
  expect(rgbOf(pen.get(0, 0).fgRgb), '4,5,6', 'direct-color shorthand');
  pen.clear();
  pen.write('\x1b[38:5:42mZ');
  expect(String(pen.get(0, 0).fg), '42', 'iso indexed color');
  pen.clear();
  pen.write('\x1b[0m\x1b[38:2:9:1:2:3mZ');
  expect(String(pen.get(0, 0).fg), '15', 'unknown color space');
  expect(String(pen.get(0, 0).fgRgb), 'undefined', 'unknown color space stores nothing');
  pen.clear();
  pen.write('\x1b[38:3::0:255:255mZ');
  expect(rgbOf(pen.get(0, 0).fgRgb), '255,0,0', 'cmy red');
  pen.clear();
  pen.write('\x1b[41;48:1mZ');
  expect(String(pen.get(0, 0).bg), 'null', 'iso transparent background');
  pen.clear();
  pen.write('\x1b[31;41;39;49mZ');
  expect(String(pen.get(0, 0).fg), '15', 'default foreground');
  expect(String(pen.get(0, 0).bg), 'null', 'default background');
  pen.clear();
  pen.write('\x1b[1;38;5;196;4mZ');
  expect(String(pen.get(0, 0).bold), 'true', 'rendition around indexed color');
  expect(String(pen.get(0, 0).fg), '196', 'indexed color among renditions');
  expect(String(pen.get(0, 0).underline), '1', 'underline after indexed color');
  pen.clear();
  pen.write('\x1b[38;2;1;2;3;48;2;4;5;6m');
  pen.color(2);
  pen.write('Z');
  expect(String(pen.get(0, 0).fg), '2', 'color() index');
  expect(String(pen.get(0, 0).fgRgb), 'undefined', 'color() clears direct foreground');
  expect(rgbOf(pen.get(0, 0).bgRgb), '4,5,6', 'omitted background stays');
  pen.color(2, null);
  pen.write('Y');
  expect(String(pen.get(1, 0).bg), 'null', 'explicit null background');
  expect(String(pen.get(1, 0).bgRgb), 'undefined', 'explicit null clears direct background');

  const intensity = new Terminal({ cols: 2, rows: 1, cellHeight: 18 });
  intensity.bright = true;
  intensity.color(1);
  intensity.write('W');
  const brightPaint = watch(intensity).find((item) => item.kind === 'text');
  expect(brightPaint && brightPaint.font, '14px monospace', 'bright flag is not a bold face');
  expect(brightPaint && brightPaint.fill, '#ff5555', 'bright flag still shifts 0-7');

  const drawn = new Terminal({ cols: 4, rows: 1, cellHeight: 20 });
  drawn.write('\x1b[2;3;4;7;8;9mZ');
  expect(String(drawn.get(0, 0).faint), 'true', 'faint');
  expect(String(drawn.get(0, 0).italic), 'true', 'italic');
  expect(String(drawn.get(0, 0).underline), '1', 'underline');
  expect(String(drawn.get(0, 0).reverse), 'true', 'reverse');
  expect(String(drawn.get(0, 0).conceal), 'true', 'conceal');
  expect(String(drawn.get(0, 0).strike), 'true', 'strike');
  const hidden = watch(drawn);
  if (hidden.some((item) => item.kind === 'text')) fail('concealed glyph was painted');
  drawn.clear();
  drawn.write('\x1b[0;31;42;7mZ');
  const reversed = watch(drawn);
  const block = reversed.find((item) => item.kind === 'rect' && item.h === 20);
  const letter = reversed.find((item) => item.kind === 'text');
  expect(block && block.fill, '#aa0000', 'reverse background');
  expect(letter && letter.fill, '#00aa00', 'reverse foreground');
  drawn.clear();
  drawn.write('\x1b[0;5mZ');
  expect(String(drawn.get(0, 0).blink), '1', 'blink is stored');
  if (!watch(drawn).some((item) => item.kind === 'text' && item.text === 'Z')) {
    fail('blink hid the glyph');
  }
  const faint = watch((() => {
    const box = new Terminal({ cols: 2, rows: 1 });
    box.write('\x1b[2mZ');
    return box;
  })()).find((item) => item.kind === 'text');
  expect(String(faint && faint.alpha), '0.6', 'faint alpha');

  const kept = new Terminal({ cols: 8, rows: 1 });
  kept.write('\x1b[41mHELLO\x1b[1;2H\x1b[K');
  expect(kept.get(0, 0).ch, 'H', 'erase line keeps the start');
  expect(String(kept.get(0, 0).bg), '1', 'erase line keeps colors already written');
  expect(kept.get(1, 0).ch, ' ', 'erase line clears');
  expect(String(kept.get(1, 0).bg), 'undefined', 'erased cell is uncolored');
  kept.clear();
  kept.write('Hello\x1b[2J');
  expect(kept.get(0, 0).ch, ' ', 'erase display');
  expect(`${kept.cursor.col}`, '5', 'erase display leaves the cursor');
  kept.write('\x1b[H\x1b[31mHi\x1b[3J');
  expect(raw(kept, 0).trimEnd(), 'Hi', 'no scrollback to erase');
  kept.clear();
  expect(`${kept.cursor.col},${kept.cursor.row}`, '0,0', 'clear homes');
  kept.write('Z');
  expect(String(kept.get(0, 0).fg), '1', 'clear keeps the pen');

  const graphic = new Terminal({ cols: 8, rows: 1 });
  graphic.write('\x1b(0qx\x1b(Bq');
  expect(graphic.get(0, 0).ch + graphic.get(1, 0).ch + graphic.get(2, 0).ch, '─│q', 'dec special graphics');
  graphic.clear();
  graphic.write('\x1b)0\x0eq\x0fX');
  expect(graphic.get(0, 0).ch + graphic.get(1, 0).ch, '─X', 'shift out');
  graphic.clear();
  graphic.write('\x1b*0\x1bNqX');
  expect(graphic.get(0, 0).ch + graphic.get(1, 0).ch, '─X', 'single shift');
  graphic.clear();
  graphic.write('\x1b(A#\x1b(B#');
  expect(graphic.get(0, 0).ch + graphic.get(1, 0).ch, '£#', 'uk pound');
  graphic.write('\x1b(0q\x1bcq');
  expect(graphic.get(0, 0).ch, 'q', 'reset restores ascii');
  expect(String(graphic.fg), '15', 'reset restores the pen');

  const memory = new Terminal({ cols: 8, rows: 3 });
  memory.write('\x1b[2;3H\x1b[31m\x1b7\x1b[H\x1b[32m\x1b8Z');
  expect(`${memory.cursor.col},${memory.cursor.row}`, '3,1', 'restored cursor');
  expect(String(memory.get(2, 1).fg), '1', 'restored pen');

  const again = new Terminal({ cols: 8, rows: 1 });
  again.write('A\x1b[31m\x1b[b');
  expect(String(again.get(0, 0).fg), '15', 'original repeat source');
  expect(again.get(1, 0).ch, 'A', 'repeat');
  expect(String(again.get(1, 0).fg), '1', 'repeat uses the current pen');
  again.clear();
  again.write('A\x1b[0b');
  expect(again.get(1, 0).ch, ' ', 'zero repeat adds nothing');
  again.clear();
  again.write('\x1b[4hABCD\x1b[1;2Hxy');
  expect(raw(again, 0), 'AxyBCD  ', 'insert mode');

  const quiet = new Terminal({ cols: 8, rows: 1 });
  quiet.write('AB\bC');
  expect(raw(quiet, 0).trimEnd(), 'AC', 'backspace');
  quiet.clear();
  quiet.write('A\x00B\x7fC');
  expect(raw(quiet, 0).trimEnd(), 'ABC', 'nul and delete are ignored');
  quiet.clear();
  quiet.write('A\x1b[999~B');
  expect(raw(quiet, 0).trimEnd(), 'AB', 'unknown sequence is ignored');
  expect(String(quiet.get(1, 0).fg), '15', 'unknown sequence does not change the pen');
  quiet.clear();
  quiet.write('A\x1b]0;Witch\x07B');
  expect(raw(quiet, 0).trimEnd(), 'AB', 'osc ends on bel');
  quiet.clear();
  quiet.write('A\x1b]0;Witch\x1b\\B');
  expect(raw(quiet, 0).trimEnd(), 'AB', 'osc ends on st');
  quiet.clear();
  quiet.write('A\x1b[?1049hB');
  expect(raw(quiet, 0).trimEnd(), 'AB', 'private mode is ignored');
  quiet.clear();
  quiet.write('A\x1b[31\x18B');
  expect(raw(quiet, 0).trimEnd(), 'AB', 'cancel drops the sequence');
  expect(String(quiet.get(1, 0).fg), '15', 'cancel drops the color');
  quiet.clear();
  quiet.write('\x1b[31');
  quiet.write('mZ');
  expect(String(quiet.get(0, 0).fg), '1', 'sequence split across writes');
  quiet.clear();
  quiet.write('AB');
  quiet.put('\x1b');
  quiet.put('[');
  quiet.put('H');
  quiet.put('Q');
  expect(quiet.get(0, 0).ch, 'Q', 'put parses one byte at a time');
  expect(quiet.get(1, 0).ch, 'B', 'put left the other cell');
  quiet.set(0, 0, '\x1b');
  expect(quiet.get(0, 0).ch, '\x1b', 'set does not parse');

  const asked = new Terminal({ cols: 10, rows: 3 });
  asked.write('AB\x1b[6n');
  expect(asked.readReply(), '\x1b[1;3R', 'cursor report');
  asked.write('\x1b[c');
  expect(asked.readReply(), '\x1b[?0c', 'device attributes');
  expect(asked.readReply(), '', 'reply queue empty');
  asked.write('AB\u009bH');
  expect(`${asked.cursor.col},${asked.cursor.row}`, '0,0', '8-bit csi');

  const marks = new Terminal({ cols: 4, rows: 4 });
  marks.write('A\vB\fC');
  expect(marks.get(0, 0).ch + marks.get(0, 1).ch + marks.get(0, 2).ch, 'ABC', 'vt and ff follow line feed');
  const emoji = new Terminal({ cols: 8, rows: 1 });
  emoji.write('🧙‍♀️');
  expect(emoji.get(0, 0).ch, '🧙', 'emoji code point');
  expect(emoji.get(1, 0).ch, '\u200D', 'zwj stays its own cell');
  expect(emoji.get(2, 0).ch, '♀', 'gender sign');
  expect(emoji.get(3, 0).ch, '\uFE0F', 'variation selector');

  const batched = new Terminal({ cols: 8, rows: 2 });
  let draws = 0;
  const draw = batched.canvas.draw.bind(batched.canvas);
  batched.canvas.draw = () => {
    draws += 1;
    draw();
  };
  batched.beginFrame();
  const parked = draws;
  batched.write('A');
  batched.write('\x1b[31mB');
  if (draws !== parked) fail('batched writes drew early');
  batched.endFrame();
  if (draws !== parked + 1) fail('outer endFrame draws once');
  expect(String(batched.get(1, 0).fg), '1', 'batched color');

  const api = new Terminal({ cols: 4, rows: 1 });
  api.color(3, 5);
  api.write('Z');
  api.color(1);
  expect(String(api.bg), '5', 'color keeps bg');
  api.write('Y');
  expect(`${api.get(1, 0).fg},${api.get(1, 0).bg}`, '1,5', 'later color');
}

function checkGlass() {
  const ash = new Terminal({ cols: 2, rows: 1, cellWidth: 8, cellHeight: 16 });
  ash.color(7);
  ash.write('G');
  expect(paintText(ash), '#aaaaaa', 'ansi 7 stays gray');
  ash.colorStyle('nope');
  expect(ash.palette, 'ansi', 'unknown palette is ignored');
  ash.colorStyle('c64');
  expect(ash.palette, 'c64', 'c64 palette');
  expect(paintText(ash), '#eeee77', 'stored index 7 becomes yellow');
  ash.colorStyle('ansi');
  expect(paintText(ash), '#aaaaaa', 'palette returns to ansi gray');

  const vic = new Terminal({
    cols: 4,
    rows: 2,
    cellWidth: 8,
    cellHeight: 10,
    colorStyle: 'c64',
    background: 6,
    border: 14,
  });
  expect(vic.canvas.element.style.border, '2px solid #0088ff', 'c64 border');
  expect(paintFill(vic, 32, 20), '#0000aa', 'c64 paper');
  vic.color(14, 6);
  vic.write('B');
  expect(paintText(vic), '#0088ff', 'c64 light blue ink');
  expect(paintFill(vic, 8, 10), '#0000aa', 'c64 cell blue');
  vic.clear();
  vic.bright = true;
  vic.color(7, null);
  vic.write('Y');
  expect(paintText(vic), '#eeee77', 'c64 bright does not shift yellow');
  vic.background(0);
  expect(paintFill(vic, 32, 20), '#000000', 'paper changes to black');
  vic.colorStyle('ansi');
  vic.background(6);
  expect(paintFill(vic, 32, 20), '#00aaaa', 'paper index follows the palette');
  vic.background(null);
  if (paintFill(vic, 32, 20)) fail('cleared paper still paints');
  vic.background(999);
  if (paintFill(vic, 32, 20)) fail('rejected paper index painted');
  vic.write('\x1bc');
  expect(vic.palette, 'ansi', 'reset keeps the palette');
  expect(String(vic.fg), '15', 'reset restores the pen');
  vic.colorStyle('c64');
  vic.background(6);
  vic.write('\x1bc');
  expect(vic.palette, 'c64', 'reset keeps c64');
  expect(paintFill(vic, 32, 20), '#0000aa', 'reset keeps the paper');

  const bare = new Terminal({ cols: 1, rows: 1, cellWidth: 8, cellHeight: 10 });
  bare.set(0, 0, { ch: 'Q' });
  expect(paintText(bare), '#ffffff', 'missing fg uses ansi white');
  bare.colorStyle('c64');
  expect(paintText(bare), '#bbbbbb', 'missing fg uses c64 color 15');

  const owned = new Terminal({ cols: 2, rows: 1, cellWidth: 8, cellHeight: 10 });
  owned.canvas.element.style.border = '2px solid #39ff14';
  owned.write('Hi');
  expect(owned.canvas.element.style.border, '2px solid #39ff14', 'preset border stays');
  owned.border('#ff00ff', 4);
  expect(owned.canvas.element.style.border, '4px solid #ff00ff', 'border color');
  owned.border(6);
  expect(owned.canvas.element.style.border, '4px solid #00aaaa', 'border keeps its width');
  owned.colorStyle('c64');
  expect(owned.canvas.element.style.border, '4px solid #0000aa', 'border index follows c64');
  owned.colorStyle('ansi');
  expect(owned.canvas.element.style.border, '4px solid #00aaaa', 'border index follows ansi');
  owned.border(null);
  expect(owned.canvas.element.style.border, '', 'border clears');

  const caret = new Terminal({ cols: 2, rows: 1, cellWidth: 10, cellHeight: 12 });
  expect(String(caret.cursorLit), 'true', 'cursor starts lit');
  const home = watch(caret).find((item) => item.kind === 'rect' && item.h === 2);
  if (!home || home.x !== 0 || home.fill !== '#9ee') fail('cursor missing at home');
  caret.write('Z');
  caret.cursor.col = caret.cols;
  caret.cursor.row = caret.rows;
  const bar = watch(caret).find((item) => item.kind === 'rect' && item.h === 2);
  if (!bar || bar.x !== 10 || bar.y !== 10 || bar.fill !== '#9ee') fail('cursor left the glass');
  caret.cursorColor = '#e6d3b0';
  caret.cursorLit = false;
  if (watch(caret).some((item) => item.kind === 'rect')) fail('cursorLit false still drew');
  caret.cursorLit = true;
  caret.setCursorStyle('block');
  const block = watch(caret).find((item) => item.kind === 'rect' && item.w === 10 && item.h === 12);
  expect(block && block.fill, '#e6d3b0', 'block cursor color');
  caret.setCursorStyle('bar');
  const beam = watch(caret).find((item) => item.kind === 'rect' && item.w === 2 && item.h === 12);
  expect(beam && beam.fill, '#e6d3b0', 'bar cursor');
  const hidden = new Terminal({
    cols: 1,
    rows: 1,
    cellWidth: 8,
    cellHeight: 10,
    showCursor: false,
  });
  hidden.write('Z');
  if (watch(hidden).some((item) => item.kind === 'rect')) fail('showCursor false drew a caret');

  const clock = new Terminal({ cols: 2, rows: 1, cellWidth: 8, cellHeight: 10 });
  clock.write('A');
  const realNow = Date.now;
  let now = 10_000_000;
  let failure = '';
  Date.now = () => now;
  try {
    clock.cursorSpeed(100);
    if (!watch(clock).some((item) => item.kind === 'rect' && item.h === 2)) failure = 'cursor starts the blink lit';
    now += 100;
    if (!failure && watch(clock).some((item) => item.kind === 'rect' && item.h === 2)) failure = 'cursor blink did not go dark';
    now += 100;
    if (!failure && !watch(clock).some((item) => item.kind === 'rect' && item.h === 2)) failure = 'cursor blink did not return';
    clock.cursorLit = false;
    if (!failure && watch(clock).some((item) => item.kind === 'rect' && item.h === 2)) failure = 'cursorLit lost to the blink';
    clock.cursorLit = true;
    clock.cursorSpeed(0);
    now += 100;
    if (!failure && !watch(clock).some((item) => item.kind === 'rect' && item.h === 2)) failure = 'steady cursor went dark';

    clock.clear();
    clock.write('\x1b[0;5mZ');
    now = 20_000_000;
    clock.blinkSpeed(80);
    if (!failure && !watch(clock).some((item) => item.kind === 'text' && item.text === 'Z')) failure = 'slow blink started hidden';
    now += 80;
    if (!failure && watch(clock).some((item) => item.kind === 'text' && item.text === 'Z')) failure = 'slow blink stayed drawn';
    now += 80;
    if (!failure && !watch(clock).some((item) => item.kind === 'text' && item.text === 'Z')) failure = 'slow blink did not return';
    clock.clear();
    clock.write('\x1b[0;6mZ');
    now = 30_000_000;
    clock.blinkSpeed(80);
    if (!failure && !watch(clock).some((item) => item.kind === 'text' && item.text === 'Z')) failure = 'rapid blink started hidden';
    now += 40;
    if (!failure && watch(clock).some((item) => item.kind === 'text' && item.text === 'Z')) failure = 'rapid blink was not half speed';
    clock.blinkSpeed(0);
    now += 1000;
    if (!failure && !watch(clock).some((item) => item.kind === 'text' && item.text === 'Z')) failure = 'blinkSpeed 0 hid the glyph';
  } finally {
    Date.now = realNow;
    clock.cursorSpeed(0);
    clock.blinkSpeed(0);
  }
  if (failure) fail(failure);
}

function paintText(terminal) {
  const mark = watch(terminal).find((item) => item.kind === 'text');
  return mark ? mark.fill : 'missing';
}

function paintFill(terminal, w, h) {
  const mark = watch(terminal).find((item) => item.kind === 'rect' && item.w === w && item.h === h);
  return mark ? mark.fill : '';
}

function checkCamera(witch) {
  engine.canvas.follow(witch);
  engine.canvas.draw();
  const expectedX = witch.x - engine.canvas.element.width / 2;
  const expectedY = witch.y - engine.canvas.element.height / 2;
  if (engine.canvas.camera.x !== expectedX || engine.canvas.camera.y !== expectedY) {
    fail('camera follow');
  }
  engine.canvas.follow(null);
  engine.canvas.setCamera(0, 0);

  const ctx = engine.canvas.ctx;
  if (!Array.isArray(ctx.texts)) fail('draw recorder missing');
  ctx.texts.length = 0;
  engine.canvas.setCamera(100, 50);
  engine.canvas.draw();
  const mark = ctx.texts.find((item) => item.text === 'W');
  if (!mark || mark.x !== cellWidth / 2 || mark.y !== cellHeight / 2) {
    fail(`terminal followed the camera (${mark ? `${mark.x},${mark.y}` : 'missing'})`);
  }
  const glyph = ctx.texts.find((item) => item.text === witch.emoji);
  if (!glyph || glyph.x !== witch.x - 100 || glyph.y !== witch.y - 50) {
    fail('sprite did not use the camera');
  }
  engine.canvas.setCamera(0, 0);
}

function checkCollision() {
  checkContact();
  checkOrderAndCamera();
  checkPairsStayFixed();
  checkUnsubscribe();
  checkNestedUpdate();
}

function checkContact() {
  const { box, a, b } = pairBox(0, 20);
  const hits = [];
  const off = box.onCollision((left, right) => hits.push(left.emoji + right.emoji));
  box.update();
  expect(hits.join(','), 'AB', 'exact contact');

  b.x = 21;
  hits.length = 0;
  box.update();
  expect(hits.join(','), '', 'separated by a pixel');

  b.x = 30;
  box.motion(b, -10, 0);
  box.update();
  expect(hits.join(','), 'AB', 'move into contact');
  expect(String(b.x), '20', 'velocity applied');

  hits.length = 0;
  box.motion(b, 100, 0);
  box.update();
  expect(hits.join(','), '', 'move out of contact');
  expect(String(b.x), '120', 'left the circle');

  a.alive = false;
  a.vx = 5;
  b.x = a.x;
  b.vx = 0;
  hits.length = 0;
  box.update();
  expect(hits.join(','), '', 'dead sprite collided');
  expect(String(a.x), '0', 'dead sprite moved');

  off();
  a.alive = true;
  hits.length = 0;
  box.update();
  expect(hits.join(','), '', 'unsubscribed contact handler');
  off();

  const weird = new Engine({ width: 32, height: 32 });
  const lost = weird.sprite('P', Number.NaN, 0, 20);
  weird.sprite('Q', 0, 0, 20);
  let weirdHits = 0;
  weird.onCollision(() => {
    weirdHits += 1;
  });
  weird.update();
  expect(String(weirdHits), '0', 'non-finite position');
  lost.x = 0;
  lost.y = Number.POSITIVE_INFINITY;
  weird.update();
  expect(String(weirdHits), '0', 'infinite position');
}

function checkOrderAndCamera() {
  const box = new Engine({ width: 64, height: 64 });
  const right = box.sprite('R', 10, 0, 40);
  const left = box.sprite('L', 0, 0, 40);
  let pair = '';
  box.onCollision((first, second) => {
    pair += first.emoji + second.emoji;
  });
  box.canvas.setCamera(500, -40);
  box.update();
  expect(pair, 'RL', 'creation order');
  if (right.x !== 10 || left.x !== 0) fail('camera moved a sprite');
}

function checkPairsStayFixed() {
  const box = new Engine({ width: 64, height: 64 });
  box.sprite('A', 0, 0, 20);
  box.sprite('B', 0, 0, 20);
  const far = box.sprite('C', 80, 0, 20);
  let count = 0;
  box.onCollision(() => {
    count += 1;
    far.x = 0;
  });
  box.update();
  expect(String(count), '1', 'pairs fixed before callbacks');
  box.update();
  expect(String(count), '4', 'next update sees the moved sprite');

  const crowd = new Engine({ width: 32, height: 32 });
  crowd.sprite('A', 0, 0, 20);
  crowd.sprite('B', 0, 0, 20);
  crowd.sprite('C', 0, 0, 20);
  const killed = [];
  crowd.onCollision((first, second) => {
    killed.push(first.emoji + second.emoji);
    second.alive = false;
  });
  crowd.update();
  expect(killed.join(','), 'AB,AC,BC', 'killing a sprite does not drop pairs already found');
}

function checkUnsubscribe() {
  const box = new Engine({ width: 32, height: 32 });
  box.sprite('A', 0, 0, 30);
  box.sprite('B', 0, 0, 30);
  box.sprite('C', 0, 0, 30);
  const seen = [];
  let offFirst = () => {};
  offFirst = box.onCollision((first, second) => {
    seen.push(`1${first.emoji}${second.emoji}`);
    offFirst();
  });
  box.onCollision((first, second) => {
    seen.push(`2${first.emoji}${second.emoji}`);
  });
  box.update();
  expect(seen.join(','), '1AB,2AB,2AC,2BC', 'unsubscribe mid-report');

  const again = new Engine({ width: 32, height: 32 });
  again.sprite('A', 0, 0, 10);
  again.sprite('B', 0, 0, 10);
  let calls = 0;
  const fn = () => {
    calls += 1;
  };
  const off1 = again.onCollision(fn);
  const off2 = again.onCollision(fn);
  off2();
  again.update();
  expect(String(calls), '1', 'unsubscribe removed one registration');
  off2();
  again.update();
  expect(String(calls), '2', 'second unsubscribe was a no-op');
  off1();
  again.update();
  expect(String(calls), '2', 'remaining registration removed');

  let extra = 0;
  let armed = false;
  again.onCollision(() => {
    if (armed) return;
    armed = true;
    again.onCollision(() => {
      extra += 1;
    });
  });
  again.sprite('C', 0, 0, 10);
  again.update();
  expect(String(extra), '0', 'handler added during update ran immediately');
  again.update();
  expect(String(extra), '3', 'handler added during update waited');
}

function checkNestedUpdate() {
  const box = new Engine({ width: 32, height: 32 });
  box.sprite('A', 0, 0, 10);
  box.sprite('B', 0, 0, 10);
  let calls = 0;
  box.onCollision(() => {
    calls += 1;
    try {
      box.update();
      fail('nested update should throw');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes('collision handler')) fail(message);
    }
  });
  box.update();
  expect(String(calls), '1', 'nested update');
  box.update();
  expect(String(calls), '2', 'update after a nested call');
}

function pairBox(ax, bx) {
  const box = new Engine({ width: 64, height: 64 });
  const a = box.sprite('A', ax, 0, 20);
  const b = box.sprite('B', bx, 0, 20);
  return { box, a, b };
}

function expect(actual, expected, label) {
  if (actual !== expected) fail(`${label}: ${actual}`);
}

function textOf(node) {
  return node?.textContent ?? '';
}

function line(terminal, row) {
  return raw(terminal, row).trimEnd();
}

function raw(terminal, row) {
  let text = '';
  for (let col = 0; col < terminal.cols; col += 1) text += terminal.get(col, row).ch;
  return text;
}

function rgbOf(rgb) {
  if (!rgb) return 'missing';
  return `${rgb.r},${rgb.g},${rgb.b}`;
}

function watch(terminal) {
  const ctx = terminal.canvas.ctx;
  const seen = [];
  const text = ctx.fillText.bind(ctx);
  const rect = ctx.fillRect.bind(ctx);
  ctx.fillText = (value, x, y) => {
    seen.push({
      kind: 'text',
      text: String(value),
      x: Number(x),
      y: Number(y),
      fill: String(ctx.fillStyle),
      font: String(ctx.font),
      alpha: ctx.globalAlpha,
    });
    text(value, x, y);
  };
  ctx.fillRect = (x, y, w, h) => {
    seen.push({
      kind: 'rect',
      x: Number(x),
      y: Number(y),
      w: Number(w),
      h: Number(h),
      fill: String(ctx.fillStyle),
    });
    rect(x, y, w, h);
  };
  terminal.canvas.draw();
  return seen;
}

function fail(message) {
  console.error(`demo failed: ${message}`);
  exit(1);
}

function exit(code) {
  const proc = globalThis.process;
  if (proc) proc.exit(code);
  throw new Error(`demo exit ${code}`);
}
