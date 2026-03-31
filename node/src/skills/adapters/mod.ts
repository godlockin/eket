/**
 * EKET Framework - External AI Adapters
 * Version: 0.9.2
 *
 * Adapters for integrating with external AI systems:
 * - OpenCLAW: Local AI assistant via HTTP API
 * - Claude Code: File system based interaction
 * - Codex: Cloud-based AI service
 */

// Types
export * from './types.js';

// Adapters
export * from './openclaw-adapter.js';
export * from './claude-code-adapter.js';
export * from './codex-adapter.js';

// Factory
export * from './factory.js';
