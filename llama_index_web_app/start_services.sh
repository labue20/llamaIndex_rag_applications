#!/bin/bash

# Start the LlamaIndex RAG backend (code and data live in server/):
#   1. index_server.py - holds the vector index (port 5602)
#   2. flask_demo.py   - HTTP API used by the React app (port 5601)
# flask_demo.py connects to the index server on startup, so it must start second.

cd "$(dirname "$0")/server" || exit 1

INDEX_PORT=5602
API_PORT=5601

# Prefer the project virtualenv if it exists
if [ -x .venv/bin/python ]; then
    PYTHON=.venv/bin/python
else
    PYTHON=python3
fi

# Load OPENAI_API_KEY (and anything else) from server/.env if present
if [ -f .env ]; then
    set -a
    . ./.env
    set +a
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo "Warning: OPENAI_API_KEY is not set (add it to llama_index_web_app/server/.env)."
    echo "         Upload and conversion will work, but AI query/chat will fail."
fi

port_in_use() {
    lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

for port in $INDEX_PORT $API_PORT; do
    if port_in_use "$port"; then
        echo "Error: port $port is already in use. Stop the process using it and try again."
        exit 1
    fi
done

INDEX_PID=""
API_PID=""

cleanup() {
    echo ""
    echo "Stopping services..."
    [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
    [ -n "$INDEX_PID" ] && kill "$INDEX_PID" 2>/dev/null
    wait 2>/dev/null
    exit
}
trap cleanup SIGINT SIGTERM

# Wait until a port is listening, or fail if the process exits or we time out
wait_for_port() {
    local port=$1 pid=$2 name=$3 timeout=${4:-60}
    for _ in $(seq 1 "$timeout"); do
        if port_in_use "$port"; then
            return 0
        fi
        if ! kill -0 "$pid" 2>/dev/null; then
            echo "Error: $name exited during startup."
            cleanup
        fi
        sleep 1
    done
    echo "Error: $name did not start listening on port $port within ${timeout}s."
    cleanup
}

echo "Starting index server on port $INDEX_PORT..."
"$PYTHON" index_server.py &
INDEX_PID=$!
wait_for_port $INDEX_PORT $INDEX_PID "index server"

echo "Starting API server on port $API_PORT..."
"$PYTHON" flask_demo.py &
API_PID=$!
wait_for_port $API_PORT $API_PID "API server"

echo ""
echo "Backend running: http://localhost:$API_PORT"
echo "Start the frontend in another terminal:  cd rag-web-app && npm start"
echo "Press Ctrl+C to stop."

# Exit (and clean up) if either service dies
while kill -0 "$INDEX_PID" 2>/dev/null && kill -0 "$API_PID" 2>/dev/null; do
    sleep 2
done
echo "A service stopped unexpectedly."
cleanup
