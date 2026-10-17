# Build context: repo root.  Targets: api, worker, nginx.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY tsconfig.base.json ./
COPY shared shared
COPY server server
COPY web web
ARG VITE_MEDIA_BASE_URL
ENV VITE_MEDIA_BASE_URL=${VITE_MEDIA_BASE_URL}
RUN npm run build -w server && npm run build -w web

FROM node:22-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server && npm cache clean --force
COPY --from=build /app/server/dist server/dist
RUN mkdir -p /data/media /data/uploads && chown -R node:node /data
USER node

FROM runtime AS api
EXPOSE 3000
CMD ["node", "server/dist/index.js"]

FROM runtime AS worker
CMD ["node", "server/dist/worker.js"]

FROM nginx:1.27-alpine AS nginx
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
