# Changelog

All notable changes to EKET Python SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-07

### Added

- Initial release of EKET Python SDK
- Full EKET Protocol v1.0.0 support
- Agent lifecycle management
  - Register/deregister agents
  - Heartbeat mechanism
  - Agent status tracking
- Task management
  - List tasks with filters
  - Claim tasks
  - Update task status and progress
- Inter-agent messaging
  - Send messages with priorities
  - Receive and filter messages
  - Message correlation support
- Pull request workflow
  - Submit PRs
  - Review PRs
  - Merge PRs
- Data models with type hints
  - Agent, Task, Message, PR models
  - Enumerations for all status types
- Error handling
  - Custom exception hierarchy
  - Detailed error messages
- Utilities
  - Retry with exponential backoff
  - Task ID validation
  - Duration formatting
- Complete documentation
  - README with API reference
  - Usage examples
  - Contributing guidelines
- Unit tests
  - Client tests
  - Model tests
  - Mock-based testing
- Development tools
  - Makefile for common tasks
  - Black code formatter config
  - Flake8 linter config
  - MyPy type checker config
  - Pytest configuration

### Dependencies

- requests >= 2.31.0

### Documentation

- [README.md](README.md) - Main documentation
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [examples/](examples/) - Usage examples
- Docstrings for all public APIs

---

## Future Releases

### Planned for v1.1.0

- WebSocket support for real-time communication
- Automatic heartbeat context manager
- CLI tool for quick testing
- Enhanced retry strategies
- Connection pooling optimization

### Planned for v1.2.0

- Async/await support (asyncio)
- File mode fallback support
- Enhanced caching mechanisms
- Metrics and monitoring hooks

---

[1.0.0]: https://github.com/eket-framework/python-sdk/releases/tag/v1.0.0
