/**
 * Tests for Unified Error Handler
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { printError, createErrorContext, ErrorCodes } from '../../src/utils/error-handler';

describe('Unified Error Handler', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe('createErrorContext', () => {
    it('should create error context with required fields', () => {
      const context = createErrorContext('Test error message', {
        code: 'TEST_ERROR',
      });

      expect(context.code).toBe('TEST_ERROR');
      expect(context.message).toBe('Test error message');
    });

    it('should create error context with optional fields', () => {
      const context = createErrorContext('Test error message', {
        code: 'TEST_ERROR',
        causes: ['Cause 1', 'Cause 2'],
        solutions: ['Solution 1'],
        quickFix: 'npm install',
        severity: 'error',
      });

      expect(context.causes).toHaveLength(2);
      expect(context.solutions).toHaveLength(1);
      expect(context.quickFix).toBe('npm install');
      expect(context.severity).toBe('error');
    });

    it('should use default severity', () => {
      const context = createErrorContext('Test error message', {
        code: 'TEST_ERROR',
      });

      expect(context.severity).toBe('error');
    });
  });

  describe('printError', () => {
    it('should print error with code and message', () => {
      printError({
        code: 'TEST_ERROR',
        message: 'Test error message',
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should print causes when provided', () => {
      printError({
        code: 'TEST_ERROR',
        message: 'Test error message',
        causes: ['Cause 1', 'Cause 2'],
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Possible Causes')
      );
    });

    it('should print solutions when provided', () => {
      printError({
        code: 'TEST_ERROR',
        message: 'Test error message',
        solutions: ['Solution 1'],
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Suggested Solutions')
      );
    });

    it('should print quick fix when provided', () => {
      printError({
        code: 'TEST_ERROR',
        message: 'Test error message',
        quickFix: 'npm install',
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Quick Fix')
      );
    });

    it('should print doc link when provided', () => {
      printError({
        code: 'TEST_ERROR',
        message: 'Test error message',
        docLink: 'https://example.com/docs',
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Documentation')
      );
    });

    it('should format error with severity level', () => {
      printError({
        code: 'TEST_ERROR',
        message: 'Test error message',
        severity: 'critical',
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Pre-defined error messages', () => {
    it('should have SQLITE_CONNECTION_FAILED error', () => {
      expect(ErrorCodes.SQLITE_CONNECTION_FAILED).toBeDefined();
      expect(ErrorCodes.SQLITE_CONNECTION_FAILED).toBe('SQLITE_CONNECTION_FAILED');
    });

    it('should have MODULES_NOT_INSTALLED error', () => {
      expect(ErrorCodes.MODULES_NOT_INSTALLED).toBeDefined();
      expect(ErrorCodes.MODULES_NOT_INSTALLED).toBe('MODULES_NOT_INSTALLED');
    });

    it('should have REDIS_CONNECTION_FAILED error', () => {
      expect(ErrorCodes.REDIS_CONNECTION_FAILED).toBeDefined();
      expect(ErrorCodes.REDIS_CONNECTION_FAILED).toBe('REDIS_CONNECTION_FAILED');
    });
  });
});
