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

audit:
	@echo "🔍 Auditing Repository Structure..."
	@if ls *.py 1> /dev/null 2>&1; then \
		echo "❌ Root pollution detected: Python files found in root."; \
		exit 1; \
	fi
	@echo "✅ Structure clean."
