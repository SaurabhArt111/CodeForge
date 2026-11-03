#!/bin/sh
# restart the dev host (used by e2e runs); tracks its pid in /tmp/cf-dev/devhost.pid
D="$(cd "$(dirname "$0")" && pwd)"
[ -f /tmp/cf-dev/devhost.pid ] && kill "$(cat /tmp/cf-dev/devhost.pid)" 2>/dev/null
sleep 1
cd "$D" || exit 1
nohup node server.js --root /tmp/cf-dev --port 8780 > /tmp/cf-dev/server.log 2>&1 &
echo $! > /tmp/cf-dev/devhost.pid
sleep 1.5
