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
export class EketError extends Error {
  /** Error code */
  public readonly code: string;
  /** Additional error details */
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'EketError';
    this.code = code;
    this.details = details;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EketError);
    }
  }

  /**
   * Convert error to JSON representation
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Network-related errors (connection, timeout, etc.)
 */
export class NetworkError extends EketError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NETWORK_ERROR', details);
    this.name = 'NetworkError';
  }
}

/**
 * Authentication/authorization errors
 */
export class AuthenticationError extends EketError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'AUTHENTICATION_ERROR', details);
    this.name = 'AuthenticationError';
  }
}

/**
 * Validation errors (invalid input)
 */
export class ValidationError extends EketError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends EketError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'NOT_FOUND', details);
    this.name = 'NotFoundError';
  }
}

/**
 * Resource conflict errors (e.g., task already claimed)
 */
export class ConflictError extends EketError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', details);
    this.name = 'ConflictError';
  }
}

/**
 * Service unavailable errors
 */
export class ServiceUnavailableError extends EketError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'SERVICE_UNAVAILABLE', details);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * WebSocket-related errors
 */
export class WebSocketError extends EketError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'WEBSOCKET_ERROR', details);
    this.name = 'WebSocketError';
  }
}

/**
 * Map HTTP status codes to error classes
 */
export function createErrorFromResponse(
  status: number,
  data: { error?: { code?: string; message?: string; details?: Record<string, unknown> } }
): EketError {
  const errorData = data.error || {};
  const code = errorData.code || 'UNKNOWN_ERROR';
  const message = errorData.message || 'An unknown error occurred';
  const details = errorData.details;

  switch (status) {
    case 400:
      return new ValidationError(message, details);
    case 401:
    case 403:
      return new AuthenticationError(message, details);
    case 404:
      return new NotFoundError(message, details);
    case 409:
      return new ConflictError(message, details);
    case 503:
      return new ServiceUnavailableError(message, details);
    default:
      if (status >= 500) {
        return new ServiceUnavailableError(message, details);
      }
      return new EketError(message, code, details);
  }
}
