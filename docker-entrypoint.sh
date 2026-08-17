#!/bin/sh
set -e
export PORT="${PORT:-8765}"
export HOST="${HOST:-0.0.0.0}"

if [ "$(id -u)" = 0 ]; then
  if command -v iptables >/dev/null 2>&1; then
    iptables -t nat -C PREROUTING -p tcp -j REDIRECT --to-ports "$PORT" 2>/dev/null \
      || iptables -t nat -A PREROUTING -p tcp -j REDIRECT --to-ports "$PORT" 2>/dev/null \
      || true
  fi
  exec su-exec node:node node server/index.js
fi

exec node server/index.js
