.PHONY: help install install-dev test test-cov format lint type-check clean build

help:
	@echo "EKET Python SDK - Development Commands"
	@echo ""
	@echo "  install        Install package in production mode"
	@echo "  install-dev    Install package in development mode with dev dependencies"
	@echo "  test           Run tests"
	@echo "  test-cov       Run tests with coverage report"
	@echo "  format         Format code with black"
	@echo "  lint           Lint code with flake8"
	@echo "  type-check     Type check with mypy"
	@echo "  clean          Clean build artifacts"
	@echo "  build          Build distribution packages"
	@echo ""

install:
	pip install -e .

install-dev:
	pip install -e ".[dev]"

test:
	pytest -v

test-cov:
	pytest --cov=eket_sdk --cov-report=term-missing --cov-report=html

format:
	black eket_sdk/ tests/ examples/

lint:
	flake8 eket_sdk/ tests/ examples/ --max-line-length=100

type-check:
	mypy eket_sdk/

clean:
	rm -rf build/ dist/ *.egg-info .pytest_cache .mypy_cache htmlcov/
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type f -name "*.pyc" -delete

build: clean
	python setup.py sdist bdist_wheel

# Run example
example-register:
	python examples/register_agent.py

example-claim:
	python examples/claim_task.py

example-pr:
	python examples/submit_pr.py

example-heartbeat:
	python examples/auto_heartbeat.py
