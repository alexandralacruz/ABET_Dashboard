#!/usr/bin/env bash
# ABET Dashboard – Start both backend and frontend servers
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

cleanup() {
  echo ""
  echo "Shutting down..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  exit 0
}
trap cleanup EXIT INT TERM

# ── Backend ───────────────────────────────────────────────────
echo "🔧 Starting Python backend..."
cd "$BACKEND_DIR"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

uvicorn main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Wait for backend to be ready
echo -n "   Waiting for backend..."
for i in $(seq 1 15); do
  if curl -s http://localhost:8000/api/health > /dev/null 2>&1; then
    echo " ready!"
    break
  fi
  sleep 1
  echo -n "."
done
echo ""

# ── Frontend ──────────────────────────────────────────────────
echo "🔧 Starting React frontend..."
cd "$FRONTEND_DIR"

if [ ! -d "node_modules" ]; then
  npm install
fi

npx vite --host &
FRONTEND_PID=$!
sleep 2

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Backend:  http://localhost:8000/docs"
echo "  Frontend: http://localhost:5173"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Press Ctrl+C to stop both servers"
echo ""

wait
