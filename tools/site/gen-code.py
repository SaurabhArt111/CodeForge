#!/usr/bin/env python3
"""Writes the data behind the site's code browser: <out>/code/tree.json, <out>/code/src/<files> and <out>/downloads/CodeForge-source.zip.
usage: gen-code.py <repo-root> <site-out-dir>"""
import json, os, sys, zipfile

root, out = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
SKIP_DIRS = {"node_modules", "vendor", "build", ".gradle", ".git", "web-dist", "dist-site", ".idea", "shots", "fonts", "__pycache__", ".cxx"}
BIN = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".ttf", ".woff", ".woff2", ".otf", ".so", ".zip", ".apk", ".jar", ".keystore", ".jks", ".gz", ".tar", ".pdf", ".mp4", ".wasm", ".class", ".lock"}
MAX = 320_000
files = []
for dp, dns, fns in os.walk(root):
    dns[:] = sorted(d for d in dns if d not in SKIP_DIRS)
    for fn in sorted(fns):
        ext = os.path.splitext(fn)[1].lower(); full = os.path.join(dp, fn); rel = os.path.relpath(full, root).replace(os.sep, "/")
        if ext in BIN or fn in {"local.properties", "gradlew.bat"} or os.path.getsize(full) > MAX or rel.startswith("docs/VSCODE"): continue
        try: text = open(full, encoding="utf-8").read()
        except Exception: continue
        files.append((rel, full, text))

LANG = {".kt": "Kotlin", ".kts": "Kotlin", ".java": "Kotlin", ".js": "JavaScript", ".mjs": "JavaScript", ".css": "CSS", ".html": "HTML", ".sh": "Shell", ".py": "Python", ".json": "JSON", ".md": "Markdown", ".xml": "XML", ".yml": "YAML", ".cpp": "C++", ".c": "C++", ".h": "C++"}
counts = {}
meta = []
for rel, full, text in files:
    lines = text.count("\n") + (0 if text.endswith("\n") or not text else 1)
    meta.append({"path": rel, "size": len(text.encode()), "lines": lines})
    if rel.startswith(("tools/e2e", "site/")) is False:
        l = LANG.get(os.path.splitext(rel)[1].lower());
        if l and l not in ("JSON", "Markdown", "XML", "YAML"): counts[l] = counts.get(l, 0) + lines
total = sum(counts.values()) or 1
langs = [{"name": k, "share": v / total} for k, v in sorted(counts.items(), key=lambda kv: -kv[1])]

have = {m["path"] for m in meta}
W = "app/src/main/assets/www/js/"; K = "app/src/main/java/dev/codeforge/ide/"
MODULES = [
    ("Native bridge", "One JSON-RPC channel between the web UI and Kotlin: files, terminals, network, secrets, crash reports.", [K + "bridge/Bridge.kt", W + "core/bridge.js", K + "MainActivity.kt"]),
    ("Crash recorder", "Native and JS error capture, breadcrumbs, Android exit history, and the reports screen.", [K + "core/CrashRecorder.kt", W + "core/crash.js", W + "ui/crashes.js"]),
    ("Crash-proof preview", "Previews open in a separate process; the live server throttles and guards what pages can send.", [K + "PreviewActivity.kt", K + "core/LiveServer.kt", W + "features/live.js"]),
    ("Terminal", "Native PTY sessions with flow control, the xterm.js front end and the cf command.", [K + "core/TermSession.kt", W + "ui/terminal.js", "app/src/main/assets/env/cf.sh"]),
    ("Sheets", "Top and bottom sheets that hold any view, with docking, persistence and a back-button stack.", [W + "ui/panel.js", W + "ui/keybar.js"]),
    ("Editor", "Monaco setup, tabs, split view, diff, autosave and formatting.", [W + "ui/editor.js", W + "features/format.js"]),
    ("AI assistants", "Streaming chat, agent tools with approvals, retries, project rules and provider setup.", [W + "features/ai.js"]),
    ("Text size and speed", "One text-size factor for the whole UI, and lazy loading of heavy libraries.", [W + "core/fontscale.js", W + "core/lazy.js", W + "main.js"]),
    ("Web version", "The same UI on a browser backend: IndexedDB files, fetch networking, a mini shell and an in-browser live server.", [W + "core/webhost.js", "tools/web/live-sw.js", "tools/web/build.sh", "tools/web/sw.js"]),
    ("Dev host and tests", "A Node server that emulates the native bridge, plus end-to-end tests run in headless Chromium.", ["tools/devhost/server.js", "tools/e2e/sheets.js", "tools/e2e/ai2.js"]),
    ("This website", "Landing page, download page, code browser and the optional backend.", ["tools/site/build-site.sh", "backend/server.js", "site/index.html"]),
]
modules = [{"title": t, "text": x, "files": [f for f in fs if f in have]} for t, x, fs in MODULES]
modules = [m for m in modules if m["files"]]

os.makedirs(os.path.join(out, "code"), exist_ok=True); os.makedirs(os.path.join(out, "downloads"), exist_ok=True)
for rel, full, text in files:
    dst = os.path.join(out, "code", "src", rel); os.makedirs(os.path.dirname(dst), exist_ok=True)
    open(dst, "w", encoding="utf-8").write(text)
json.dump({"files": meta, "langs": langs, "modules": modules}, open(os.path.join(out, "code", "tree.json"), "w"), separators=(",", ":"))
with zipfile.ZipFile(os.path.join(out, "downloads", "CodeForge-source.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    for rel, full, text in files: z.write(full, "CodeForge/" + rel)
    # vendored libraries are not listed in the code browser but are needed to build: include them in the ZIP
    for dp, dns, fns in os.walk(os.path.join(root, "app/src/main/assets/www/vendor")):
        for fn in fns:
            full = os.path.join(dp, fn); z.write(full, "CodeForge/" + os.path.relpath(full, root).replace(os.sep, "/"))
    for extra in ["app/src/main/assets/www/assets", "tools/web/vendor"]:
        for dp, dns, fns in os.walk(os.path.join(root, extra)):
            for fn in fns:
                full = os.path.join(dp, fn); arc = "CodeForge/" + os.path.relpath(full, root).replace(os.sep, "/")
                if arc not in z.namelist(): z.write(full, arc)
print(f"code browser: {len(meta)} files, {sum(m['lines'] for m in meta)} lines")
