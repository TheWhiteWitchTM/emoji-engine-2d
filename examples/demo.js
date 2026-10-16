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
  const code = readFileSync(new URL(`../dist/${file}`, import.meta.url), 'utf8');
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
  if ('click' in parts[2] && typeof parts[2].click === 'function') parts[2].click();
}

function checkTerminal() {
  if (line(term, 0) !== 'Witch Hunt') fail(`row 0: ${line(term, 0)}`);
  if (line(term, 1) !== 'A hunter crosses the heath.') fail(`row 1: ${line(term, 1)}`);
  if (term.canvas !== engine.canvas) fail('terminal must draw on the engine canvas');
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
  let text = '';
  for (let col = 0; col < terminal.cols; col += 1) text += terminal.get(col, row).ch;
  return text.trimEnd();
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
