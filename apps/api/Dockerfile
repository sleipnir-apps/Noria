# --- Stage 1: install dependencies ---
# A distinct stage is used for dependencies so that the production stage
# stays small (bun's install cache and node_modules are not shipped).
FROM oven/bun:1 AS deps
WORKDIR /workspace

# Copy workspace manifests first to leverage Docker layer caching
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json

# Install all workspace dependencies (dev deps are needed to build nothing here:
# the API runs directly from TypeScript with bun, so dev deps are pruned at runtime stage)
RUN bun install --frozen-lockfile

# --- Stage 2: runtime ---
FROM oven/bun:1-slim AS runtime
WORKDIR /workspace

# Copy installed node_modules and the application source
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /workspace/packages/contracts/node_modules ./packages/contracts/node_modules
COPY package.json bun.lock ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api

ENV NODE_ENV=production
EXPOSE 3000

# Bun runs TypeScript natively, no build step needed
CMD ["bun", "run", "apps/api/src/server.ts"]