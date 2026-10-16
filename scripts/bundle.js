import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['dist/index.js'],
  bundle: true,
  format: 'iife',
  globalName: 'EmojiEngine',
  footer: { js: 'globalThis.EmojiEngine = EmojiEngine;' },
  outfile: 'dist/emoji-engine-2d.js',
  platform: 'browser',
  target: 'es2022',
});
