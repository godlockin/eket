/**
 * EKET SDK for JavaScript/TypeScript
 *
 * Universal AI Agent Collaboration Protocol SDK
 *
 * @packageDocumentation
 */

// Export main client
export { EketClient } from './client.js';

// Export types
export type {
  // Configuration
  EketClientConfig,
  // Agent types
  AgentType,
  AgentRole,
  AgentSpecialty,
  AgentStatus,
  AgentRegistration,
  AgentRegistrationResponse,
  Agent,
  AgentFilters,
  HeartbeatParams,
  HeartbeatResponse,
  // Task types
  TaskType,
  TaskPriority,
  TaskStatus,
  AcceptanceCriterion,
  Task,
  TaskFilters,
  TaskUpdate,
  // Message types
  MessageType,
  MessagePriority,
  Message,
  SendMessageParams,
  GetMessagesOptions,
  // PR types
  TestStatus,
  ReviewStatus,
  SubmitPRParams,
  PRComment,
  PRReview,
  MergePRParams,
  MergeResult,
  // API response types
  SuccessResponse,
  ErrorResponse,
  ApiResponse,
  // WebSocket types
  WSMessageType,
  WSMessage,
  // Utility types
  HealthResponse,
} from './types.js';

// Export error classes
export {
  EketError,
  NetworkError,
  AuthenticationError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ServiceUnavailableError,
  WebSocketError,
  createErrorFromResponse,
} from './errors.js';

// Export utilities
export {
  generateMessageId,
  generateInstanceId,
  isValidTaskId,
  isValidVersion,
  sleep,
  retry,
  extractErrorMessage,
  buildUrl,
  validateRequired,
  deepClone,
  isPlainObject,
  formatDuration,
  parseISODate,
  timeDiffSeconds,
} from './utils.js';

// Version
export const VERSION = '1.0.0';
