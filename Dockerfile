# The online game: builds the web client, then runs the game server, which also
# serves the client. The engine ships prebuilt as web/src/wasm/poker.js
# (rebuild it with scripts/build-wasm.sh after changing the C++).
FROM node:22-alpine AS web
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY server/src server/src
COPY web/src/wasm web/src/wasm
COPY web/src/net/protocol.ts web/src/net/protocol.ts
COPY --from=web /app/web/dist web/dist
RUN mkdir -p /data && chown node:node /data
ENV PORT=8787 STATIC_DIR=/app/web/dist DB_FILE=/data/poker.db MATCH_WAIT_SEC=20 NODE_NO_WARNINGS=1
VOLUME /data
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:8787/healthz || exit 1
CMD ["node", "server/src/main.ts"]
