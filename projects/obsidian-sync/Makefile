.PHONY: up down logs ps test

up:             ## Start CouchDB stack
	docker compose up -d

down:           ## Stop CouchDB stack
	docker compose down

logs:           ## Tail CouchDB logs
	docker compose logs -f couchdb

ps:             ## Show container status
	docker compose ps

test:           ## Verify setup and attempt localhost probe
	./scripts/verify_setup.sh
	@echo "[INFO] Attempting curl -I http://localhost:5984 (mock _up check)..."
	@curl -I --max-time 5 http://localhost:5984 || echo "[WARN] localhost:5984 not reachable (run 'make up' to validate runtime)."
