# Production image — built by docker-compose.yml and by the GitHub Actions
# workflow that publishes ghcr.io/<owner>/jellylens. Local development uses
# docker-compose.dev.yml instead (`next dev` with the source bind-mounted).

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 7-Zip for the Downloads page: the official static build, which (unlike
# Alpine's package) extracts RAR.
FROM alpine:3 AS sevenzip
ARG TARGETARCH
RUN apk add --no-cache xz \
  && wget -qO- "https://github.com/ip7z/7zip/releases/download/26.04/7z2604-linux-$([ "$TARGETARCH" = arm64 ] && echo arm64 || echo x64).tar.xz" \
  | xz -dc | tar -x -C /usr/local/bin 7zzs \
  && mv /usr/local/bin/7zzs /usr/local/bin/7zz

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
# ffprobe for the library scan (lib/ffprobe.ts).
RUN apk add --no-cache su-exec ffmpeg
COPY --from=sevenzip /usr/local/bin/7zz /usr/local/bin/7zz
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /app/data && chown node:node /app/data
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
