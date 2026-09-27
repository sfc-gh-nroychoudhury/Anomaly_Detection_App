# Multi-stage build for the Next.js dashboard, packaged for Snowpark Container
# Services. Built and pushed by the provider only -- consumers never build this.
#
# The image repository lives directly on the APPLICATION PACKAGE (a
# provider-side, pre-install object) -- see sql/05_service.sql's header
# comment for why. One-time repo creation (as ACCOUNTADMIN, provider side):
#   CREATE SCHEMA IF NOT EXISTS <pkg>.services;
#   CREATE IMAGE REPOSITORY IF NOT EXISTS <pkg>.services.app_image_repo;
#   SHOW IMAGE REPOSITORIES IN SCHEMA <pkg>.services;  -- get repository_url
#
# Build (from repo root; MUST use --push, not --load/docker build -- see
# the native-app-provider skill's ref-spcs-image-registry.md for why):
#   snow spcs image-registry login --connection <conn>
#   docker buildx create --name multiplatform-builder --driver docker-container --use
#   docker buildx build --platform linux/amd64 --push \
#     -t <repository_url>/ml_anomaly_ui:latest \
#     -f containers/Dockerfile frontend/

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Standalone runtime image: minimal footprint, no build tooling.
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
