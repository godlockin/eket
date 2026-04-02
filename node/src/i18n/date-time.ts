/**
 * EKET Framework - Date/Time Formatting Utilities
 * Version: 2.0.0
 *
 * 使用 date-fns 实现本地化日期格式、时区支持、相对时间格式化
 */

import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';

import { SupportedLocale } from './config.js';

/**
 * 日期格式预设
 */
export const DateFormatPresets = {
  /** ISO 8601 */
  ISO: "yyyy-MM-dd'T'HH:mm:ss.SSSxxx",
  /** 日期 */
  DATE: 'yyyy-MM-dd',
  /** 时间 */
  TIME: 'HH:mm:ss',
  /** 日期时间 */
  DATETIME: 'yyyy-MM-dd HH:mm:ss',
  /** 完整日期时间 */
  DATETIME_FULL: 'yyyy-MM-dd HH:mm:ss.SSS',
  /** 人类可读格式 */
  HUMAN_READABLE: 'MMM d, yyyy h:mm a',
  /** 紧凑格式 */
  COMPACT: 'MM/dd/yyyy HH:mm',
  /** 日志格式 */
  LOG: 'yyyy-MM-dd HH:mm:ss.SSS',
} as const;

/**
 * 语言到 locale 的映射
 */
const LOCALE_MAP = {
  'en-US': enUS,
  'zh-CN': zhCN,
};

/**
 * 获取 locale 对象
 */
function getLocale(locale?: SupportedLocale) {
  if (!locale) {
    // 从环境变量检测
    const envLocale = process.env.EKET_LOCALE || process.env.LANG || 'zh-CN';
    locale = envLocale.includes('en') ? 'en-US' : 'zh-CN';
  }
  return LOCALE_MAP[locale] || zhCN;
}

/**
 * 格式化日期为本地时间
 *
 * @param date - 日期对象、时间戳或 ISO 字符串
 * @param options - 格式化选项
 * @returns 格式化后的字符串
 *
 * @example
 * formatDateTime(new Date(), { format: 'yyyy-MM-dd HH:mm:ss', locale: 'zh-CN' })
 * // "2024-01-15 10:30:00"
 */
export function formatDateTime(
  date: Date | number | string,
  options: { format?: string; locale?: SupportedLocale } = {}
): string {
  const { format: formatStr = DateFormatPresets.DATETIME, locale } = options;

  const dateObj = toDate(date);
  const localeObj = getLocale(locale);

  return format(dateObj, formatStr, { locale: localeObj });
}

/**
 * 格式化相对时间（time ago）
 *
 * @param date - 日期对象、时间戳或 ISO 字符串
 * @param options - 选项
 * @returns 相对时间字符串（如 "3 分钟前"、"3 minutes ago"）
 *
 * @example
 * formatTimeAgo(new Date(Date.now() - 180000), { locale: 'zh-CN', addSuffix: true })
 * // "3 分钟前"
 *
 * @example
 * formatTimeAgo(new Date(Date.now() - 180000), { locale: 'en-US', addSuffix: true })
 * // "3 minutes ago"
 */
export function formatTimeAgo(
  date: Date | number | string,
  options: { locale?: SupportedLocale; addSuffix?: boolean } = {}
): string {
  const { locale, addSuffix = true } = options;
  const dateObj = toDate(date);
  const localeObj = getLocale(locale);

  return formatDistanceToNow(dateObj, {
    addSuffix,
    locale: localeObj,
  });
}

/**
 * 获取当前时间戳
 *
 * @returns 当前 Unix 时间戳（毫秒）
 */
export function now(): number {
  return Date.now();
}

/**
 * 获取当前 ISO 日期字符串
 *
 * @returns ISO 8601 格式的日期字符串
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * 解析 ISO 日期字符串
 *
 * @param isoString - ISO 8601 格式的日期字符串
 * @returns Date 对象
 */
export function parseISODate(isoString: string): Date {
  return parseISO(isoString);
}

/**
 * 将各种日期类型转换为 Date 对象
 */
function toDate(date: Date | number | string): Date {
  if (date instanceof Date) {
    return date;
  }
  if (typeof date === 'number') {
    return new Date(date);
  }
  if (typeof date === 'string') {
    return parseISO(date);
  }
  return new Date();
}

/**
 * 检查日期是否有效
 *
 * @param date - 要检查的日期
 * @returns 是否有效
 */
export function isValidDate(date: unknown): boolean {
  if (!(date instanceof Date)) {
    return false;
  }
  return !isNaN(date.getTime());
}

/**
 * 比较两个日期
 *
 * @param date1 - 日期 1
 * @param date2 - 日期 2
 * @returns -1 (date1 < date2), 0 (相等), 1 (date1 > date2)
 */
export function compareDates(date1: Date | string | number, date2: Date | string | number): number {
  const d1 = toDate(date1).getTime();
  const d2 = toDate(date2).getTime();

  if (d1 < d2) {
    return -1;
  }
  if (d1 > d2) {
    return 1;
  }
  return 0;
}

/**
 * 获取时区缩写
 *
 * @param timezone - 时区名称 (e.g., 'America/New_York', 'Asia/Shanghai')
 * @param date - 日期（用于考虑夏令时）
 * @returns 时区缩写（如 "UTC", "PST", "CST"）
 */
export function getTimezoneAbbreviation(timezone: string, date: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(date);
    const timeZonePart = parts.find((p) => p.type === 'timeZoneName');
    return timeZonePart?.value || timezone;
  } catch {
    return timezone;
  }
}

/**
 * 将本地时间转换为指定时区
 *
 * @param date - 日期对象
 * @param timezone - 目标时区 (e.g., 'America/New_York', 'Asia/Shanghai')
 * @returns 目标时区的日期字符串
 */
export function formatInTimeZone(
  date: Date | string | number,
  timezone: string,
  locale?: SupportedLocale
): string {
  const dateObj = toDate(date);
  const localeObj = getLocale(locale);

  try {
    const formatter = new Intl.DateTimeFormat(localeObj === zhCN ? 'zh-CN' : 'en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return formatter.format(dateObj);
  } catch {
    // Fallback to regular formatting
    return format(dateObj, DateFormatPresets.DATETIME, { locale: localeObj });
  }
}
