#!/usr/bin/env bash
# Start both the static file server (port 8000) and the data API server (port 8001)

cd "$(dirname "$0")"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $DATA_PID $HTTP_PID 2>/dev/null
  exit 0
}

trap cleanup INT TERM

echo "Starting data API server on http://localhost:8001..."
python3 api/data_server.py &
DATA_PID=$!

echo "Starting app on http://localhost:8000..."
python3 -m http.server 8000 &
HTTP_PID=$!

echo ""
echo "Open http://localhost:8000 in your browser"
echo "Press Ctrl+C to stop both servers"
echo ""

wait
