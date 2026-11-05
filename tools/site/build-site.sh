#!/bin/sh
# Builds the complete CodeForge website into ./dist-site (or the folder you pass):
#   /              landing page            (site/)
#   /app/          the web editor          (tools/web/build.sh)
#   /code/         source-code browser     (tools/site/gen-code.py)
#   /download/     APK + Google Play page  (site/download)
#   /downloads/    CodeForge.apk (if available), apk.json, CodeForge-source.zip
# APK: pass APK=/path/to/app-release.apk, or build one first (./gradlew assembleRelease) and it is picked up from app/build/outputs.
set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"; OUT="${1:-$ROOT/dist-site}"
rm -rf "$OUT"; mkdir -p "$OUT"
cp -R "$ROOT/site/." "$OUT/"

# 1. web editor under /app/
sh "$ROOT/tools/web/build.sh" "$OUT/app" >/dev/null
python3 - "$OUT/app/index.html" <<'PY'
import sys
p = sys.argv[1]; s = open(p, encoding="utf-8").read()
# Lets the site config (backend/server.js, or a static site-config.js) provide the Git CORS proxy to the editor on first run.
tag = ('<script src="../site-config.js"></script>\n<script>try{var c=window.CF_SITE&&CF_SITE.proxy;'
       'if(c&&!localStorage.getItem("cf.corsProxy"))localStorage.setItem("cf.corsProxy",new URL(c,location.href).href)}catch(e){}</script>\n')
assert "<head>" in s
open(p, "w", encoding="utf-8").write(s.replace("<head>", "<head>\n" + tag, 1))
PY

# 2. source browser + source zip
python3 "$ROOT/tools/site/gen-code.py" "$ROOT" "$OUT"

# 3. APK
mkdir -p "$OUT/downloads"
if [ -z "$APK" ]; then
  for f in "$ROOT"/app/build/outputs/apk/release/*.apk "$ROOT"/app/build/outputs/apk/debug/*.apk; do [ -f "$f" ] && APK="$f" && break; done
fi
if [ -n "$APK" ] && [ -f "$APK" ]; then
  cp "$APK" "$OUT/downloads/CodeForge.apk"
  python3 - "$OUT/downloads" <<'PY'
import hashlib, json, os, sys
d = sys.argv[1]; f = os.path.join(d, "CodeForge.apk")
json.dump({"file": "CodeForge.apk", "size": os.path.getsize(f), "sha256": hashlib.sha256(open(f, "rb").read()).hexdigest()}, open(os.path.join(d, "apk.json"), "w"))
PY
  echo "APK included: $(du -h "$OUT/downloads/CodeForge.apk" | cut -f1)"
else
  echo '{}' > "$OUT/downloads/apk.json"
  echo "No APK found: the download page will say it has not been uploaded yet. (Set APK=/path/to.apk or build with Gradle first.)"
fi
echo "Site built in $OUT ($(du -sh "$OUT" | cut -f1)). Preview: node backend/server.js"
