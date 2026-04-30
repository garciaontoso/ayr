# syntax=docker/dockerfile:1.7

# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder

WORKDIR /app

# Install full deps (including dev) so we can run tests / lint if needed
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy source (test dir is optional — skipped if not present)
COPY src ./src

# ---------- Stage 2: production ----------
FROM node:20-alpine AS prod

# curl is needed for the HEALTHCHECK
RUN apk add --no-cache curl tini

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

# Copy package files and install ONLY production deps
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy source from builder (keeps stage decoupled)
COPY --from=builder /app/src ./src

# Drop privileges to the built-in `node` user
RUN chown -R node:node /app
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/health || exit 1

# tini handles PID 1 / zombie reaping
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
