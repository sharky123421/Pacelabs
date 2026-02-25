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
echo "Expo Go (LAN) – host: ${REACT_NATIVE_PACKAGER_HOSTNAME:-localhost}, port: 8081"
echo "Clearing Metro cache and starting..."
exec npx expo start --go --port 8081 --clear
