/**
 * Tests for Unified Error Handler
 */

import { printError, createErrorContext } from '../src/utils/error-handler.js';

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
      const context = createErrorContext({
        code: 'TEST_ERROR',
        message: 'Test error message',
      });

      expect(context.code).toBe('TEST_ERROR');
      expect(context.message).toBe('Test error message');
    });

    it('should create error context with optional fields', () => {
      const context = createErrorContext({
        code: 'TEST_ERROR',
        message: 'Test error message',
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
      const context = createErrorContext({
        code: 'TEST_ERROR',
        message: 'Test error message',
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

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('可能原因')
      );
    });

    it('should print solutions when provided', () => {
      printError({
        code: 'TEST_ERROR',
        message: 'Test error message',
        solutions: ['Solution 1'],
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('解决方案')
      );
    });

    it('should print quick fix when provided', () => {
      printError({
        code: 'TEST_ERROR',
        message: 'Test error message',
        quickFix: 'npm install',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('快速修复')
      );
    });

    it('should print doc link when provided', () => {
      printError({
        code: 'TEST_ERROR',
        message: 'Test error message',
        docLink: 'https://example.com/docs',
      });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('文档')
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
      const errors = require('../src/utils/error-handler.js');
      expect(errors.SQLITE_CONNECTION_FAILED).toBeDefined();
      expect(errors.SQLITE_CONNECTION_FAILED.code).toBe('SQLITE_CONNECTION_FAILED');
    });

    it('should have MODULES_NOT_INSTALLED error', () => {
      const errors = require('../src/utils/error-handler.js');
      expect(errors.MODULES_NOT_INSTALLED).toBeDefined();
      expect(errors.MODULES_NOT_INSTALLED.code).toBe('MODULES_NOT_INSTALLED');
    });

    it('should have REDIS_CONNECTION_FAILED error', () => {
      const errors = require('../src/utils/error-handler.js');
      expect(errors.REDIS_CONNECTION_FAILED).toBeDefined();
      expect(errors.REDIS_CONNECTION_FAILED.code).toBe('REDIS_CONNECTION_FAILED');
    });
  });
});
