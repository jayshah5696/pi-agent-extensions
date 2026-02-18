.PHONY: setup test run lint clean

setup:          ## Install dependencies via uv
	uv sync

test:           ## Run tests
	uv run pytest

lint:           ## Lint and format
	uvx ruff check . --fix
	uvx ruff format .

clean:          ## Remove build artifacts
	rm -rf dist/ build/ *.egg-info .pytest_cache .venv
