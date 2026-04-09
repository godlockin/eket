/**
 * EKET SDK Error Classes
 *
 * Custom error types for the EKET SDK
 *
 * @module errors
 */
/**
 * Base error class for EKET SDK errors
 */
export declare class EketError extends Error {
    /** Error code */
    readonly code: string;
    /** Additional error details */
    readonly details?: Record<string, unknown>;
    constructor(message: string, code: string, details?: Record<string, unknown>);
    /**
     * Convert error to JSON representation
     */
    toJSON(): Record<string, unknown>;
}
/**
 * Network-related errors (connection, timeout, etc.)
 */
export declare class NetworkError extends EketError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Authentication/authorization errors
 */
export declare class AuthenticationError extends EketError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Validation errors (invalid input)
 */
export declare class ValidationError extends EketError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Resource not found errors
 */
export declare class NotFoundError extends EketError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Resource conflict errors (e.g., task already claimed)
 */
export declare class ConflictError extends EketError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Service unavailable errors
 */
export declare class ServiceUnavailableError extends EketError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * WebSocket-related errors
 */
export declare class WebSocketError extends EketError {
    constructor(message: string, details?: Record<string, unknown>);
}
/**
 * Map HTTP status codes to error classes
 */
export declare function createErrorFromResponse(status: number, data: {
    error?: {
        code?: string;
        message?: string;
        details?: Record<string, unknown>;
    };
}): EketError;
//# sourceMappingURL=errors.d.ts.map