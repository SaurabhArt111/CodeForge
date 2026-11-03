#!/system/bin/sh
# CodeForge Linux launcher: runs a command (or a login shell) inside the Alpine root filesystem via proot.
# Adapted from Acode's init-sandbox.sh (MIT, (c) Foxdebug / Ajit Kumar).
#
# usage: start-linux.sh [--cwd DIR] [--] [command args...]
# env:   CF_NATIVE_DIR (libproot*.so)  CF_ENV  CF_ROOTFS  CF_HOME

CWD="$CF_HOME"
while [ $# -gt 0 ]; do
  case "$1" in
    --cwd) CWD="$2"; shift 2 ;;
    --) shift; break ;;
    *) break ;;
  esac
done

export LD_LIBRARY_PATH="$CF_ENV"
export PROOT_TMP_DIR="$CF_ENV/tmp"
mkdir -p "$PROOT_TMP_DIR" "$CF_ROOTFS/tmp"

[ -f "$CF_NATIVE_DIR/libproot.so" ] && export PROOT_LOADER="$CF_NATIVE_DIR/libproot.so"
[ -f "$CF_NATIVE_DIR/libproot32.so" ] && export PROOT_LOADER32="$CF_NATIVE_DIR/libproot32.so"

# proot links against libtalloc.so.2; Android only extracts it as libtalloc.so
rm -f "$CF_ENV/libtalloc.so.2"
ln -s "$CF_NATIVE_DIR/libtalloc.so" "$CF_ENV/libtalloc.so.2"
PROOT="$CF_NATIVE_DIR/libproot-xed.so"

ARGS="--kill-on-exit"
for m in /apex /odm /product /system /system_ext /vendor /linkerconfig/ld.config.txt /linkerconfig/com.android.art/ld.config.txt /plat_property_contexts /property_contexts; do
  if [ -e "$m" ]; then
    m=$(realpath "$m")
    ARGS="$ARGS -b $m"
  fi
done

ARGS="$ARGS -b /sdcard -b /storage -b /dev -b /data -b /dev/urandom:/dev/random -b /proc -b /sys"
ARGS="$ARGS -b $CF_HOME:/root"
ARGS="$ARGS -b $CF_ROOTFS/tmp:/dev/shm"

# PRoot canonicalises every -b path with realpath(3); /proc/self/fd/N links only resolve for real files.
SELF_PID=$$
can_bind() {
  if [ -d "$1" ]; then return 0; fi
  target=$(readlink "$1" 2>/dev/null) || return 1
  case "$target" in
    /*) [ -e "$target" ] ;;
    *) return 1 ;;
  esac
}
if can_bind "/proc/$SELF_PID/fd"; then ARGS="$ARGS -b /proc/self/fd:/dev/fd"; fi
if can_bind "/proc/$SELF_PID/fd/0"; then ARGS="$ARGS -b /proc/self/fd/0:/dev/stdin"; fi
if can_bind "/proc/$SELF_PID/fd/1"; then ARGS="$ARGS -b /proc/self/fd/1:/dev/stdout"; fi
if can_bind "/proc/$SELF_PID/fd/2"; then ARGS="$ARGS -b /proc/self/fd/2:/dev/stderr"; fi

ARGS="$ARGS -r $CF_ROOTFS -0 --link2symlink --sysvipc -L"

if [ $# -eq 0 ]; then
  set -- /bin/sh -c 'if command -v bash >/dev/null 2>&1; then exec bash -l; else exec ash -l; fi'
fi

# shellcheck disable=SC2086
exec "$PROOT" $ARGS -w "$CWD" "$@"
