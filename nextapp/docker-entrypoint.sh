#!/bin/sh
set -e
# The server runs as the unprivileged node user. Started as root (the
# default), this first hands the data directory to that user, since volumes
# from before Jellylens dropped root are owned by root, then switches to it.
# Started as another user (compose `user:`), it just runs.
if [ "$(id -u)" = "0" ]; then
  data="${DATA_DIR:-/app/data}"
  mkdir -p "$data"
  chown -R node:node "$data"
  exec su-exec node "$@"
fi
exec "$@"
