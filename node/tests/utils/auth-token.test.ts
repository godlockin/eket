/**
 * Auth Token Tests (TASK-649)
 *
 * Tests for HMAC-SHA256 task assignment authentication
 */

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  generateAssignmentToken,
  verifyAssignmentToken,
  isAuthEnabled,
  getTokenTTL,
  getEketSecret,
  signTaskAssignment,
  requireValidToken,
  type SignedTaskAssignment,
} from '../../src/utils/auth-token.js';

describe('auth-token', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment for each test
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
  });

  describe('getEketSecret', () => {
    it('should throw if EKET_SECRET is not set', () => {
      delete process.env.EKET_SECRET;
      expect(() => getEketSecret()).toThrow('EKET_SECRET environment variable is required');
    });

    it('should throw if EKET_SECRET is too short', () => {
      process.env.EKET_SECRET = 'short';
      expect(() => getEketSecret()).toThrow('must be at least 32 characters');
    });

    it('should return secret when valid', () => {
      const secret = 'a'.repeat(32);
      process.env.EKET_SECRET = secret;
      expect(getEketSecret()).toBe(secret);
    });
  });

  describe('isAuthEnabled', () => {
    it('should return false when EKET_SECRET is not set', () => {
      delete process.env.EKET_SECRET;
      expect(isAuthEnabled()).toBe(false);
    });

    it('should return false when EKET_SECRET is too short', () => {
      process.env.EKET_SECRET = 'short';
      expect(isAuthEnabled()).toBe(false);
    });

    it('should return true when EKET_SECRET is valid', () => {
      process.env.EKET_SECRET = 'a'.repeat(32);
      expect(isAuthEnabled()).toBe(true);
    });
  });

  describe('getTokenTTL', () => {
    it('should return default TTL when EKET_TOKEN_TTL is not set', () => {
      delete process.env.EKET_TOKEN_TTL;
      expect(getTokenTTL()).toBe(300 * 1000); // 5 minutes in ms
    });

    it('should return custom TTL when EKET_TOKEN_TTL is set', () => {
      process.env.EKET_TOKEN_TTL = '60';
      expect(getTokenTTL()).toBe(60 * 1000);
    });

    it('should return default TTL for invalid EKET_TOKEN_TTL', () => {
      process.env.EKET_TOKEN_TTL = 'invalid';
      expect(getTokenTTL()).toBe(300 * 1000);
    });
  });

  describe('generateAssignmentToken', () => {
    beforeEach(() => {
      process.env.EKET_SECRET = 'a'.repeat(32);
    });

    it('should generate token with taskId, slaverId, and timestamp', () => {
      const result = generateAssignmentToken('TASK-001', 'slaver-1');

      expect(result.taskId).toBe('TASK-001');
      expect(result.slaverId).toBe('slaver-1');
      expect(typeof result.timestamp).toBe('number');
      expect(typeof result.token).toBe('string');
      expect(result.token).toHaveLength(64); // SHA256 hex = 64 chars
    });

    it('should use provided timestamp', () => {
      const ts = Date.now() - 1000;
      const result = generateAssignmentToken('TASK-001', 'slaver-1', ts);
      expect(result.timestamp).toBe(ts);
    });

    it('should generate different tokens for different inputs', () => {
      const token1 = generateAssignmentToken('TASK-001', 'slaver-1', 1000);
      const token2 = generateAssignmentToken('TASK-002', 'slaver-1', 1000);
      const token3 = generateAssignmentToken('TASK-001', 'slaver-2', 1000);
      const token4 = generateAssignmentToken('TASK-001', 'slaver-1', 2000);

      expect(token1.token).not.toBe(token2.token);
      expect(token1.token).not.toBe(token3.token);
      expect(token1.token).not.toBe(token4.token);
    });

    it('should generate same token for same inputs', () => {
      const ts = Date.now();
      const token1 = generateAssignmentToken('TASK-001', 'slaver-1', ts);
      const token2 = generateAssignmentToken('TASK-001', 'slaver-1', ts);

      expect(token1.token).toBe(token2.token);
    });
  });

  describe('signTaskAssignment', () => {
    beforeEach(() => {
      process.env.EKET_SECRET = 'b'.repeat(32);
    });

    it('should sign existing payload', () => {
      const payload = {
        taskId: 'TASK-002',
        slaverId: 'slaver-2',
        timestamp: Date.now(),
      };

      const signed = signTaskAssignment(payload);

      expect(signed.taskId).toBe(payload.taskId);
      expect(signed.slaverId).toBe(payload.slaverId);
      expect(signed.timestamp).toBe(payload.timestamp);
      expect(typeof signed.token).toBe('string');
    });
  });

  describe('verifyAssignmentToken', () => {
    beforeEach(() => {
      process.env.EKET_SECRET = 'c'.repeat(32);
    });

    it('should return valid for correct token', () => {
      const signed = generateAssignmentToken('TASK-001', 'slaver-1');
      const result = verifyAssignmentToken(signed);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return invalid for expired token', () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);

      // Generate token in the past (6 minutes ago)
      const signed = generateAssignmentToken('TASK-001', 'slaver-1', now - 6 * 60 * 1000);

      const result = verifyAssignmentToken(signed);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
    });

    it('should return invalid for tampered token', () => {
      const signed = generateAssignmentToken('TASK-001', 'slaver-1');

      // Tamper with token
      signed.token = 'tampered' + signed.token.slice(8);

      const result = verifyAssignmentToken(signed);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_signature');
    });

    it('should return invalid for modified taskId', () => {
      const signed = generateAssignmentToken('TASK-001', 'slaver-1');

      // Modify taskId after signing
      signed.taskId = 'TASK-002';

      const result = verifyAssignmentToken(signed);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_signature');
    });

    it('should return invalid for modified slaverId', () => {
      const signed = generateAssignmentToken('TASK-001', 'slaver-1');

      // Modify slaverId (replay attack)
      signed.slaverId = 'slaver-2';

      const result = verifyAssignmentToken(signed);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_signature');
    });

    it('should return invalid for missing fields', () => {
      const incomplete = {
        taskId: 'TASK-001',
        slaverId: 'slaver-1',
        timestamp: Date.now(),
        token: '', // empty token
      } as SignedTaskAssignment;

      const result = verifyAssignmentToken(incomplete);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('invalid_payload');
    });

    it('should return valid when auth is disabled', () => {
      delete process.env.EKET_SECRET;

      const fake = {
        taskId: 'TASK-001',
        slaverId: 'slaver-1',
        timestamp: Date.now(),
        token: 'fake-token',
      };

      const result = verifyAssignmentToken(fake);

      expect(result.valid).toBe(true);
    });

    it('should respect custom TTL', () => {
      jest.useFakeTimers();
      const now = Date.now();
      jest.setSystemTime(now);

      // Set 10 second TTL
      process.env.EKET_TOKEN_TTL = '10';

      // Token from 15 seconds ago should be expired
      const signed = generateAssignmentToken('TASK-001', 'slaver-1', now - 15 * 1000);

      const result = verifyAssignmentToken(signed);

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('expired');
    });
  });

  describe('requireValidToken', () => {
    beforeEach(() => {
      process.env.EKET_SECRET = 'd'.repeat(32);
    });

    it('should not throw for valid token', () => {
      const signed = generateAssignmentToken('TASK-001', 'slaver-1');
      expect(() => requireValidToken(signed)).not.toThrow();
    });

    it('should throw for invalid token', () => {
      const signed = generateAssignmentToken('TASK-001', 'slaver-1');
      signed.token = 'invalid';

      expect(() => requireValidToken(signed)).toThrow('token verification failed');
    });
  });

  describe('security: timing attack resistance', () => {
    beforeEach(() => {
      process.env.EKET_SECRET = 'e'.repeat(32);
    });

    it('should use constant-time comparison', () => {
      // This test ensures the implementation uses timingSafeEqual
      // We can't directly test timing, but we verify it handles similar tokens consistently
      const signed = generateAssignmentToken('TASK-001', 'slaver-1');

      // Create tokens with different number of matching characters
      const almostCorrect = signed.token.slice(0, -1) + '0';
      const veryWrong = '0'.repeat(64);

      signed.token = almostCorrect;
      const result1 = verifyAssignmentToken(signed);

      signed.token = veryWrong;
      const result2 = verifyAssignmentToken(signed);

      // Both should fail with same reason
      expect(result1.valid).toBe(false);
      expect(result2.valid).toBe(false);
      expect(result1.reason).toBe(result2.reason);
    });
  });
});
