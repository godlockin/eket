/**
 * error-identifier.test.ts
 *
 * Tests for 400 error type identification (AC-1)
 */

import { describe, it, expect } from '@jest/globals';
import { identifyErrorType, type Error400Type } from '../../src/core/error-identifier.js';

describe('error-identifier', () => {
  describe('identifyErrorType', () => {
    it('should identify context_length_exceeded from "context_length" keyword', () => {
      const stderr = 'Error: 400 Bad Request - context_length exceeded';
      const result = identifyErrorType(stderr);
      expect(result).toBe('context_length_exceeded');
    });

    it('should identify context_length_exceeded from "maximum context" keyword', () => {
      const stderr = 'Error: 400 - maximum context size reached';
      const result = identifyErrorType(stderr);
      expect(result).toBe('context_length_exceeded');
    });

    it('should identify context_length_exceeded from "context limit" keyword', () => {
      const stderr = 'Error: 400 - context limit violated';
      const result = identifyErrorType(stderr);
      expect(result).toBe('context_length_exceeded');
    });

    it('should identify context_length_exceeded from "too many tokens" keyword', () => {
      const stderr = 'Error: 400 - too many tokens in request';
      const result = identifyErrorType(stderr);
      expect(result).toBe('context_length_exceeded');
    });

    it('should identify invalid_request_error from "invalid_request" keyword', () => {
      const stderr = 'Error: 400 - invalid_request: missing required parameter';
      const result = identifyErrorType(stderr);
      expect(result).toBe('invalid_request_error');
    });

    it('should identify validation_error from "validation" keyword', () => {
      const stderr = 'Error: 400 - validation failed: invalid field value';
      const result = identifyErrorType(stderr);
      expect(result).toBe('validation_error');
    });

    it('should return unknown_400_error for unrecognized 400 errors', () => {
      const stderr = 'Error: 400 - some unknown error occurred';
      const result = identifyErrorType(stderr);
      expect(result).toBe('unknown_400_error');
    });

    it('should be case-insensitive', () => {
      const stderr = 'ERROR: 400 - CONTEXT_LENGTH EXCEEDED';
      const result = identifyErrorType(stderr);
      expect(result).toBe('context_length_exceeded');
    });

    it('should prioritize context_length over validation if both present', () => {
      const stderr = 'Error: 400 - validation failed due to context_length exceeded';
      const result = identifyErrorType(stderr);
      expect(result).toBe('context_length_exceeded');
    });

    it('should prioritize invalid_request over validation if both present (without context keywords)', () => {
      const stderr = 'Error: 400 - invalid_request: validation rules violated';
      const result = identifyErrorType(stderr);
      expect(result).toBe('invalid_request_error');
    });
  });
});
