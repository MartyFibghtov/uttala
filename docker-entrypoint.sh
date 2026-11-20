#!/bin/sh
# Railway mounts volumes owned by root. Fix ownership of the data directory, then drop to the unprivileged user.
set -e
DATA="${DATA_DIR:-${RAILWAY_VOLUME_MOUNT_PATH:-/data}}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA"
  chown -R nextjs:nodejs "$DATA" 2>/dev/null || true
  exec setpriv --reuid=nextjs --regid=nodejs --init-groups "$@"
fi
exec "$@"
