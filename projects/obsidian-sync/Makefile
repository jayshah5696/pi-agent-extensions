.PHONY: up down logs ps

up:             ## Start CouchDB stack
	docker compose up -d

down:           ## Stop CouchDB stack
	docker compose down

logs:           ## Tail CouchDB logs
	docker compose logs -f couchdb

ps:             ## Show container status
	docker compose ps
