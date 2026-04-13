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
export function generateMessageId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 11);
    return `msg_${timestamp}_${random}`;
}
/**
 * Generate a unique instance ID
 */
export function generateInstanceId(role, specialty) {
    const timestamp = new Date()
        .toISOString()
        .replace(/[-:]/g, '')
        .substring(0, 15);
    const pid = Math.floor(Math.random() * 99999);
    if (role === 'master') {
        return `master_${timestamp}_${pid}`;
    }
    else {
        return specialty
            ? `slaver_${specialty}_${timestamp}_${pid}`
            : `slaver_${timestamp}_${pid}`;
    }
}
/**
 * Validate task ID format (e.g., FEAT-001)
 */
export function isValidTaskId(taskId) {
    return /^[A-Z]+-\d+$/.test(taskId);
}
/**
 * Validate semver version format
 */
export function isValidVersion(version) {
    return /^\d+\.\d+\.\d+$/.test(version);
}
/**
 * Sleep for specified milliseconds
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Retry a function with exponential backoff
 */
export async function retry(fn, options = {}) {
    const { maxRetries = 5, initialDelay = 1000, maxDelay = 30000, factor = 2, } = options;
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error;
            if (attempt < maxRetries - 1) {
                const delay = Math.min(initialDelay * Math.pow(factor, attempt), maxDelay);
                await sleep(delay);
            }
        }
    }
    throw lastError || new Error('Retry failed');
}
/**
 * Parse error response and extract message
 */
export function extractErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
        return String(error.message);
    }
    return 'An unknown error occurred';
}
/**
 * Build URL with query parameters
 */
export function buildUrl(base, path, params) {
    const url = new URL(path, base);
    if (params) {
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(key, String(value));
            }
        });
    }
    return url.toString();
}
/**
 * Validate required fields in an object
 */
export function validateRequired(obj, fields) {
    const missing = fields.filter((field) => obj[field] === undefined || obj[field] === null);
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
}
/**
 * Deep clone an object
 */
export function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}
/**
 * Check if a value is a plain object
 */
export function isPlainObject(value) {
    return (typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        Object.prototype.toString.call(value) === '[object Object]');
}
/**
 * Format duration in human-readable format
 */
export function formatDuration(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    const parts = [];
    if (days > 0)
        parts.push(`${days}d`);
    if (hours > 0)
        parts.push(`${hours}h`);
    if (minutes > 0)
        parts.push(`${minutes}m`);
    if (secs > 0 || parts.length === 0)
        parts.push(`${secs}s`);
    return parts.join(' ');
}
/**
 * Parse ISO 8601 date string to Date object
 */
export function parseISODate(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
        throw new Error(`Invalid ISO date string: ${dateString}`);
    }
    return date;
}
/**
 * Calculate time difference in seconds
 */
export function timeDiffSeconds(from, to) {
    return Math.floor((to.getTime() - from.getTime()) / 1000);
}
//# sourceMappingURL=utils.js.map