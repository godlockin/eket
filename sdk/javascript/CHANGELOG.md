# Changelog

All notable changes to the EKET SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-04-07

### Added

- Initial release of EKET SDK for JavaScript/TypeScript
- Full TypeScript support with complete type definitions
- Agent registration and lifecycle management
- Task management (list, claim, update)
- Inter-agent messaging system
- Pull request workflow (submit, review, merge)
- WebSocket support for real-time communication
- Comprehensive error handling with custom error classes
- Auto-reconnect for WebSocket connections
- Complete API documentation
- Three example applications:
  - Agent registration example
  - Task claiming and workflow example
  - PR review and merge example (master role)
- Unit tests for core functionality
- README with full API reference
- JSDoc comments throughout the codebase

### Features

- **EketClient** - Main client class for all operations
- **Type Safety** - Full TypeScript definitions for all APIs
- **WebSocket** - Real-time messaging with auto-reconnect
- **Error Handling** - Specific error classes for different scenarios
- **Utilities** - Helper functions for common operations
- **Examples** - Working code examples for all major workflows

### Protocols Supported

- EKET Protocol v1.0.0

### Node.js Support

- Node.js 18.0.0 or higher
