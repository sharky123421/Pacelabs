#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

# Free ports 8081 and 8082 so Expo never has to ask
if command -v lsof >/dev/null 2>&1; then
  for port in 8081 8082; do
    pids=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
      echo "Stopping process(es) on port $port..."
      echo "$pids" | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
  done
fi

export CI=false
export REACT_NATIVE_PACKAGER_HOSTNAME=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
export EXPO_NO_TELEMETRY=1
# EXPO_OFFLINE=1 removed – can cause Metro to hang on startup

# Clean stale Metro temp caches that can cause startup hangs.
tmp_root="${TMPDIR:-/tmp}"
rm -rf "${tmp_root}"/metro-* "${tmp_root}"/haste-map-* 2>/dev/null || true

# If Watchman is enabled, reset this project's watch to avoid stale state.
if [ "${EXPO_NO_WATCHMAN:-0}" != "1" ] && command -v watchman >/dev/null 2>&1; then
  watchman watch-del "$(pwd)" >/dev/null 2>&1 || true
  watchman watch-project "$(pwd)" >/dev/null 2>&1 || true
fi

echo "Expo Go (LAN) – host: ${REACT_NATIVE_PACKAGER_HOSTNAME:-localhost}, port: 8081"
echo "Starting Metro..."
# Use --clear only when needed (npm run start:go:lan -- --clear). Default start is faster and avoids Metro hang.
exec npx expo start --go --port 8081 "$@"
