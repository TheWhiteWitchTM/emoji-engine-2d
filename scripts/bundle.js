import esbuild from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const shared = {
  absWorkingDir: root,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'es2022',
  charset: 'utf8',
};

await esbuild.build({
  ...shared,
  entryPoints: ['dist/index.js'],
  globalName: 'EmojiEngine',
  footer: { js: 'globalThis.EmojiEngine = EmojiEngine;' },
  outfile: 'browser/emoji-engine-2d.js',
});

const minFile = 'browser/emoji-engine-2d.min.js';

await esbuild.build({
  ...shared,
  stdin: {
    contents: `import { Canvas, Terminal, Engine, Utilities } from './src/index.ts';
globalThis.EmojiEngine = { Canvas, Terminal, Engine, Utilities };
`,
    resolveDir: root,
    sourcefile: 'emoji-engine-2d.ts',
    loader: 'ts',
  },
  minify: true,
  legalComments: 'none',
  treeShaking: true,
  outfile: minFile,
});

for (const stale of ['dist/emoji-engine-2d.js', 'dist/emoji-engine-2d.min.js']) {
  rmSync(path.join(root, stale), { force: true });
}

const bytes = readFileSync(path.join(root, minFile));
const gzip = gzipSync(bytes).length;
console.log(`${minFile} ${bytes.length} bytes, ${gzip} gzip`);
