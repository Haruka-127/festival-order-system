FROM oven/bun:1.3.14-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY tsconfig.json ./
RUN bun run build

FROM oven/bun:1.3.14-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/app/data

COPY --from=build --chown=bun:bun /app/dist ./dist
RUN mkdir -p /app/data \
    && chown -R bun:bun /app/data

USER bun

EXPOSE 3000
VOLUME ["/app/data"]

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "const r=await fetch('http://127.0.0.1:3000/health/ready');if(!r.ok)process.exit(1)"]

CMD ["bun", "dist/index.js"]
