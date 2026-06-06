#!/usr/bin/env bash
# Purpose: start Icaros Host from a clean local port state.
#
# The script frees the Host HTTPS/UI port and the plain M5 device WebSocket
# port, builds the SvelteKit app, and starts the production Host entrypoint.
# It is intentionally local-development oriented and only targets the configured
# Host ports, not arbitrary node/bun/vite processes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-5183}"
ICAROS_DEVICE_WS_PORT="${ICAROS_DEVICE_WS_PORT:-5184}"
ICAROS_DEVICE_WS_ORIGIN="${ICAROS_DEVICE_WS_ORIGIN:-}"
ICAROS_TLS_KEY_FILE="${ICAROS_TLS_KEY_FILE:-.certs/icaros-host-key.pem}"
ICAROS_TLS_CERT_FILE="${ICAROS_TLS_CERT_FILE:-.certs/icaros-host.pem}"
ICAROS_EXPERIENCE_ORIGIN="${ICAROS_EXPERIENCE_ORIGIN:-}"
ICAROS_EXPERIENCE_PROTOCOL="${ICAROS_EXPERIENCE_PROTOCOL:-}"
ICAROS_EXPERIENCE_PORT="${ICAROS_EXPERIENCE_PORT:-5174}"
PORTS_TO_FREE=("$PORT")

is_tcp_port() {
	local value="$1"
	[[ "$value" =~ ^[0-9]{1,5}$ && "$value" -ge 1 && "$value" -le 65535 ]]
}

if ! is_tcp_port "$PORT"; then
	echo "PORT must be a TCP port number." >&2
	exit 1
fi

if [[ -z "$ICAROS_DEVICE_WS_ORIGIN" && "$ICAROS_DEVICE_WS_PORT" != "none" ]] && ! is_tcp_port "$ICAROS_DEVICE_WS_PORT"; then
	echo "ICAROS_DEVICE_WS_PORT must be a TCP port number or none." >&2
	exit 1
fi

if [[ -z "$ICAROS_DEVICE_WS_ORIGIN" && "$ICAROS_DEVICE_WS_PORT" == "$PORT" ]]; then
	echo "ICAROS_DEVICE_WS_PORT must differ from PORT, or use ICAROS_DEVICE_WS_PORT=none." >&2
	exit 1
fi

if [[ ! -f "$ICAROS_TLS_KEY_FILE" || ! -f "$ICAROS_TLS_CERT_FILE" ]]; then
	echo "Missing Host TLS certificate files." >&2
	echo "Expected key:  $ICAROS_TLS_KEY_FILE" >&2
	echo "Expected cert: $ICAROS_TLS_CERT_FILE" >&2
	echo "Run the HTTPS setup first; M5 hardware pairing needs the Bun Host on https://... plus ws://...:5184." >&2
	exit 1
fi

if [[ -z "$ICAROS_DEVICE_WS_ORIGIN" && "$ICAROS_DEVICE_WS_PORT" != "none" ]]; then
	PORTS_TO_FREE+=("$ICAROS_DEVICE_WS_PORT")
fi

if [[ -n "$ICAROS_EXPERIENCE_ORIGIN" && "$ICAROS_EXPERIENCE_ORIGIN" != https://* ]]; then
	echo "ICAROS_EXPERIENCE_ORIGIN must use https:// for Quest launch." >&2
	exit 1
fi

if [[ -z "$ICAROS_EXPERIENCE_ORIGIN" ]]; then
	if [[ -z "$ICAROS_EXPERIENCE_PROTOCOL" ]]; then
		ICAROS_EXPERIENCE_PROTOCOL="https"
	fi

	if [[ "$ICAROS_EXPERIENCE_PROTOCOL" != "https" ]]; then
		echo "ICAROS_EXPERIENCE_PROTOCOL must be https for Quest launch." >&2
		exit 1
	fi

	if ! is_tcp_port "$ICAROS_EXPERIENCE_PORT"; then
		echo "ICAROS_EXPERIENCE_PORT must be a TCP port number." >&2
		exit 1
	fi
fi

echo "Icaros Host clean start"
echo "Repo: $REPO_ROOT"
echo "Host: $HOST"
echo "UI/HTTPS port: $PORT"
if [[ -n "$ICAROS_DEVICE_WS_ORIGIN" ]]; then
	echo "M5 device WS origin: $ICAROS_DEVICE_WS_ORIGIN"
else
	echo "M5 plain WS port: $ICAROS_DEVICE_WS_PORT"
fi
echo "TLS key: $ICAROS_TLS_KEY_FILE"
echo "TLS cert: $ICAROS_TLS_CERT_FILE"
if [[ -n "$ICAROS_EXPERIENCE_ORIGIN" ]]; then
	echo "Experience target: $ICAROS_EXPERIENCE_ORIGIN"
else
	echo "Experience target: https://<host>:$ICAROS_EXPERIENCE_PORT/"
fi

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
echo "Host stays attached to this terminal. Press Ctrl-C to stop it."
START_ENV=(
	HOST="$HOST"
	PORT="$PORT"
	ICAROS_DEVICE_WS_PORT="$ICAROS_DEVICE_WS_PORT"
	ICAROS_DEVICE_WS_ORIGIN="$ICAROS_DEVICE_WS_ORIGIN"
	ICAROS_TLS_KEY_FILE="$ICAROS_TLS_KEY_FILE"
	ICAROS_TLS_CERT_FILE="$ICAROS_TLS_CERT_FILE"
)

if [[ -n "$ICAROS_EXPERIENCE_ORIGIN" ]]; then
	START_ENV+=(ICAROS_EXPERIENCE_ORIGIN="$ICAROS_EXPERIENCE_ORIGIN")
else
	START_ENV+=(
		ICAROS_EXPERIENCE_PROTOCOL="$ICAROS_EXPERIENCE_PROTOCOL"
		ICAROS_EXPERIENCE_PORT="$ICAROS_EXPERIENCE_PORT"
	)
fi

exec env "${START_ENV[@]}" bun server/index.ts
