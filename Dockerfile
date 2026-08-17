FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache iptables su-exec

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.html ./
COPY css ./css
COPY js ./js
COPY server ./server
COPY assets ./assets
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh && chown -R node:node /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8765

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/info" >/dev/null || exit 1

ENTRYPOINT ["/app/docker-entrypoint.sh"]
