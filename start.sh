#!/bin/zsh
set -euo pipefail
cd "$(dirname "$0")"
PORT="${PORT:-8765}"
export PORT
NODE="${NODE:-/opt/homebrew/bin/node}"
if ! command -v "$NODE" >/dev/null 2>&1; then NODE="$(command -v node)"; fi
if [ ! -d node_modules/ws ]; then
  echo "Installing table server…"
  npm install --omit=dev
fi

BIN_DIR="$PWD/.bin"
mkdir -p "$BIN_DIR"
SERVER_PID=""
TUNNEL_PID=""

cleanup() {
  trap - INT TERM EXIT
  if [ -n "${TUNNEL_PID}" ]; then kill "${TUNNEL_PID}" 2>/dev/null || true; fi
  if [ -n "${SERVER_PID}" ]; then kill "${SERVER_PID}" 2>/dev/null || true; fi
}
trap cleanup INT TERM EXIT

ensure_cloudflared() {
  if command -v cloudflared >/dev/null 2>&1; then
    echo "$(command -v cloudflared)"
    return 0
  fi
  if [ -x "$BIN_DIR/cloudflared" ]; then
    echo "$BIN_DIR/cloudflared"
    return 0
  fi
  local arch asset
  arch="$(uname -m)"
  if [ "$arch" = "arm64" ]; then asset="cloudflared-darwin-arm64.tgz"
  else asset="cloudflared-darwin-amd64.tgz"
  fi
  echo "Downloading a Cloudflare tunnel so friends can join from the internet…" >&2
  if curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}" -o "$BIN_DIR/cf.tgz"; then
    tar -xzf "$BIN_DIR/cf.tgz" -C "$BIN_DIR"
    rm -f "$BIN_DIR/cf.tgz"
    chmod +x "$BIN_DIR/cloudflared"
    echo "$BIN_DIR/cloudflared"
    return 0
  fi
  return 1
}

post_public() {
  local url="$1"
  curl -sS -X POST "http://127.0.0.1:${PORT}/api/public" \
    -H "Content-Type: application/json" \
    -d "{\"url\":\"${url}\"}" >/dev/null || true
  echo "$url" > "$PWD/.public-url"
}

start_tunnel() {
  local cf
  if ! cf="$(ensure_cloudflared)"; then
    echo "No tunnel binary. Friends on this Wi‑Fi can still join."
    echo "Set PUBLIC_URL if you already have a public address, or install cloudflared."
    return 0
  fi
  echo "Opening an internet tunnel…"
  "$cf" tunnel --url "http://127.0.0.1:${PORT}" --no-autoupdate 2>&1 | while IFS= read -r line; do
    echo "$line"
    if [[ "$line" == *trycloudflare.com* ]]; then
      url="$(print -r -- "$line" | grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare.com' | head -n 1 || true)"
      if [ -n "${url:-}" ]; then
        post_public "$url"
        echo ""
        echo "  internet  ${url}"
        echo "  share     ${url}"
        echo ""
      fi
    fi
  done &
  TUNNEL_PID=$!
}

"$NODE" server/index.js &
SERVER_PID=$!

ok=0
for _ in {1..80}; do
  if curl -sf "http://127.0.0.1:${PORT}/api/info" >/dev/null; then
    ok=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "Table server failed to start."
    exit 1
  fi
  sleep 0.1
done
if [ "$ok" -ne 1 ]; then
  echo "Table server did not become ready."
  exit 1
fi

if [ -n "${PUBLIC_URL:-}" ]; then
  post_public "$PUBLIC_URL"
  echo "  internet  ${PUBLIC_URL}"
elif [ "${LAN_ONLY:-0}" != "1" ]; then
  start_tunnel
fi

wait "$SERVER_PID"
