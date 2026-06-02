/**
 * Task Assignment Authentication Token (TASK-649)
 *
 * HMAC-SHA256 based token for securing task assignments between Master and Slaver.
 *
 * Token format: HMAC-SHA256(taskId:slaverId:timestamp, EKET_SECRET)
 *
 * Security features:
 * - Time-bound: Tokens expire after TTL (default 5 minutes)
 * - Tamper-proof: HMAC prevents modification
 * - Replay-resistant: Timestamp prevents reuse
 *
 * @module AuthToken
 */

import * as crypto from 'crypto';

import { logger } from './logger.js';

// ============================================================================
// Constants
// ============================================================================

/** Default token TTL in seconds (5 minutes) */
const DEFAULT_TOKEN_TTL_SECONDS = 300;

/** Minimum required secret length */
const MIN_SECRET_LENGTH = 32;

// ============================================================================
// Types
// ============================================================================

/**
 * Token payload for task assignment
 */
export interface TokenPayload {
  taskId: string;
  slaverId: string;
  timestamp: number;
}

/**
 * Signed task assignment with token
 */
export interface SignedTaskAssignment extends TokenPayload {
  token: string;
}

/**
 * Token verification result
 */
export interface TokenVerificationResult {
  valid: boolean;
  reason?: 'expired' | 'invalid_signature' | 'missing_secret' | 'invalid_payload';
}

// ============================================================================
// Secret Management
// ============================================================================

/**
 * Get EKET_SECRET from environment
 * @throws Error if secret is not configured or too short
 */
export function getEketSecret(): string {
  const secret = process.env.EKET_SECRET;
  if (!secret) {
    throw new Error(
      'EKET_SECRET environment variable is required for task assignment authentication. ' +
        `Generate a secure key: openssl rand -hex 32`
    );
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `EKET_SECRET must be at least ${MIN_SECRET_LENGTH} characters. ` +
        `Current length: ${secret.length}. Generate a secure key: openssl rand -hex 32`
    );
  }
  return secret;
}

/**
 * Check if authentication is enabled (secret is configured)
 */
export function isAuthEnabled(): boolean {
  const secret = process.env.EKET_SECRET;
  return !!secret && secret.length >= MIN_SECRET_LENGTH;
}

/**
 * Get token TTL from environment or use default
 */
export function getTokenTTL(): number {
  const ttlEnv = process.env.EKET_TOKEN_TTL;
  if (ttlEnv) {
    const ttl = parseInt(ttlEnv, 10);
    if (!isNaN(ttl) && ttl > 0) {
      return ttl * 1000; // Convert to milliseconds
    }
  }
  return DEFAULT_TOKEN_TTL_SECONDS * 1000;
}

// ============================================================================
// Token Generation
// ============================================================================

/**
 * Generate HMAC-SHA256 token for task assignment
 *
 * @param taskId - Task identifier
 * @param slaverId - Target Slaver identifier
 * @param timestamp - Assignment timestamp (default: now)
 * @returns Signed task assignment with token
 */
export function generateAssignmentToken(
  taskId: string,
  slaverId: string,
  timestamp?: number
): SignedTaskAssignment {
  const secret = getEketSecret();
  const ts = timestamp ?? Date.now();

  const payload = `${taskId}:${slaverId}:${ts}`;
  const token = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  logger.debug('auth_token_generated', {
    taskId,
    slaverId,
    timestamp: ts,
  });

  return {
    taskId,
    slaverId,
    timestamp: ts,
    token,
  };
}

/**
 * Sign an existing task assignment
 *
 * @param assignment - Task assignment to sign
 * @returns Signed assignment with token
 */
export function signTaskAssignment(assignment: TokenPayload): SignedTaskAssignment {
  return generateAssignmentToken(assignment.taskId, assignment.slaverId, assignment.timestamp);
}

// ============================================================================
// Token Verification
// ============================================================================

/**
 * Verify task assignment token
 *
 * Checks:
 * 1. Token expiration (within TTL)
 * 2. Signature validity (HMAC match)
 *
 * @param assignment - Signed task assignment to verify
 * @returns Verification result with reason if invalid
 */
export function verifyAssignmentToken(assignment: SignedTaskAssignment): TokenVerificationResult {
  // Check if auth is enabled
  if (!isAuthEnabled()) {
    logger.warn('auth_token_verification_skipped', {
      reason: 'EKET_SECRET not configured',
      taskId: assignment.taskId,
    });
    // Return valid when auth is disabled (backward compatibility)
    return { valid: true };
  }

  const secret = process.env.EKET_SECRET!;
  const ttl = getTokenTTL();

  // Validate payload
  if (!assignment.taskId || !assignment.slaverId || !assignment.timestamp || !assignment.token) {
    logger.warn('auth_token_invalid_payload', {
      taskId: assignment.taskId,
      slaverId: assignment.slaverId,
      hasTimestamp: !!assignment.timestamp,
      hasToken: !!assignment.token,
    });
    return { valid: false, reason: 'invalid_payload' };
  }

  // Check expiration
  const age = Date.now() - assignment.timestamp;
  if (age > ttl) {
    logger.warn('auth_token_expired', {
      taskId: assignment.taskId,
      slaverId: assignment.slaverId,
      age,
      ttl,
    });
    return { valid: false, reason: 'expired' };
  }

  // Verify signature
  const payload = `${assignment.taskId}:${assignment.slaverId}:${assignment.timestamp}`;
  const expectedToken = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  const tokenBuffer = Buffer.from(assignment.token, 'hex');
  const expectedBuffer = Buffer.from(expectedToken, 'hex');

  if (
    tokenBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)
  ) {
    logger.warn('auth_token_invalid_signature', {
      taskId: assignment.taskId,
      slaverId: assignment.slaverId,
    });
    return { valid: false, reason: 'invalid_signature' };
  }

  logger.debug('auth_token_verified', {
    taskId: assignment.taskId,
    slaverId: assignment.slaverId,
  });

  return { valid: true };
}

/**
 * Strict verification - throws on invalid token
 *
 * @param assignment - Signed task assignment to verify
 * @throws Error if token is invalid
 */
export function requireValidToken(assignment: SignedTaskAssignment): void {
  const result = verifyAssignmentToken(assignment);
  if (!result.valid) {
    throw new Error(
      `Task assignment token verification failed: ${result.reason}. ` +
        `TaskId: ${assignment.taskId}, SlaverId: ${assignment.slaverId}`
    );
  }
}
