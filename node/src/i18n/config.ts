/**
 * EKET Framework - i18n Configuration
 * Version: 2.0.0
 *
 * i18next 初始化配置、资源文件加载、语言检测
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import i18next, { type Resource, type InitOptions } from 'i18next';

import { EketErrorClass } from '../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 支持的语言列表
 */
export type SupportedLocale = 'en-US' | 'zh-CN';

/**
 * i18n 配置选项
 */
export interface I18nConfig {
  /** 默认语言 */
  defaultLocale: SupportedLocale;
  /** 回退语言 */
  fallbackLocale: SupportedLocale;
  /** 语言文件路径前缀 */
  localesPath: string;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: I18nConfig = {
  defaultLocale: 'zh-CN',
  fallbackLocale: 'en-US',
  localesPath: path.join(__dirname, 'locales/'),
};

/**
 * 从环境变量检测语言
 * 优先级：ETKET_LOCALE > process.env.LANG > 默认值
 */
export function detectLocale(): SupportedLocale {
  // 1. 检查 EKET_LOCALE 环境变量
  const eketLocale = process.env.EKET_LOCALE;
  if (eketLocale && ['en-US', 'zh-CN'].includes(eketLocale)) {
    return eketLocale as SupportedLocale;
  }

  // 2. 检查 process.env.LANG (类 Unix 系统)
  const lang = process.env.LANG;
  if (lang) {
    if (lang.includes('zh')) {
      return 'zh-CN';
    }
    if (lang.includes('en')) {
      return 'en-US';
    }
  }

  // 3. 返回默认值
  return DEFAULT_CONFIG.defaultLocale;
}

/**
 * 获取翻译资源文件
 */
function loadResources(locale: string): {
  errors: Record<string, string>;
  cli: Record<string, string>;
} {
  const resources = {
    errors: {} as Record<string, string>,
    cli: {} as Record<string, string>,
  };

  try {
    const localePath = path.join(DEFAULT_CONFIG.localesPath, locale);
    const errorsPath = path.join(localePath, 'errors.json');
    const cliPath = path.join(localePath, 'cli.json');

    const errorsContent = fs.readFileSync(errorsPath, 'utf-8');
    const cliContent = fs.readFileSync(cliPath, 'utf-8');

    resources.errors = JSON.parse(errorsContent);
    resources.cli = JSON.parse(cliContent);
  } catch (error) {
    console.warn(`[i18n] Failed to load resources for locale: ${locale}`, error);
  }

  return resources;
}

/**
 * i18next 初始化
 */
let initialized = false;

export function initI18n(config: Partial<I18nConfig> = {}): void {
  if (initialized) {
    return;
  }

  const finalConfig: I18nConfig = { ...DEFAULT_CONFIG, ...config };
  const locale = detectLocale();

  try {
    // 加载默认语言资源
    const defaultResources = loadResources(finalConfig.defaultLocale);

    // 加载回退语言资源
    const fallbackResources = loadResources(finalConfig.fallbackLocale);

    // 构建 i18next 资源对象
    const resourceBundle: Resource = {
      [finalConfig.defaultLocale]: {
        errors: defaultResources.errors,
        cli: defaultResources.cli,
      },
      [finalConfig.fallbackLocale]: {
        errors: fallbackResources.errors,
        cli: fallbackResources.cli,
      },
    };

    const initOptions: InitOptions = {
      lng: locale,
      fallbackLng: finalConfig.fallbackLocale,
      supportedLngs: ['en-US', 'zh-CN'],
      resources: resourceBundle,
      interpolation: {
        escapeValue: false, // Node.js 不需要转义
      },
      defaultNS: 'errors',
      ns: ['errors', 'cli'],
      compatibilityJSON: 'v3',
    };

    i18next.init(initOptions);

    initialized = true;
    console.log(`[i18n] Initialized with locale: ${locale}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new EketErrorClass('I18N_INIT_FAILED', `Failed to initialize i18n: ${message}`);
  }
}

/**
 * 获取当前语言
 */
export function getLocale(): string {
  return i18next.language || DEFAULT_CONFIG.defaultLocale;
}

/**
 * 切换语言
 */
export function changeLocale(locale: SupportedLocale): void {
  if (!['en-US', 'zh-CN'].includes(locale)) {
    throw new EketErrorClass('INVALID_LOCALE', `Unsupported locale: ${locale}`);
  }

  try {
    // 加载新语言资源
    const resources = loadResources(locale);

    // 添加资源到 i18next
    i18next.addResourceBundle(locale, 'errors', resources.errors, true, true);
    i18next.addResourceBundle(locale, 'cli', resources.cli, true, true);

    // 切换语言
    i18next.changeLanguage(locale);
    console.log(`[i18n] Locale changed to: ${locale}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new EketErrorClass('LOCALE_CHANGE_FAILED', `Failed to change locale: ${message}`);
  }
}

/**
 * 翻译错误消息
 */
export function t(key: string, options?: Record<string, unknown>): string {
  if (!initialized) {
    console.warn('[i18n] Not initialized, returning key as fallback');
    return key;
  }

  return i18next.t(key, options as Record<string, string>);
}

/**
 * 获取错误消息的翻译
 */
export function translateError(errorCode: string, context?: Record<string, unknown>): string {
  // Use namespace prefix for errors
  const key = `errors:${errorCode}`;
  return t(key, context) || errorCode;
}

/**
 * 获取 CLI 消息的翻译
 */
export function translateCLI(key: string, options?: Record<string, unknown>): string {
  // Use namespace prefix for cli
  const fullKey = `cli:${key}`;
  return t(fullKey, options) || key;
}

/**
 * 导出 i18next 实例供直接使用
 */
export { i18next };

/**
 * 重新导出 i18next 类型
 */
export type { TFunction } from 'i18next';
