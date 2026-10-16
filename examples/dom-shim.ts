/**
 * Minimal DOM stand-in so `npx tsx examples/demo.ts` can construct the
 * engine under Node. Browsers already have these globals, so this does nothing there.
 */

class FakeStyle {
  [key: string]: string;
}

class FakeElement {
  readonly nodeType = 1;
  readonly tagName: string;
  readonly children: FakeElement[] = [];
  readonly style = new FakeStyle();
  parentElement: FakeElement | null = null;
  textContent = '';
  className = '';
  width = 300;
  height = 150;
  private readonly attrs = new Map<string, string>();
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>();
  private context: Context2D | null = null;

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  appendChild<T extends FakeElement>(child: T): T {
    this.detach(child);
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) this.appendChild(node);
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  addEventListener(type: string, handler: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(handler);
    this.listeners.set(type, list);
  }

  removeEventListener(type: string, handler: (event: unknown) => void): void {
    const list = this.listeners.get(type) ?? [];
    this.listeners.set(type, list.filter((item) => item !== handler));
  }

  requestFullscreen(): Promise<void> {
    return Promise.resolve();
  }

  click(): void {
    const list = this.listeners.get('click');
    if (!list) return;
    for (const handler of [...list]) handler({});
  }

  getContext(kind: string): Context2D | null {
    if (this.tagName !== 'CANVAS' || kind !== '2d') return null;
    this.context ??= new Context2D();
    return this.context;
  }

  private detach(child: FakeElement): void {
    const parent = child.parentElement;
    if (!parent) return;
    const index = parent.children.indexOf(child);
    if (index >= 0) parent.children.splice(index, 1);
    child.parentElement = null;
  }
}

/** Records the drawing calls the prototype actually makes. */
class Context2D {
  font = '';
  fillStyle = '';
  textAlign = 'start';
  textBaseline = 'alphabetic';
  globalAlpha = 1;
  fillTextCount = 0;

  save(): void {}
  restore(): void {}
  clearRect(): void {}
  fillRect(): void {}
  fillText(): void {
    this.fillTextCount += 1;
  }
}

class FakeDocument {
  readonly documentElement: FakeElement;
  readonly body: FakeElement;
  fullscreenElement: FakeElement | null = null;

  constructor() {
    this.documentElement = new FakeElement('html');
    this.body = new FakeElement('body');
    this.documentElement.appendChild(this.body);
  }

  createElement(tag: string): FakeElement {
    return new FakeElement(tag);
  }

  exitFullscreen(): Promise<void> {
    this.fullscreenElement = null;
    return Promise.resolve();
  }
}

/** Install `document` and `requestAnimationFrame` when the host has none. */
export function installHostShims(): void {
  const host = globalThis as unknown as { document?: unknown };
  if (typeof host.document === 'undefined') {
    host.document = new FakeDocument();
  }
  if (typeof globalThis.requestAnimationFrame !== 'function') {
    const handles = new Map<number, ReturnType<typeof setTimeout>>();
    let next = 1;
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      const token = next;
      next += 1;
      const handle = setTimeout(() => {
        handles.delete(token);
        callback(Date.now());
      }, 16);
      handles.set(token, handle);
      return token;
    }) as typeof requestAnimationFrame;
    globalThis.cancelAnimationFrame = ((token: number): void => {
      const handle = handles.get(token);
      if (handle === undefined) return;
      clearTimeout(handle);
      handles.delete(token);
    }) as typeof cancelAnimationFrame;
  }
}
