# syntax=docker/dockerfile:1
# SayClear on Railway: Next.js standalone server + SQLite (libSQL) file on a volume mounted at /data.
FROM node:22-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# Debian (glibc), not Alpine: libsql ships prebuilt glibc binaries (@libsql/linux-x64-gnu).
RUN corepack enable

# 1. The 240 MB phone-recognition model, run on the server. Its own layer, ahead of app code, so it is only downloaded again when
#    scripts/fetch-model.mjs changes.
FROM base AS model
WORKDIR /app
COPY scripts/fetch-model.mjs scripts/fetch-model.mjs
RUN node scripts/fetch-model.mjs /models

# 2. Dependencies, from the lockfile only.
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 3. Build.
FROM base AS build
WORKDIR /app
# NEXT_PUBLIC_* values are inlined at build time. Railway passes service variables as build args when declared here.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_COMPANY_NAME
ARG NEXT_PUBLIC_CONTACT_EMAIL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME \
    NEXT_PUBLIC_CONTACT_EMAIL=$NEXT_PUBLIC_CONTACT_EMAIL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# 4. Runtime: unprivileged server, only what the standalone server needs.
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    SOUND_MODEL_DIR=/app/models
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs nextjs \
 && mkdir /data && chown nextjs:nodejs /data
COPY --from=model --chown=nextjs:nodejs /models ./models
COPY --from=build --chown=nextjs:nodejs /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# Starts as root only to fix the ownership of the mounted volume, then runs the server as "nextjs".
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
