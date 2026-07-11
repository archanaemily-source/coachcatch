SHELL := /bin/bash
ROOT_DIR := $(shell pwd)
export PATH := $(ROOT_DIR)/.tools/node/bin:$(PATH)

.PHONY: help dev seed test build install

help:
	@echo "CoachApp make targets:"
	@echo "  make install  - install backend + frontend dependencies"
	@echo "  make dev      - run backend (3001) and frontend (5173) together"
	@echo "  make seed     - wipe the DB and load demo coach/students/sessions"
	@echo "  make test     - run backend endpoint tests + rep-engine unit tests"
	@echo "  make build    - production build of the frontend, sanity-check backend"

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
