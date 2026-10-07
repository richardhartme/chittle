FROM node:24-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The db client is created on import, so the build needs a DATABASE_URL to exist.
# It is never connected to during the build.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV STORAGE_DIR=/data/recordings

# Dev dependencies stay in the image so `npm run db:setup` can run against it.
COPY --from=build /app ./

RUN mkdir -p "$STORAGE_DIR" && chown -R node:node "$STORAGE_DIR" /app/.next
USER node

EXPOSE 3000
CMD ["npm", "start"]
