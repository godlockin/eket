/**
 * i18n Module Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { detectLocale, initI18n, getLocale, changeLocale, t, translateError, translateCLI } from '../src/i18n/config.js';

describe('i18n', () => {
  describe('detectLocale', () => {
    it('should return zh-CN by default', () => {
      const locale = detectLocale();
      expect(locale).toBe('zh-CN');
    });

    it('should return locale from EKET_LOCALE env var', () => {
      const original = process.env.EKET_LOCALE;
      process.env.EKET_LOCALE = 'en-US';
      expect(detectLocale()).toBe('en-US');
      process.env.EKET_LOCALE = original;
    });

    it('should return zh-CN when LANG contains zh', () => {
      const original = process.env.LANG;
      process.env.LANG = 'zh_CN.UTF-8';
      process.env.EKET_LOCALE = undefined;
      expect(detectLocale()).toBe('zh-CN');
      process.env.LANG = original;
    });

    it('should return en-US when LANG contains en', () => {
      const original = process.env.LANG;
      process.env.LANG = 'en_US.UTF-8';
      process.env.EKET_LOCALE = undefined;
      expect(detectLocale()).toBe('en-US');
      process.env.LANG = original;
    });
  });

  describe('initI18n', () => {
    beforeEach(() => {
      // Reset i18n state before each test
      process.env.EKET_LOCALE = 'zh-CN';
    });

    it('should initialize successfully', async () => {
      await expect(initI18n()).resolves.not.toThrow();
    });

    it('should not reinitialize on second call', async () => {
      await initI18n();
      const locale = getLocale();
      expect(locale).toBe('zh-CN');
    });
  });

  describe('translateError', () => {
    beforeEach(async () => {
      process.env.EKET_LOCALE = 'zh-CN';
      await initI18n();
    });

    it('should translate error codes to Chinese', () => {
      expect(translateError('TASK_NOT_FOUND')).toContain('未找到');
      expect(translateError('REDIS_NOT_CONNECTED')).toContain('未连接');
    });

    it('should return error code if translation not found', () => {
      expect(translateError('NON_EXISTENT_ERROR')).toBe('NON_EXISTENT_ERROR');
    });
  });

  describe('translateCLI', () => {
    beforeEach(async () => {
      process.env.EKET_LOCALE = 'zh-CN';
      await initI18n();
    });

    it('should translate CLI messages to Chinese', () => {
      expect(translateCLI('task_claimed_success')).toContain('成功');
      expect(translateCLI('project_not_found')).toContain('未找到');
    });
  });

  describe('changeLocale', () => {
    beforeEach(async () => {
      process.env.EKET_LOCALE = 'zh-CN';
      await initI18n();
    });

    it('should change locale to en-US', async () => {
      await changeLocale('en-US');
      expect(getLocale()).toBe('en-US');
    });

    it('should change locale to zh-CN', async () => {
      await changeLocale('en-US');
      await changeLocale('zh-CN');
      expect(getLocale()).toBe('zh-CN');
    });

    it('should throw error for unsupported locale', async () => {
      await expect(changeLocale('ja-JP' as any)).rejects.toThrow('Unsupported locale');
    });
  });
});
