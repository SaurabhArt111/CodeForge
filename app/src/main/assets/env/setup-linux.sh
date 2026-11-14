#!/bin/sh
# Runs INSIDE the Alpine guest (through start-linux.sh). Installs the packages chosen in the setup wizard.
# usage: setup-linux.sh <package> [<package> ...]
set -u
say() { printf '\033[1;34m[*]\033[0m %s\n' "$*"; }
ok()  { printf '\033[1;32m[+]\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m[!]\033[0m %s\n' "$*"; }

say "Updating package index..."
apk update || err "apk update failed (check your network connection)"

PKGS="bash coreutils findutils grep sed gawk less nano curl wget ca-certificates openssl tzdata shadow $*"
say "Installing: $PKGS"
if apk add --no-cache $PKGS; then ok "Packages installed."; else err "Some packages failed to install; run 'apk add <name>' to retry."; fi

mkdir -p /etc/profile.d /usr/local/bin
cat > /etc/profile.d/10-codeforge.sh <<'PROFILE'
export PATH="$HOME/.npm-global/bin:/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:$PATH"
export LANG=C.UTF-8
export COLORTERM=truecolor
export EDITOR=nano
export NPM_CONFIG_PREFIX="$HOME/.npm-global"
export npm_config_cache=/var/cache/npm PIP_CACHE_DIR=/var/cache/pip XDG_CACHE_HOME=/var/cache/xdg
case "$-" in *i*)
  alias ll='ls -lah --color=auto'
  alias ls='ls --color=auto'
  alias grep='grep --color=auto'
  PS1='\[\e[1;32m\]\u\[\e[0m\]@\[\e[1;34m\]codeforge\[\e[0m\] \[\e[1;33m\]\w\[\e[0m\] \$ '
  ;;
esac
PROFILE
[ -f /root/.bashrc ] || printf '[ -f /etc/profile ] && . /etc/profile\n' > /root/.bashrc
[ -f /root/.bash_profile ] || printf '[ -f ~/.bashrc ] && . ~/.bashrc\n' > /root/.bash_profile

# `code` / `codeforge`: open files or folders in the IDE (uses a private terminal escape sequence).
cat > /usr/local/bin/code <<'CODE'
#!/bin/sh
if [ $# -eq 0 ]; then set -- .; fi
for p in "$@"; do
  case "$p" in /*) abs="$p" ;; *) abs="$(cd "$(dirname "$p")" 2>/dev/null && pwd)/$(basename "$p")" ;; esac
  [ -d "$p" ] && abs="$(cd "$p" && pwd)"
  printf '\033]7770;open;%s\007' "$abs"
done
CODE
chmod +x /usr/local/bin/code
ln -sf /usr/local/bin/code /usr/local/bin/codeforge

if command -v git >/dev/null 2>&1; then
  git config --global init.defaultBranch main 2>/dev/null
  git config --global --get-all safe.directory >/dev/null 2>&1 || git config --global --add safe.directory '*'
fi
mkdir -p /root/.npm-global /var/cache/npm /var/cache/pip /var/cache/xdg
touch /root/.codeforge-setup-done
ok "Setup finished. Type 'code .' to open the current folder in CodeForge."
