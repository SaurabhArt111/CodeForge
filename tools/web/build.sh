#!/bin/sh
# Builds the static web version of CodeForge into ./web-dist (deploy it to any static host over HTTPS, e.g. GitHub Pages).
# The Android app is NOT touched: the web build is a copy of app/src/main/assets/www plus a flag that switches the bridge
# to core/webhost.js (IndexedDB filesystem, fetch networking, mini shell), a PWA manifest and a service worker.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; OUT="${1:-$ROOT/web-dist}"
SRC="$ROOT/app/src/main/assets/www"
rm -rf "$OUT"; mkdir -p "$OUT"; cp -R "$SRC/." "$OUT/"
cp -R "$ROOT/tools/web/icons" "$OUT/icons"; cp "$ROOT/tools/web/sw.js" "$OUT/sw.js"; cp "$ROOT/tools/web/manifest.webmanifest" "$OUT/manifest.webmanifest"
cp "$SRC/assets/logo.svg" "$OUT/icons/icon.svg"
python3 - "$OUT/index.html" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding="utf-8").read()
tag = '<script>window.__CF_WEB = true;</script>\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icons/icon-192.png">\n'
assert "<head>" in s
s = s.replace("<head>", "<head>\n" + tag, 1)
sw = '<script>if ("serviceWorker" in navigator && location.protocol === "https:" || location.hostname === "localhost") navigator.serviceWorker.register("sw.js").catch(function () {});</script>\n</body>'
assert "</body>" in s
s = s.replace("</body>", sw, 1)
open(p, "w", encoding="utf-8").write(s)
PY
echo "Web build written to $OUT ($(du -sh "$OUT" | cut -f1))"
