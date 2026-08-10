#!/usr/bin/env bash
# Build on a local filesystem, then copy main.js into this plugin folder.
# Needed when the vault lives on a network/remote volume that cannot
# execute npm package binaries (EACCES / no symlinks).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$(mktemp -d /tmp/system-app-launcher-build.XXXXXX)"
cleanup() { rm -rf "$BUILD_DIR"; }
trap cleanup EXIT

cp -a "$ROOT/src" "$ROOT/package.json" "$ROOT/tsconfig.json" "$ROOT/esbuild.config.mjs" "$ROOT/manifest.json" "$BUILD_DIR/"
cd "$BUILD_DIR"
npm install
npm run build
cp -f "$BUILD_DIR/main.js" "$ROOT/main.js"
echo "Wrote $ROOT/main.js"
