# Production Dockerfile for Polymarket BTC 5M Terminal
# Optimized for Oracle Cloud Ubuntu (ARM64 or x86_64)

FROM node:22-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create volume mount point for persistent SQLite database
RUN mkdir -p /app/data && chown -R node:node /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json

USER node
EXPOSE 3000

VOLUME ["/app/data"]

CMD ["npm", "start"]
