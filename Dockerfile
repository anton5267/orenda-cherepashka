FROM node:22-bookworm-slim AS base

WORKDIR /app
ENV PYTHON=/usr/bin/python3

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build

COPY . .
RUN npm run build

FROM base AS prod-deps

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4174

COPY package.json package-lock.json ./
COPY --from=prod-deps /app/node_modules ./node_modules

COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist

EXPOSE 4174

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '4174') + '/api/health').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1))"

CMD ["node", "server-dist/server/index.js"]
