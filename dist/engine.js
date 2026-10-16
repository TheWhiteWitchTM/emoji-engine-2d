import { Canvas, paintEmoji } from './canvas.js';
/**
 * Sprites, motion, circle collision, keyboard, beep, and the frame loop.
 * Uses a Canvas and does not build header or footer chrome.
 */
export class Engine {
    canvas;
    sprites = [];
    collisions = [];
    keys = new Set();
    audio = null;
    raf = 0;
    running = false;
    inUpdate = false;
    /** Use `options.canvas`, or create one. Does not build page chrome. */
    constructor(options = {}) {
        this.canvas = options.canvas ?? new Canvas({
            width: options.width,
            height: options.height,
        });
        this.armKeys();
    }
    /**
     * Create a sprite and place it on a named canvas layer.
     * `size` is the font size in pixels and defaults to 32.
     * `layer` defaults to `default`.
     */
    sprite(emoji, x, y, size = 32, layer = 'default') {
        const sprite = new EmojiSprite(emoji, x, y, size, layer);
        this.sprites.push(sprite);
        this.canvas.add(sprite, layer);
        return sprite;
    }
    /** Set per-frame velocity in pixels. */
    motion(sprite, vx, vy) {
        sprite.vx = vx;
        sprite.vy = vy;
    }
    /**
     * Register a callback for living sprites whose circles overlap.
     * The returned function removes this registration. Calling it again does nothing.
     * Two registrations of one function are removed separately.
     */
    onCollision(handler) {
        const entry = { handler };
        this.collisions.push(entry);
        return () => {
            const index = this.collisions.indexOf(entry);
            if (index >= 0)
                this.collisions.splice(index, 1);
        };
    }
    /**
     * Move living sprites by `vx`/`vy`, then report circle overlaps.
     * Pairs are chosen after the move and do not change while handlers run.
     * Throws when called from a collision handler.
     */
    update() {
        if (this.inUpdate) {
            throw new Error('Engine.update cannot be called from a collision handler');
        }
        this.inUpdate = true;
        try {
            const live = [];
            for (const sprite of this.sprites) {
                if (!sprite.alive)
                    continue;
                sprite.x += sprite.vx;
                sprite.y += sprite.vy;
                live.push(sprite);
            }
            const pairs = [];
            for (let i = 0; i < live.length; i += 1) {
                for (let j = i + 1; j < live.length; j += 1) {
                    const a = live[i];
                    const b = live[j];
                    if (a === b || !circlesOverlap(a, b))
                        continue;
                    pairs.push([a, b]);
                }
            }
            // Copy first so a handler can unsubscribe without skipping the next
            // registration. A handler removed before its turn does not run. A
            // handler added during this update waits until the next update.
            const handlers = this.collisions.slice();
            for (const [a, b] of pairs) {
                for (const entry of handlers) {
                    if (this.collisions.indexOf(entry) < 0)
                        continue;
                    entry.handler(a, b);
                }
            }
        }
        finally {
            this.inUpdate = false;
        }
    }
    /** Start the `requestAnimationFrame` loop. Each frame updates, then draws. */
    start() {
        if (this.running)
            return;
        if (typeof requestAnimationFrame !== 'function') {
            throw new Error('requestAnimationFrame is unavailable');
        }
        this.running = true;
        this.raf = requestAnimationFrame(this.tick);
    }
    /** Stop the frame loop. */
    stop() {
        this.running = false;
        if (typeof cancelAnimationFrame === 'function')
            cancelAnimationFrame(this.raf);
    }
    /** True while `key` (`KeyboardEvent.key`) is held. */
    isKeyDown(key) {
        return this.keys.has(key);
    }
    /**
     * Play a short square-wave beep.
     * `freq` is Hertz (default 440) and `duration` is milliseconds (default 120).
     * Does nothing when the Web Audio API is missing.
     */
    beep(freq = 440, duration = 120) {
        const AudioCtor = globalThis.AudioContext;
        if (typeof AudioCtor !== 'function')
            return;
        try {
            const audio = this.audio ?? new AudioCtor();
            this.audio = audio;
            const osc = audio.createOscillator();
            const gain = audio.createGain();
            osc.type = 'square';
            osc.frequency.value = freq;
            gain.gain.value = 0.05;
            osc.connect(gain);
            gain.connect(audio.destination);
            const stopAt = audio.currentTime + duration / 1000;
            gain.gain.exponentialRampToValueAtTime(0.0001, stopAt);
            osc.start();
            osc.stop(stopAt);
        }
        catch {
            // Autoplay policies and headless hosts can reject audio. The game continues.
        }
    }
    tick = () => {
        if (!this.running)
            return;
        try {
            this.update();
            this.canvas.draw();
        }
        catch (error) {
            this.running = false;
            throw error;
        }
        if (!this.running)
            return;
        this.raf = requestAnimationFrame(this.tick);
    };
    armKeys() {
        if (typeof window === 'undefined' || typeof window.addEventListener !== 'function')
            return;
        window.addEventListener('keydown', (event) => {
            this.keys.add(event.key);
        });
        window.addEventListener('keyup', (event) => {
            this.keys.delete(event.key);
        });
    }
}
class EmojiSprite {
    emoji;
    x;
    y;
    size;
    vx = 0;
    vy = 0;
    layer;
    alive = true;
    data = {};
    constructor(emoji, x, y, size, layer) {
        this.emoji = emoji;
        this.x = x;
        this.y = y;
        this.size = size;
        this.layer = layer;
    }
    get radius() {
        return this.size / 2;
    }
    draw(ctx, camera) {
        if (!this.alive)
            return;
        paintEmoji(ctx, camera, this.emoji, this.x, this.y, this.size);
    }
}
function circlesOverlap(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const reach = a.radius + b.radius;
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(reach))
        return false;
    return dx * dx + dy * dy <= reach * reach;
}
//# sourceMappingURL=engine.js.map