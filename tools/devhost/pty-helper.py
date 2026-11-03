#!/usr/bin/env python3
"""PTY relay for the CodeForge dev host: pty-helper.py <cwd> <cmd> [args...]
stdin/stdout carry raw terminal bytes; fd 3 carries control lines ("R <rows> <cols>")."""
import os, pty, sys, select, fcntl, termios, struct, signal

cwd = sys.argv[1]
cmd = sys.argv[2:]
pid, fd = pty.fork()
if pid == 0:
    os.chdir(cwd)
    os.execvp(cmd[0], cmd)
def resize(rows, cols):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
ctl = 3
buf = b""
alive = True
while alive:
    try:
        r, _, _ = select.select([fd, 0, ctl], [], [], 0.5)
    except (OSError, ValueError):
        break
    if fd in r:
        try:
            data = os.read(fd, 65536)
        except OSError:
            break
        if not data:
            break
        os.write(1, data)
    if 0 in r:
        data = os.read(0, 65536)
        if not data:
            os.kill(pid, signal.SIGHUP)
        else:
            os.write(fd, data)
    if ctl in r:
        try:
            d = os.read(ctl, 4096)
        except OSError:
            d = b""
        buf += d
        while b"\n" in buf:
            line, buf = buf.split(b"\n", 1)
            p = line.decode().split()
            if p and p[0] == "R" and len(p) == 3:
                resize(int(p[1]), int(p[2]))
    try:
        done, status = os.waitpid(pid, os.WNOHANG)
        if done:
            alive = False
    except ChildProcessError:
        alive = False
try:
    _, status = os.waitpid(pid, 0)
except ChildProcessError:
    status = 0
sys.exit(os.waitstatus_to_exitcode(status) if hasattr(os, "waitstatus_to_exitcode") else 0)
