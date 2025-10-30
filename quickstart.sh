#!/usr/bin/env bash
# Quickstart helper for the Pinpoint demo project
# Usage:
#   ./quickstart.sh [--no-build] [--detach]
# It will:
#  - ensure Docker and Docker Compose are available
#  - build and start the docker-compose stack
#  - wait for the backend to respond and print helpful URLs

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

NO_BUILD=0
DETACH=1
for arg in "$@"; do
  case "$arg" in
    --no-build) NO_BUILD=1 ;;
    --foreground) DETACH=0 ;;
    --help|-h) echo "Usage: ./quickstart.sh [--no-build] [--foreground]"; exit 0 ;;
    *) echo "Unknown arg: $arg"; echo "Usage: ./quickstart.sh [--no-build] [--foreground]"; exit 1 ;;
  esac
done

echo "Pinpoint quickstart — starting..."

# Command-line flags
AUTO_YES=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) AUTO_YES=1 ;;
  esac
done

# Check docker
if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: docker not found. Please install Docker Desktop (macOS/Windows) or Docker Engine (Linux)." >&2
  exit 1
fi

# Choose docker compose invocation (modern plugin preferred)
COMPOSE_CMD=""
if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "ERROR: docker compose not found. Install Docker Compose or use Docker Desktop." >&2
  exit 1
fi

echo "Using compose command: $COMPOSE_CMD"

# --- Development tool checks (rust, cargo, node, npm) ---
function confirm_or_abort(){
  if [ "$AUTO_YES" -eq 1 ]; then return 0; fi
  read -p "$1 [y/N]: " ans
  case "$ans" in
    [Yy]* ) return 0 ;;
    * ) echo "Aborting."; exit 1 ;;
  esac
}

echo "Checking developer toolchain (rust, cargo, node, npm)..."

if ! command -v rustc >/dev/null 2>&1 || ! command -v cargo >/dev/null 2>&1; then
  echo "Rust/Cargo not found. Will try to install rustup (local user install)."
  if command -v curl >/dev/null 2>&1; then
    confirm_or_abort "Install rustup (local, will add to \$HOME/.cargo)?"
    echo "Installing rustup (this will modify your ~/.cargo and ~/.rustup directories)..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    # shellcheck source=/dev/null
    source "$HOME/.cargo/env" || true
  else
    echo "curl not available; cannot perform local rustup install. Will try global apt install if sudo is available."
    if command -v sudo >/dev/null 2>&1; then
      confirm_or_abort "Install Rust/Cargo globally with apt (requires sudo)?"
      sudo apt-get update && sudo apt-get install -y curl build-essential
      curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
      source "$HOME/.cargo/env" || true
    else
      echo "No method available to install rust. Please install rustup or cargo manually and re-run this script." >&2
      exit 1
    fi
  fi
else
  echo "Rust found: $(rustc --version)"
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node/npm not found. Will try to install nvm (local user install) and Node LTS."
  if command -v curl >/dev/null 2>&1; then
    confirm_or_abort "Install nvm + Node LTS (local install into \$HOME/.nvm)?"
    export NVM_DIR="$HOME/.nvm"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.6/install.sh | bash
    # Load nvm
    [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
    nvm install --lts || true
    nvm use --lts || true
  else
    echo "curl not available; cannot perform nvm install. Will try global apt install if sudo is available."
    if command -v sudo >/dev/null 2>&1; then
      confirm_or_abort "Install Node/npm globally with apt (requires sudo)?"
      sudo apt-get update && sudo apt-get install -y nodejs npm
    else
      echo "No method available to install node/npm. Please install Node.js and npm and re-run this script." >&2
      exit 1
    fi
  fi
else
  echo "Node found: $(node --version), npm: $(npm --version)"
fi

# End toolchain checks

# Bring up services
if [ "$NO_BUILD" -eq 1 ]; then
  echo "Starting services (no build)..."
  $COMPOSE_CMD up ${DETACH:+-d}
else
  echo "Building and starting services (this may take a few minutes)..."
  $COMPOSE_CMD up --build ${DETACH:+-d}
fi

# If running detached, show status and tail logs briefly
if [ "$DETACH" -eq 1 ]; then
  echo
  echo "Containers status:"
  $COMPOSE_CMD ps
  echo
  echo "Tailing last 60 lines of backend logs (press Ctrl-C to stop):"
  $COMPOSE_CMD logs --tail=60 backend || true
fi

# Wait for backend health (mock endpoint) up to timeout
echo
echo "Waiting for backend to respond at http://localhost:8080/mock/once (timeout: 60s)"
TRY=0
MAX_TRIES=30
until curl -sS http://localhost:8080/mock/once >/dev/null 2>&1; do
  TRY=$((TRY+1))
  if [ "$TRY" -ge "$MAX_TRIES" ]; then
    echo "Timed out waiting for backend. Check 'docker compose logs backend' for details." >&2
    exit 1
  fi
  sleep 2
done

cat <<EOF

Pinpoint should be up and running!
- Frontend: http://localhost:3000
- Backend mock SSE: http://localhost:8080/mock/stream (SSE)
- Backend single-shot: http://localhost:8080/mock/once

To view logs:
  $COMPOSE_CMD logs --follow
To stop the stack:
  $COMPOSE_CMD down

Happy demo-ing!
EOF
