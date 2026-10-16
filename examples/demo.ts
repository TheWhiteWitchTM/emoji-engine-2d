/**
 * Witch Hunt, a one-scene trial of the public API.
 * Run: npx tsx examples/demo.ts
 */
import { installHostShims } from './dom-shim.ts';
import { Engine, Terminal, Utilities } from '../src/index.ts';

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
  cellWidth: 12,
  cellHeight: 18,
  layer: 'terminal',
});
term.write('Witch Hunt\n');
term.write('A hunter crosses the heath.');

checkChrome();
checkTerminal();

const witch = engine.sprite('🧙‍♀️', 360, 180, 48);
const hunter = engine.sprite('✝️', 48, 180, 36, 'entities');
engine.motion(hunter, 6, 0);

if (witch.layer !== 'default' || witch.radius !== 24) fail('witch was not placed on its layer');
if (hunter.layer !== 'entities' || hunter.radius !== 18) fail('hunter was not placed on entities');

engine.canvas.follow(witch);
engine.canvas.draw();
if (engine.canvas.camera.x !== witch.x - engine.canvas.element.width / 2) fail('camera follow');
engine.canvas.follow(null);
engine.canvas.setCamera(0, 0);
const painted = (engine.canvas.ctx as { fillTextCount?: number }).fillTextCount;
if (painted !== undefined && painted < 1) fail('draw did not paint text');

console.log(line(term, 0));
console.log(line(term, 1));

let finished = false;
const failSafe = setTimeout(() => {
  engine.stop();
  fail('timed out before a collision');
}, 5000);

engine.onCollision((a, b) => {
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

engine.start();

function checkChrome(): void {
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
  if ('click' in parts[2] && typeof parts[2].click === 'function') parts[2].click();
}

function textOf(node: Element | undefined): string {
  return node?.textContent ?? '';
}

function checkTerminal(): void {
  if (line(term, 0) !== 'Witch Hunt') fail(`row 0: ${line(term, 0)}`);
  if (line(term, 1) !== 'A hunter crosses the heath.') fail(`row 1: ${line(term, 1)}`);
  if (term.canvas !== engine.canvas) fail('terminal must draw on the engine canvas');
}

function line(terminal: Terminal, row: number): string {
  let text = '';
  for (let col = 0; col < terminal.cols; col += 1) text += terminal.get(col, row).ch;
  return text.trimEnd();
}

function fail(message: string): never {
  console.error(`demo failed: ${message}`);
  exit(1);
}

function exit(code: number): never {
  const proc = (globalThis as { process?: { exit(code: number): never } }).process;
  if (proc) proc.exit(code);
  throw new Error(`demo exit ${code}`);
}
