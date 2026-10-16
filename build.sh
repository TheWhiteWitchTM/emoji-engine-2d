#!/usr/bin/env bash
set -e

rm -rf build
mkdir -p build

# Compile TypeScript to plain JS in build/
npx tsc --outDir build --module esnext --target es2022 --moduleResolution bundler --declaration

# Optional: copy a simple browser-ready entry if you want
# cp src/index.ts build/ 2>/dev/null || true

echo "Build complete → build/"
