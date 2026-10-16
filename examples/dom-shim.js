/**
 * Minimal DOM stand-in so `node examples/demo.js` can construct the
 * engine under Node. Browsers already have these globals, so this does nothing there.
 */

class FakeStyle {}

class FakeElement {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.style = new FakeStyle();
    this.parentElement = null;
    this.textContent = '';
    this.className = '';
    this.width = 300;
    this.height = 150;
    this.attrs = new Map();
    this.listeners = new Map();
    this.context = null;
  }

  appendChild(child) {
    this.detach(child);
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    for (const node of nodes) this.appendChild(node);
  }

  setAttribute(name, value) {
    this.attrs.set(name, value);
  }

  getAttribute(name) {
    return this.attrs.get(name) ?? null;
  }

  addEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type, handler) {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((item) => item !== handler));
  }

  requestFullscreen() {
    return Promise.resolve();
  }

  click() {
    const list = this.listeners.get('click');
    if (!list) return;
    for (const handler of [...list]) handler({});
  }

  getContext(kind) {
    if (this.tagName !== 'CANVAS' || kind !== '2d') return null;
    this.context ??= new Context2D();
    return this.context;
  }

  detach(child) {
    const parent = child.parentElement;
    if (!parent) return;
    const index = parent.children.indexOf(child);
    if (index >= 0) parent.children.splice(index, 1);
    child.parentElement = null;
  }
}

/** Records the drawing calls the demo checks. */
class Context2D {
  constructor() {
    this.font = '';
    this.fillStyle = '';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.globalAlpha = 1;
    this.fillTextCount = 0;
    this.texts = [];
  }

  save() {}
  restore() {}
  clearRect() {}
  fillRect() {}

  fillText(text, x, y) {
    this.fillTextCount += 1;
    this.texts.push({ text: String(text), x: Number(x), y: Number(y) });
  }
}

class FakeDocument {
  constructor() {
    this.documentElement = new FakeElement('html');
    this.body = new FakeElement('body');
    this.documentElement.appendChild(this.body);
    this.fullscreenElement = null;
  }

  createElement(tag) {
    return new FakeElement(tag);
  }

  exitFullscreen() {
    this.fullscreenElement = null;
    return Promise.resolve();
  }
}

/** Install `document` and `requestAnimationFrame` when the host has none. */
export function installHostShims() {
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = new FakeDocument();
  }
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    const handles = new Map();
    let next = 1;
    globalThis.requestAnimationFrame = (callback) => {
      const token = next;
      next += 1;
      const handle = setTimeout(() => {
        handles.delete(token);
        callback(Date.now());
      }, 16);
      handles.set(token, handle);
      return token;
    };
    globalThis.cancelAnimationFrame = (token) => {
      const handle = handles.get(token);
      if (handle === undefined) return;
      clearTimeout(handle);
      handles.delete(token);
    };
  }
}
