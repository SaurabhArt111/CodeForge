#!/bin/sh
# Run once from the repository root after copying this project over an older CodeForge repository.
# Removes the old standalone web app (root index.html, public/, server/, server.js, vite.config.mjs, package.json, vercel.json, layout/ …),
# which this project replaces with website/ (React + Node) and tools/web (the web editor build), and makes the build scripts executable in Git.
set -e
cd "$(dirname "$0")/.."
for p in index.html public server server.js vite.config.mjs package.json package-lock.json vercel.json layout site backend dist-site tools/site; do
  [ -e "$p" ] && { echo "removing $p"; if command -v git >/dev/null 2>&1 && [ -d .git ]; then git rm -r -q --cached "$p" 2>/dev/null || true; fi; rm -rf "$p"; }
done
chmod +x gradlew tools/web/build.sh tools/devhost/restart.sh 2>/dev/null || true
if command -v git >/dev/null 2>&1 && [ -d .git ]; then git update-index --chmod=+x gradlew tools/web/build.sh tools/devhost/restart.sh 2>/dev/null || true; fi
echo "done. Review with: git status"
