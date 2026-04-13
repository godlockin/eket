/**
 * EKET SDK Utility Functions
 *
 * Helper functions for the EKET SDK
 *
 * @module utils
 */
/**
 * Generate a unique message ID
 */
export declare function generateMessageId(): string;
/**
 * Generate a unique instance ID
 */
export declare function generateInstanceId(role: 'master' | 'slaver', specialty?: string): string;
/**
 * Validate task ID format (e.g., FEAT-001)
 */
export declare function isValidTaskId(taskId: string): boolean;
/**
 * Validate semver version format
 */
export declare function isValidVersion(version: string): boolean;
/**
 * Sleep for specified milliseconds
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Retry a function with exponential backoff
 */
export declare function retry<T>(fn: () => Promise<T>, options?: {
    maxRetries?: number;
    initialDelay?: number;
    maxDelay?: number;
    factor?: number;
}): Promise<T>;
/**
 * Parse error response and extract message
 */
export declare function extractErrorMessage(error: unknown): string;
/**
 * Build URL with query parameters
 */
export declare function buildUrl(base: string, path: string, params?: Record<string, string | number | boolean | undefined>): string;
/**
 * Validate required fields in an object
 */
export declare function validateRequired<T extends object>(obj: T, fields: Array<keyof T>): void;
/**
 * Deep clone an object
 */
export declare function deepClone<T>(obj: T): T;
/**
 * Check if a value is a plain object
 */
export declare function isPlainObject(value: unknown): value is Record<string, unknown>;
/**
 * Format duration in human-readable format
 */
export declare function formatDuration(seconds: number): string;
/**
 * Parse ISO 8601 date string to Date object
 */
export declare function parseISODate(dateString: string): Date;
/**
 * Calculate time difference in seconds
 */
export declare function timeDiffSeconds(from: Date, to: Date): number;
//# sourceMappingURL=utils.d.ts.map