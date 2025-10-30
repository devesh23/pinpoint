Quickstart — Pinpoint demo
==========================

Goal: Make it trivial for a client to get the demo running after cloning.

Prerequisites
-------------
- Docker Desktop (macOS/Windows) or Docker Engine + Docker Compose (Linux).
- At least 2 GB free disk space and network access to pull base images.

Quick steps
-----------
1. Clone the repository:

   git clone <repo-url>
   cd pinpoint

2. Make the quickstart helper executable and run it:

   chmod +x ./quickstart.sh
   ./quickstart.sh

   By default the script will build and start the stack in the background (detached).
   You can run it in the foreground with:

   ./quickstart.sh --foreground

   Or skip the build step (if you already built images):

   ./quickstart.sh --no-build

Or use Make (convenience):

  make dev

`make dev` will run the quickstart helper and perform the same steps.

What the script does
---------------------
- Validates Docker and Compose are installed.
- Picks the available compose command (modern `docker compose` or legacy `docker-compose`).
- Builds the images and starts the Compose stack (frontend + backend).
- Waits for the backend mock endpoint to respond and prints helpful URLs.

Useful endpoints
----------------
- Frontend: http://localhost:3000
- Backend (mock SSE): http://localhost:8080/mock/stream
- Backend (single-shot JSON): http://localhost:8080/mock/once

Stopping the demo
-----------------
- To stop and remove containers:

  docker compose down

Notes and troubleshooting
-------------------------
- If the backend fails to start because of missing system libraries (e.g. libssl), the Dockerfile includes installing required runtime libs. Rebuild the image with:

  docker compose build backend

- If ports 3000 or 8080 are already in use, stop the conflicting services or edit `docker-compose.yml` to change published ports.

- If you run into permission issues with `quickstart.sh`, run:

  chmod +x ./quickstart.sh

Questions
---------
If you want I can add a one-command Makefile target (e.g. `make dev`) or a docker-hosted admin panel for deploying to remote machines. Tell me which you'd prefer.
