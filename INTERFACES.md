# Public interfaces

These four interfaces are the contract for emoji-engine-2d. Implementations must satisfy them. Supporting types are included for clarity.

All interfaces are designed to be implementable in TypeScript and comfortably usable from plain JavaScript.

## Supporting types

```ts
interface Point {
  x: number;
  y: number;
}

interface Drawable {
  draw(ctx: CanvasRenderingContext2D, camera: Point): void;
}

interface Sprite extends Drawable {
  emoji: string;
  x: number;
  y: number;
  size: number;
  vx: number;
  vy: number;
  layer: string;
  alive: boolean;
  /** Collision radius in pixels (circle test). */
  radius: number;
  data: Record<string, unknown>;
}

interface Cell {
  ch: string;
  fg?: number | null;
  bg?: number | null;
  fgRgb?: { r: number; g: number; b: number } | null;
  bgRgb?: { r: number; g: number; b: number } | null;
  bright?: boolean;
}
