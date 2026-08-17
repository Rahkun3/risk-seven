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

## Deploy to Unraid

Template: [`unraid/risk-seven.xml`](unraid/risk-seven.xml)

**Port** is the only port you set. That number is the **host** port (what you type in the browser). The container port stays **8765**. Do not change it. Do not add another port. Leave **WebUI** at the top as `http://[IP]:[PORT:8765]/`.

Example: Port `9010` means you open `http://UNRAID_IP:9010/`. Unraid forwards that to 8765 inside the container.

**Docker → Add Container**

| Field | Value |
|---|---|
| Name | `risk-seven` (or `risk-seven-dev` for a second copy) |
| Repository | `ghcr.io/rahkun3/risk-seven:dev` while on this branch, or `:latest` after a merge to `main` |
| Network Type | Bridge |
| WebUI | leave as `http://[IP]:[PORT:8765]/` |
| Port | Host **9010** (or any free port). Container **8765**. |
| Extra Parameters | `--restart=unless-stopped` |

A second copy: different container name, different **host** port, container port still **8765**.

### Cloudflare tunnel

| Field | Value |
|---|---|
| Type | HTTP (not HTTPS) |
| URL | `http://UNRAID_LAN_IP:9010` (your host port) |

Do not use `localhost`, the container name, or `https://` to the container.

### Reverse proxy

Point Nginx Proxy Manager, SWAG, or Caddy at the **host** port. WebSockets must be allowed.

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_read_timeout 86400;
```

Optional: `PUBLIC_URL=https://riskseven.yourdomain.com`

## Images

Pushing `dev` publishes `ghcr.io/rahkun3/risk-seven:dev`. Pushing `main` publishes `:latest`.

The package must be **public** or Unraid cannot pull it: GitHub → Packages → `risk-seven` → Package settings.

## Docker Compose

```bash
HOST_PORT=9010 docker compose up -d
HOST_PORT=9011 CONTAINER_NAME=risk-seven-dev docker compose up -d
```

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8765` | Listen port **inside** the container |
| `HOST` | `0.0.0.0` | Bind address |
| `PUBLIC_URL` | empty | Public https origin, if any |
| `RECONNECT_MS` | `20000` | Time to reclaim a seat after disconnect |
