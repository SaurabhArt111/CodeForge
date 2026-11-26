#!/bin/sh
# pkg: one package command for every Linux system in CodeForge (Termux-style).
# Alpine uses apk; Debian and Ubuntu use apt. Common Alpine package names are translated for apt.
# usage: pkg install|add <names…> | remove|uninstall <names…> | update | upgrade | search <text> | list | show <name> | files <name>
set -u
if command -v apk >/dev/null 2>&1; then PM=apk
elif command -v apt-get >/dev/null 2>&1; then PM=apt
else echo "pkg: no supported package manager (apk or apt) found" >&2; exit 1; fi

# Alpine name -> Debian / Ubuntu name (empty = not needed there)
map() {
  for n in "$@"; do
    case "$n" in
      py3-pip) echo python3-pip ;;
      py3-*) echo "python3-${n#py3-}" ;;
      build-base) echo build-essential ;;
      shadow) echo passwd ;;
      openssh-client|openssh) echo openssh-client ;;
      php8*-cli|php8*) echo php-cli ;;
      openjdk17|openjdk17-jdk) echo openjdk-17-jdk-headless ;;
      openjdk21|openjdk21-jdk) echo openjdk-21-jdk-headless ;;
      go) echo golang ;;
      rust) echo rustc ;;
      nodejs-current) echo nodejs ;;
      gcompat|libc6-compat|musl-dev) ;;
      *) echo "$n" ;;
    esac
  done | awk 'NF && !seen[$0]++'
}

apt_ready() {   # the first install after setting up needs a package list
  [ -n "$(ls /var/lib/apt/lists/ 2>/dev/null | grep -v -e lock -e partial)" ] || apt-get update
}

cmd="${1:-help}"; [ $# -gt 0 ] && shift
export DEBIAN_FRONTEND=noninteractive
case "$PM:$cmd" in
  apk:install|apk:add|apk:i) exec apk add --no-cache "$@" ;;
  apk:remove|apk:uninstall|apk:rm) exec apk del "$@" ;;
  apk:update) exec apk update ;;
  apk:upgrade) apk update && exec apk upgrade ;;
  apk:search|apk:s) exec apk search -v "$@" ;;
  apk:list|apk:list-installed) exec apk info ;;
  apk:show|apk:info) exec apk info -a "$@" ;;
  apk:files) exec apk info -L "$@" ;;
  apt:install|apt:add|apt:i)
    apt_ready
    # shellcheck disable=SC2046
    set -- $(map "$@")
    [ $# -eq 0 ] && exit 0
    # skip names apt does not know so one unknown package does not stop the rest
    known=""; for n in "$@"; do if apt-cache show "$n" >/dev/null 2>&1; then known="$known $n"; else echo "pkg: no package called '$n' here (try: pkg search $n)" >&2; fi; done
    [ -z "$known" ] && exit 1
    # shellcheck disable=SC2086
    exec apt-get install -y --no-install-recommends $known ;;
  apt:remove|apt:uninstall|apt:rm) exec apt-get remove -y "$@" ;;
  apt:update) exec apt-get update ;;
  apt:upgrade) apt-get update && exec apt-get upgrade -y ;;
  apt:search|apt:s) apt_ready; exec apt-cache search "$@" ;;
  apt:list|apt:list-installed) exec dpkg-query -W -f='${Package} ${Version}\n' ;;
  apt:show|apt:info) exec apt-cache show "$@" ;;
  apt:files) exec dpkg -L "$@" ;;
  *:help|*:-h|*:--help|*)
    cat <<HELP
pkg - install Linux software ($PM on this system)
  pkg install <name…>   install packages (e.g. pkg install nodejs python3 git)
  pkg remove <name…>    remove packages
  pkg update            refresh the package list
  pkg upgrade           update everything
  pkg search <text>     find packages
  pkg list              list installed packages
  pkg show <name>       details of a package
  pkg files <name>      files a package installed
HELP
    [ "$cmd" = help ] || [ "$cmd" = -h ] || [ "$cmd" = --help ] ;;
esac
