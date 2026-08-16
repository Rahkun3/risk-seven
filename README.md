# Risk Seven

A Flip 7–style table game. Play solo against AI, or host a table so friends can join with a code.

First to 200. Empty seats are filled with AI. Max 4 at a table.

## Run locally

```bash
npm install
npm test
./start.sh
```

Then open http://127.0.0.1:8765/

`./start.sh` also opens a temporary Cloudflare tunnel so friends can join from the internet. On Unraid you do **not** need that — expose the port or put it behind a reverse proxy instead.

## Deploy to GitHub, then Unraid

### 1. Create the GitHub repo

1. On GitHub: **New repository** named `risk-seven`. Leave it empty (no README).
2. Public is easiest for Unraid (no login to pull the image).

On this Mac:

```bash
cd /Users/bramhendriks/Code/risk-seven
git remote add origin https://github.com/YOUR_GITHUB_USER/risk-seven.git
git push -u origin main
```

Use your GitHub username in place of `YOUR_GITHUB_USER`.

### 2. Let GitHub build the Docker image

Pushing to `main` runs `.github/workflows/publish.yml` and publishes:

`ghcr.io/YOUR_GITHUB_USER/risk-seven:latest`

First time only:

1. Open the repo on GitHub → **Actions** and confirm the workflow ran green.
2. Open **https://github.com/YOUR_GITHUB_USER/risk-seven/pkgs/container/risk-seven**
3. **Package settings** → change visibility to **Public** (otherwise Unraid cannot pull it).

GitHub lowercases the owner in the image name. If your user is `BramHendriks`, the image is `ghcr.io/bramhendriks/risk-seven`.

### 3. Run it on Unraid

**Docker → Add Container**

| Field | Value |
|---|---|
| Name | `risk-seven` |
| Repository | `ghcr.io/YOUR_GITHUB_USER/risk-seven:latest` |
| Network Type | Bridge |
| Port | Host `8765` → Container `8765` (TCP) |
| Extra Parameters | `--restart=unless-stopped` |

No appdata share is required. The game keeps tables in memory.

Then open `http://UNRAID_IP:8765/` on your LAN.

### 4. Play from the internet (Unraid)

Point Nginx Proxy Manager, SWAG, or Caddy at the container. WebSockets must be allowed.

Nginx / NPM custom config:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_read_timeout 86400;
```

Use HTTPS. The browser will then use `wss://` automatically.

Optional container variable if you want the server to know its public address:

`PUBLIC_URL=https://riskseven.yourdomain.com`

Host a table, share the **code** (not a special invite link). Friends open the same site and **Join table**.

## Docker on this Mac (smoke test)

```bash
cd /Users/bramhendriks/Code/risk-seven
docker build -t risk-seven .
docker run --rm -p 8765:8765 risk-seven
```

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8765` | HTTP + WebSocket port |
| `HOST` | `0.0.0.0` | Bind address |
| `PUBLIC_URL` | empty | Public https origin, if any |
| `RECONNECT_MS` | `20000` | Time to reclaim a seat after disconnect |
