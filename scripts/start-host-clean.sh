#!/usr/bin/env bash
# Purpose: start Icaros Host from a clean local port state.
#
# The script frees the Host HTTPS/UI port and the plain M5 device WebSocket
# port, builds the SvelteKit app, and starts the production Host entrypoint.
# It is intentionally local-development oriented and only targets the configured
# Host ports, not arbitrary node/bun/vite processes.

set -euo pipefail

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5183}"
ICAROS_DEVICE_WS_PORT="${ICAROS_DEVICE_WS_PORT:-5184}"
PORTS_TO_FREE=("$PORT")

if [[ "$ICAROS_DEVICE_WS_PORT" != "none" && "$ICAROS_DEVICE_WS_PORT" != "$PORT" ]]; then
	PORTS_TO_FREE+=("$ICAROS_DEVICE_WS_PORT")
fi

echo "Icaros Host clean start"
echo "Host: $HOST"
echo "UI/HTTPS port: $PORT"
echo "M5 plain WS port: $ICAROS_DEVICE_WS_PORT"

kill_port_listeners() {
	local port="$1"
	local pids
	pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"

	if [[ -z "$pids" ]]; then
		echo "Port $port is free."
		return
	fi

	echo "Stopping listener(s) on port $port: $pids"
	kill $pids 2>/dev/null || true
	sleep 1

	pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
	if [[ -z "$pids" ]]; then
		echo "Port $port is free."
		return
	fi

	echo "Force-stopping listener(s) on port $port: $pids"
	kill -9 $pids 2>/dev/null || true
}

wait_for_free_port() {
	local port="$1"
	local attempt

	for attempt in {1..20}; do
		if ! lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
			return
		fi
		sleep 0.2
	done

	echo "Port $port is still in use after cleanup." >&2
	lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2 || true
	exit 1
}

for port in "${PORTS_TO_FREE[@]}"; do
	kill_port_listeners "$port"
	wait_for_free_port "$port"
done

echo "Building Host..."
bun run build

echo "Starting Host..."
exec env HOST="$HOST" PORT="$PORT" ICAROS_DEVICE_WS_PORT="$ICAROS_DEVICE_WS_PORT" bun server/index.ts
