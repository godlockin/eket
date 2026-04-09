/**
 * EKET SDK for JavaScript/TypeScript
 *
 * Universal AI Agent Collaboration Protocol SDK
 *
 * @packageDocumentation
 */
export { EketClient } from './client.js';
export type { EketClientConfig, AgentType, AgentRole, AgentSpecialty, AgentStatus, AgentRegistration, AgentRegistrationResponse, Agent, AgentFilters, HeartbeatParams, HeartbeatResponse, TaskType, TaskPriority, TaskStatus, AcceptanceCriterion, Task, TaskFilters, TaskUpdate, MessageType, MessagePriority, Message, SendMessageParams, GetMessagesOptions, TestStatus, ReviewStatus, SubmitPRParams, PRComment, PRReview, MergePRParams, MergeResult, SuccessResponse, ErrorResponse, ApiResponse, WSMessageType, WSMessage, HealthResponse, } from './types.js';
export { EketError, NetworkError, AuthenticationError, ValidationError, NotFoundError, ConflictError, ServiceUnavailableError, WebSocketError, createErrorFromResponse, } from './errors.js';
export { generateMessageId, generateInstanceId, isValidTaskId, isValidVersion, sleep, retry, extractErrorMessage, buildUrl, validateRequired, deepClone, isPlainObject, formatDuration, parseISODate, timeDiffSeconds, } from './utils.js';
export declare const VERSION = "1.0.0";
//# sourceMappingURL=index.d.ts.map