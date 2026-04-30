FROM node:20-alpine

WORKDIR /app

# Install deps first for layer caching
COPY package.json ./
RUN npm install --omit=dev

# Source
COPY src ./src

# /data volume for persisted tokens
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]

USER node

ENV NODE_ENV=production \
    PORT=8091 \
    HOST=0.0.0.0 \
    DATA_DIR=/data

EXPOSE 8091

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD wget -q --spider http://localhost:8091/health || exit 1

CMD ["node", "src/index.js"]
