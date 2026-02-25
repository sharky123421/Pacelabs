#!/usr/bin/env bash
# Stoppar Expo/Metro som kör på port 8081 eller 8082
for port in 8081 8082; do
  pids=$(lsof -ti:$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "Stoppar process(er) på port $port: $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
  fi
done
# Stoppar även node-processer som kör expo start
pids=$(ps aux | grep -E "expo start|metro" | grep -v grep | awk '{print $2}')
if [ -n "$pids" ]; then
  echo "Stoppar Expo/Metro-processer: $pids"
  echo "$pids" | xargs kill -9 2>/dev/null || true
fi
echo "Klart."
