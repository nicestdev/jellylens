#!/bin/sh
set -e
# The server runs as the unprivileged node user. Started as root (the
# default), this first hands the data directory to that user, since volumes
# from before Jellylens dropped root are owned by root (and the downloads
# directory, which a new volume creates root-owned), then switches to it.
# Started as another user (compose `user:`), it just runs.
if [ "$(id -u)" = "0" ]; then
  data="${DATA_DIR:-/app/data}"
  mkdir -p "$data"
  chown -R node:node "$data"
  # Downloads only at the top: a bind-mounted folder's files keep their owner.
  if [ -n "$DOWNLOAD_DIR" ]; then
    mkdir -p "$DOWNLOAD_DIR"
    chown node:node "$DOWNLOAD_DIR"
  fi
  exec su-exec node "$@"
fi
exec "$@"
