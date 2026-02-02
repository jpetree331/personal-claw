#!/bin/sh
# Run as root: ensure OPENCLAW_STATE_DIR on the volume exists and is owned by node,
# copy baked-in Supermemory plugin into it, optionally start Drive Playground service,
# then run the main process as node.
set -e
if [ -n "$OPENCLAW_STATE_DIR" ]; then
  mkdir -p "$OPENCLAW_STATE_DIR/extensions"
  if [ -d /app/.openclaw/extensions/openclaw-supermemory ]; then
    cp -r /app/.openclaw/extensions/openclaw-supermemory "$OPENCLAW_STATE_DIR/extensions/"
  fi
  parent=$(dirname "$OPENCLAW_STATE_DIR")
  chown -R node:node "$parent"
fi

# Optional: start Drive Playground Python service in same container (when secrets are set as variables)
if [ -n "$GOOGLE_DRIVE_TOKEN_JSON" ] && [ -n "$DRIVE_PLAYGROUND_API_KEY" ]; then
  DRIVE_PLAYGROUND_PORT="${DRIVE_PLAYGROUND_PORT:-8765}"
  ( cd /app/scripts/drive_playground && gosu node python3 -m uvicorn drive_playground_service:app --host 127.0.0.1 --port "$DRIVE_PLAYGROUND_PORT" ) &
  sleep 2
fi

exec gosu node "$@"
