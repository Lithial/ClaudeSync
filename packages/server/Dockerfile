FROM node:22-slim AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/server/package.json packages/server/
RUN npm install --workspace=@claude-sync/server
COPY tsconfig.base.json ./
COPY packages/protocol/ packages/protocol/
COPY packages/server/ packages/server/
RUN npm run build --workspace=@claude-sync/protocol && npm run build --workspace=@claude-sync/server

FROM node:22-slim
WORKDIR /app
COPY --from=builder /app/packages/protocol/dist packages/protocol/dist
COPY --from=builder /app/packages/protocol/package.json packages/protocol/
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/package.json packages/server/
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/packages/server/node_modules packages/server/node_modules

ENV NODE_ENV=production
EXPOSE 8787
CMD ["node", "packages/server/dist/index.js"]
