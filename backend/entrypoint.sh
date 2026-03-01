#!/bin/sh
set -eu

MAX_ATTEMPTS="${DB_WAIT_MAX_ATTEMPTS:-30}"
SLEEP_SECONDS="${DB_WAIT_SLEEP_SECONDS:-2}"

attempt=1
echo "[entrypoint] waiting for database and applying migrations..."
until npx prisma migrate deploy; do
  if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
    echo "[entrypoint] database unavailable after ${MAX_ATTEMPTS} attempts, exiting."
    exit 1
  fi
  echo "[entrypoint] database not ready (attempt ${attempt}/${MAX_ATTEMPTS}), retry in ${SLEEP_SECONDS}s..."
  attempt=$((attempt + 1))
  sleep "$SLEEP_SECONDS"
done

echo "[entrypoint] migrations applied, starting backend..."
exec node dist/index.js
