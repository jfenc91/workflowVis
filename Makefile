# Pipeline Visualizer — Development Commands
# Usage: make <target>

SHELL := /bin/bash
PID_DIR := .pids

.PHONY: start stop restart status test test-browser open build dev check clean help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

start: ## Start app server (8000) and data API server (8001)
	@mkdir -p $(PID_DIR)
	@if [ -f $(PID_DIR)/http.pid ] && kill -0 $$(cat $(PID_DIR)/http.pid) 2>/dev/null; then \
		echo "Servers already running. Use 'make restart' or 'make stop' first."; \
		exit 1; \
	fi
	@echo "Compiling TypeScript..."
	@node build.js dev
	@echo "Starting data API server on http://localhost:8001..."
	@python3 api/data_server.py > /dev/null 2>&1 & echo $$! > $(PID_DIR)/data.pid
	@echo "Starting app server on http://localhost:8000..."
	@python3 -m http.server 8000 > /dev/null 2>&1 & echo $$! > $(PID_DIR)/http.pid
	@sleep 1
	@echo ""
	@echo "  App:      http://localhost:8000"
	@echo "  Data API: http://localhost:8001"
	@echo "  Tests:    http://localhost:8000/tests/"
	@echo ""
	@echo "Run 'make stop' to shut down."

stop: ## Stop all running servers
	@if [ -f $(PID_DIR)/data.pid ]; then \
		kill $$(cat $(PID_DIR)/data.pid) 2>/dev/null && echo "Data API server stopped." || true; \
		rm -f $(PID_DIR)/data.pid; \
	fi
	@if [ -f $(PID_DIR)/http.pid ]; then \
		kill $$(cat $(PID_DIR)/http.pid) 2>/dev/null && echo "App server stopped." || true; \
		rm -f $(PID_DIR)/http.pid; \
	fi
	@# Also kill any stragglers on the ports
	@lsof -ti:8000 | xargs kill 2>/dev/null || true
	@lsof -ti:8001 | xargs kill 2>/dev/null || true
	@echo "All servers stopped."

restart: stop start ## Restart all servers

status: ## Show server status
	@echo "Port 8000 (app):      $$(lsof -ti:8000 > /dev/null 2>&1 && echo '\033[32mrunning\033[0m' || echo '\033[31mstopped\033[0m')"
	@echo "Port 8001 (data API): $$(lsof -ti:8001 > /dev/null 2>&1 && echo '\033[32mrunning\033[0m' || echo '\033[31mstopped\033[0m')"

build: ## Bundle library into dist/
	@node build.js

dev: ## Watch TypeScript and recompile on change
	@node build.js watch

check: ## Type-check TypeScript (no emit)
	@npx tsc --noEmit

test: ## Run tests headlessly via Playwright (compiles TS first)
	@node build.js dev
	@node tests/run_tests.js

test-browser: ## Open test page in browser (starts servers if needed)
	@if ! lsof -ti:8000 > /dev/null 2>&1; then \
		$(MAKE) start; \
	fi
	@echo "Opening tests in browser..."
	@open http://localhost:8000/tests/

open: ## Open the app in browser (starts servers if needed)
	@if ! lsof -ti:8000 > /dev/null 2>&1; then \
		$(MAKE) start; \
	fi
	@echo "Opening app in browser..."
	@open http://localhost:8000

clean: stop ## Stop servers and remove pid files
	@rm -rf $(PID_DIR)
	@echo "Cleaned up."
