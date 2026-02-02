FROM node:22-bookworm

# Install Bun (required for build scripts)
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

RUN corepack enable

WORKDIR /app

ARG OPENCLAW_DOCKER_APT_PACKAGES=""
RUN if [ -n "$OPENCLAW_DOCKER_APT_PACKAGES" ]; then \
      apt-get update && \
      DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $OPENCLAW_DOCKER_APT_PACKAGES && \
      apt-get clean && \
      rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/*; \
    fi
# gosu: for Railway entrypoint to drop root after fixing volume permissions
# python3 + pip: for Drive Playground service (same container as OpenClaw)
RUN apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends gosu python3 python3-pip python3-venv && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY patches ./patches
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile

COPY . .
RUN OPENCLAW_A2UI_SKIP_MISSING=1 pnpm build
# Force pnpm for UI build (Bun may fail on ARM/Synology architectures)
ENV OPENCLAW_PREFER_PNPM=1
RUN pnpm ui:build

ENV NODE_ENV=production

# Install Supermemory plugin into a path in the image so it can be used or copied at runtime
RUN mkdir -p /app/.openclaw/extensions && \
    OPENCLAW_STATE_DIR=/app/.openclaw node dist/index.js plugins install @supermemory/openclaw-supermemory && \
    chown -R node:node /app/.openclaw

# Drive Playground Python service (optional: started by entrypoint when GOOGLE_DRIVE_TOKEN_JSON is set)
RUN pip3 install --break-system-packages --no-cache-dir -r scripts/drive_playground/requirements.txt

# Railway: entrypoint runs as root, creates OPENCLAW_STATE_DIR on volume, chowns it, then runs app as node
COPY scripts/railway-entrypoint.sh /app/railway-entrypoint.sh
RUN chmod +x /app/railway-entrypoint.sh
# Do not set USER node here so entrypoint runs as root; it drops to node via gosu

ENTRYPOINT ["/app/railway-entrypoint.sh"]
CMD ["node", "dist/index.js", "gateway"]
