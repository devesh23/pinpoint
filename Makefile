# Makefile for Pinpoint demo

.PHONY: dev start build stop logs

# Default ports (can be overridden from the command line)
BACKEND_PORT ?= 8080
FRONTEND_PORT ?= 3000

# Start the development stack using the quickstart helper
# You can pass BACKEND_PORT and FRONTEND_PORT when invoking make, e.g.:
#   make dev BACKEND_PORT=8081 FRONTEND_PORT=5174
dev:
	@chmod +x ./quickstart.sh || true
	@echo "Starting dev (BACKEND_PORT=$(BACKEND_PORT) FRONTEND_PORT=$(FRONTEND_PORT))"
	@BACKEND_PORT=$(BACKEND_PORT) FRONTEND_PORT=$(FRONTEND_PORT) ./quickstart.sh

# Build images only
build:
	docker compose build

# Start services (detached)
start:
	docker compose up -d

# Stop and remove
stop:
	docker compose down

# Tail logs
logs:
	docker compose logs --follow
