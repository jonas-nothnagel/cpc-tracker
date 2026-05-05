# syntax=docker/dockerfile:1.7
#
# CPC Tracker — single image serving Next.js + spawning the Python pipeline.
# Targets Azure App Service for Containers (Linux).
#
# Two stages:
#   1. web-builder: pnpm install + next build (Node 20)
#   2. runtime:     python:3.12-slim with Node 20 layered on, plus uv

# ---------- Stage 1: build the Next.js app ----------
FROM node:20-bookworm AS web-builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- Stage 2: runtime ----------
FROM python:3.12-slim-bookworm AS runtime

ENV PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_ENV=production \
    PNPM_HOME=/usr/local/share/pnpm \
    UV_PROJECT_ENVIRONMENT=/app/python/.venv \
    PATH=/usr/local/share/pnpm:/root/.local/bin:/app/python/.venv/bin:$PATH

# System deps + Node 20 + uv
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        curl ca-certificates gnupg tini \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && curl -fsSL https://astral.sh/uv/install.sh | sh \
    && corepack enable \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first so the layer caches when only JS changes.
COPY python/pyproject.toml python/uv.lock ./python/
RUN cd python && uv sync --frozen --no-dev

# Copy built Next.js output and runtime sources from the web-builder stage.
COPY --from=web-builder /app/.next ./.next
COPY --from=web-builder /app/public ./public
COPY --from=web-builder /app/node_modules ./node_modules
COPY --from=web-builder /app/package.json /app/pnpm-lock.yaml /app/next.config.ts ./

# Python sources (data dir included — static reference data).
COPY python ./python

# Entrypoint that wires /app/python/analyses → /home/cpc/analyses so per-analysis
# state lives on the App Service /home persistent mount. ANALYSES_DIR is
# hardcoded in the API routes so we bridge it via symlink at startup.
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/start.sh"]
