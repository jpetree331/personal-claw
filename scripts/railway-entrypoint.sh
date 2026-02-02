#!/bin/sh
# Run as root: ensure OPENCLAW_STATE_DIR on the volume exists and is owned by node,
# copy baked-in Supermemory plugin into it, then run the main process as node.
set -e
if [ -n "$OPENCLAW_STATE_DIR" ]; then
  mkdir -p "$OPENCLAW_STATE_DIR/extensions"
  if [ -d /app/.openclaw/extensions/openclaw-supermemory ]; then
    cp -r /app/.openclaw/extensions/openclaw-supermemory "$OPENCLAW_STATE_DIR/extensions/"
  fi
  parent=$(dirname "$OPENCLAW_STATE_DIR")
  chown -R node:node "$parent"
fi
exec gosu node "$@"
