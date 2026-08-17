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

You only set **WebUI Port** (any free host port). The app listens on 8765 inside the container. There is no `PORT` variable to fill in.

**Docker → Add Container**

| Field | Value |
|---|---|
| Name | `risk-seven` |
| Repository | `ghcr.io/rahkun3/risk-seven:latest` |
| Network Type | Bridge |
| WebUI Port | **(any free host port)** → container 8765 |
| Extra Parameters | `--restart=unless-stopped` |

Or add the template and fill **WebUI Port**.

Open `http://UNRAID_IP:YOUR_PORT/`

Use **Bridge** network.

### Cloudflare tunnel

In Zero Trust → your tunnel → Public hostname:

| Field | Value |
|---|---|
| Type | HTTP (not HTTPS) |
| URL | `http://UNRAID_LAN_IP:YOUR_HOST_PORT` |

Example: Unraid `192.168.1.50`, WebUI Port `9010` → `http://192.168.1.50:9010`

Do not use `localhost`, the container name, or `https://` to the container.

### Reverse proxy

Point Nginx Proxy Manager, SWAG, or Caddy at the host port you chose. WebSockets must be allowed.

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_read_timeout 86400;
```

Optional: `PUBLIC_URL=https://riskseven.yourdomain.com`

## Images

Pushing `main` publishes `ghcr.io/rahkun3/risk-seven:latest`.

The package must be **public** or Unraid cannot pull it: GitHub → Packages → `risk-seven` → Package settings.

## Docker Compose

```bash
HOST_PORT=9010 docker compose up -d
```

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8765` | Listen port **inside** the container |
| `HOST` | `0.0.0.0` | Bind address |
| `PUBLIC_URL` | empty | Public https origin, if any |
| `RECONNECT_MS` | `20000` | Time to reclaim a seat after disconnect |
