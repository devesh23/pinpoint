# Makefile for Pinpoint demo

.PHONY: dev start build stop logs

# Start the development stack using the quickstart helper
dev:
	@chmod +x ./quickstart.sh || true
	@./quickstart.sh

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
