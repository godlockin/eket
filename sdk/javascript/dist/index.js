/**
 * EKET SDK for JavaScript/TypeScript
 *
 * Universal AI Agent Collaboration Protocol SDK
 *
 * @packageDocumentation
 */
// Export main client
export { EketClient } from './client.js';
// Export error classes
export { EketError, NetworkError, AuthenticationError, ValidationError, NotFoundError, ConflictError, ServiceUnavailableError, WebSocketError, createErrorFromResponse, } from './errors.js';
// Export utilities
export { generateMessageId, generateInstanceId, isValidTaskId, isValidVersion, sleep, retry, extractErrorMessage, buildUrl, validateRequired, deepClone, isPlainObject, formatDuration, parseISODate, timeDiffSeconds, } from './utils.js';
// Version
export const VERSION = '1.0.0';
//# sourceMappingURL=index.js.map