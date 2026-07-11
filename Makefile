SHELL := /bin/bash
ROOT_DIR := $(shell pwd)
export PATH := $(ROOT_DIR)/.tools/node/bin:$(PATH)

.PHONY: help dev seed test build install e2e

help:
	@echo "CoachApp make targets:"
	@echo "  make install  - install backend + frontend dependencies"
	@echo "  make dev      - run backend (3001) and frontend (5173) together"
	@echo "  make seed     - wipe the DB and load demo coach/students/sessions"
	@echo "  make test     - run backend endpoint tests + rep-engine unit tests"
	@echo "  make build    - production build of the frontend, sanity-check backend"
	@echo "  make e2e      - re-seed, then run the curl end-to-end workout script"

install:
	cd backend && npm install
	cd frontend && npm install

dev:
	@echo "Starting backend and frontend..."
	@( \
		trap 'kill 0' EXIT INT TERM; \
		(cd backend && npm run dev) & \
		(cd frontend && npm run dev) & \
		wait \
	)

seed:
	cd backend && npm run seed

test:
	cd backend && npm test
	@if [ -f frontend/package.json ]; then cd frontend && npm test; else echo "(frontend not scaffolded yet, skipping frontend tests)"; fi

build:
	@if [ -f frontend/package.json ]; then cd frontend && npm run build; else echo "(frontend not scaffolded yet, skipping frontend build)"; fi
	cd backend && node -c server.js

e2e: seed
	@cd backend && (BACKEND_PORT=3001 node server.js > /tmp/coachapp-e2e-backend.log 2>&1 & echo $$! > /tmp/coachapp-e2e-backend.pid)
	@sleep 1
	@BASE_URL=http://localhost:3001 bash backend/e2e.sh; \
	STATUS=$$?; \
	kill $$(cat /tmp/coachapp-e2e-backend.pid) 2>/dev/null; \
	rm -f /tmp/coachapp-e2e-backend.pid; \
	exit $$STATUS
