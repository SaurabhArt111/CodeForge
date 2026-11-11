#!/bin/sh
# cf — talk to the CodeForge IDE from the terminal (works in the Linux environment and in the Android shell).
# Uses a private terminal escape sequence (OSC 7770) that the IDE listens for.
osc() { printf '\033]7770;%s;%s\007' "$1" "$2"; }
b64() { if command -v base64 >/dev/null 2>&1; then base64 | tr -d '\n\r'; else openssl base64 -A 2>/dev/null; fi; }
abs() { case "$1" in /*) printf '%s' "$1" ;; ~*) printf '%s' "$HOME${1#\~}" ;; *) printf '%s/%s' "$PWD" "$1" ;; esac; }
say() { printf '%s\n' "$*"; }

CLIS="claude codex gemini opencode copilot qwen aider"
cli_pkg() { case "$1" in
  claude) echo "npm:@anthropic-ai/claude-code" ;; codex) echo "npm:@openai/codex" ;; gemini) echo "npm:@google/gemini-cli" ;;
  opencode) echo "npm:opencode-ai" ;; copilot) echo "npm:@github/copilot" ;; qwen) echo "npm:@qwen-code/qwen-code" ;;
  aider) echo "pip:aider-chat" ;; *) return 1 ;; esac; }
cli_install() {
  spec=$(cli_pkg "$1") || { say "cf: unknown CLI '$1' (try: $CLIS)"; return 1; }
  case "$spec" in
    npm:*) command -v npm >/dev/null 2>&1 || { say "cf: npm not found — set up the Linux environment first (Terminal ▸ Set up Linux)"; return 1; }; say "Installing ${spec#npm:}…"; npm i -g "${spec#npm:}" ;;
    pip:*) command -v pip >/dev/null 2>&1 || { say "cf: pip not found — set up the Linux environment first"; return 1; }; say "Installing ${spec#pip:}…"; pip install --break-system-packages "${spec#pip:}" ;;
  esac
}
need_text() { [ $# -gt 0 ] && { printf '%s' "$*"; return; }; if [ ! -t 0 ]; then head -c 60000; fi; }

cmd="${1:-help}"; [ $# -gt 0 ] && shift
case "$cmd" in
  open|edit|o)
    [ $# -eq 0 ] && set -- .
    for p in "$@"; do osc open "$(abs "$p")"; done ;;
  project|folder)
    d="${1:-.}"; osc open "$(cd "$d" 2>/dev/null && pwd || abs "$d")" ;;
  url|browser|b)
    [ $# -eq 0 ] && { say "usage: cf url <https://…>"; exit 1; }; for u in "$@"; do osc url "$u"; done ;;
  preview|p)
    [ $# -eq 0 ] && { say "usage: cf preview <file.html | http://localhost:5173>"; exit 1; }
    case "$1" in http*) osc preview "$1" ;; *) osc preview "$(abs "$1")" ;; esac ;;
  serve|live)
    d="${1:-.}"; osc serve "$(cd "$d" 2>/dev/null && pwd || abs "$d")" ;;
  ai|ask)
    # cf ai how do I …      |  git diff | cf ai review this      |  cf ai -s "send immediately"
    send=0; agent=0
    while [ $# -gt 0 ]; do case "$1" in -s|--send) send=1; shift ;; -a|--agent) agent=1; send=1; shift ;; *) break ;; esac; done
    txt=$(need_text "$@")
    if [ ! -t 0 ] && [ $# -gt 0 ]; then txt="$txt
$(head -c 60000)"; fi
    [ -z "$txt" ] && { say "usage: cf ai [-s] [-a] <prompt>   (pipe text in to attach it)"; exit 1; }
    osc ai "$send,$agent,$(printf '%s' "$txt" | b64)" ;;
  agent) exec "$0" ai -a "$@" ;;
  settings|prefs) osc settings "$*" ;;
  crashes|crash) osc crashes "" ;;
  toast|notify) osc toast "$*" ;;
  install)
    [ $# -eq 0 ] && { say "usage: cf install <$CLIS>"; exit 1; }; for c in "$@"; do cli_install "$c"; done ;;
  run)
    [ $# -eq 0 ] && { say "usage: cf run <$CLIS> [args…]"; exit 1; }
    c="$1"; shift
    command -v "$c" >/dev/null 2>&1 || cli_install "$c" || exit 1
    exec "$c" "$@" ;;
  clis|list)
    for c in $CLIS; do if command -v "$c" >/dev/null 2>&1; then printf '  ✓ %-9s installed\n' "$c"; else printf '  · %-9s cf install %s\n' "$c" "$c"; fi; done ;;
  version|-v|--version) say "cf 1.1 (CodeForge)" ;;
  help|-h|--help|*)
    [ "$cmd" != help ] && [ "$cmd" != -h ] && [ "$cmd" != --help ] && say "cf: unknown command '$cmd'"
    cat <<'HELP'
cf — control the CodeForge IDE from the terminal

  cf open <file>[:line] …    open files in the editor        (alias: code)
  cf project [dir]           open a folder as the project
  cf preview <file|url>      live preview (HTML file or http://localhost:…)
  cf serve [dir]             start the live server for a folder
  cf url <https://…>         open a link (browser or in-app, see Settings)
  cf ai <prompt>             put a prompt in the AI panel (-s sends it, -a runs the agent)
  git diff | cf ai -s review this      pipe text in as context
  cf settings [search]       open Settings         cf crashes   show crash reports
  cf toast <message>         show a notification in the IDE
  cf install <cli>           install a coding CLI   cf run <cli>   install (if needed) and start it
  cf clis                    list coding CLIs: claude codex gemini opencode copilot qwen aider
HELP
    ;;
esac
