/**
 * Tests for error-identifier.ts (TASK-601)
 */

import { identifyErrorType } from '../../src/core/error-identifier.js';

describe('identifyErrorType', () => {
  test('should identify context_length_exceeded from various stderr formats', () => {
    const testCases = [
      'Error 400: context_length exceeded',
      'Maximum context limit reached',
      'context limit exceeded',
      'Too many tokens in request',
      'Context overflow detected',
      'Exceeded context length',
    ];

    testCases.forEach((stderr) => {
      expect(identifyErrorType(stderr)).toBe('context_length_exceeded');
    });
  });

  test('should identify invalid_request_error', () => {
    const testCases = [
      'Error 400: invalid_request',
      'Invalid request format',
      'INVALID_REQUEST: missing parameter',
    ];

    testCases.forEach((stderr) => {
      expect(identifyErrorType(stderr)).toBe('invalid_request_error');
    });
  });

  test('should identify validation_error', () => {
    const testCases = [
      'Validation error: invalid parameter',
      'Invalid parameter "foo"',
      'validation failed',
    ];

    testCases.forEach((stderr) => {
      expect(identifyErrorType(stderr)).toBe('validation_error');
    });
  });

  test('should return unknown_400_error for unrecognized errors', () => {
    const testCases = [
      'Error 400: some_unknown_error',
      'Bad request',
      '',
    ];

    testCases.forEach((stderr) => {
      expect(identifyErrorType(stderr)).toBe('unknown_400_error');
    });
  });

  test('should handle empty stderr', () => {
    expect(identifyErrorType('')).toBe('unknown_400_error');
  });

  test('should be case-insensitive', () => {
    expect(identifyErrorType('CONTEXT_LENGTH EXCEEDED')).toBe('context_length_exceeded');
    expect(identifyErrorType('Invalid_Request')).toBe('invalid_request_error');
    expect(identifyErrorType('VALIDATION error')).toBe('validation_error');
  });
});
