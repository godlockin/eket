# Contributing to EKET Python SDK

Thank you for your interest in contributing to EKET Python SDK!

## Development Setup

1. **Clone the repository**

```bash
git clone https://github.com/eket-framework/python-sdk.git
cd python-sdk
```

2. **Create a virtual environment**

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install in development mode**

```bash
make install-dev
# or
pip install -e ".[dev]"
```

## Development Workflow

### Running Tests

```bash
# Run all tests
make test

# Run with coverage
make test-cov

# Run specific test file
pytest tests/test_client.py -v
```

### Code Formatting

```bash
# Format code with black
make format

# Lint code
make lint

# Type check
make type-check
```

### Before Committing

1. Format your code: `make format`
2. Check linting: `make lint`
3. Run tests: `make test`
4. Check type hints: `make type-check`

## Coding Standards

- **PEP 8**: Follow Python style guidelines
- **Type Hints**: Add type annotations to all public APIs
- **Docstrings**: Use Google-style docstrings
- **Tests**: Write tests for all new features

### Example Docstring

```python
def example_function(param1: str, param2: int) -> bool:
    """
    Brief description of function.

    Longer description if needed.

    Args:
        param1: Description of param1
        param2: Description of param2

    Returns:
        Description of return value

    Raises:
        ValueError: When something goes wrong
    """
    pass
```

## Pull Request Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/my-feature`
3. **Make** your changes
4. **Add** tests for new functionality
5. **Ensure** all tests pass
6. **Commit** with clear messages
7. **Push** to your fork
8. **Submit** a pull request

### Commit Message Format

```
type: brief description

Longer description if needed.

- Detail 1
- Detail 2
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`

## Questions?

- Open an issue
- Join our Discord
- Email: dev@eket.dev

Thank you! 🎉
