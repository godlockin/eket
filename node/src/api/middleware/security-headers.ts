/**
 * 安全响应头中间件
 *
 * 添加 HTTP 安全响应头，防止常见 Web 攻击
 *
 * @module security-headers
 */

import type { RequestHandler } from 'express';

export interface SecurityHeadersConfig {
  // 是否启用 HSTS
  hsts?: boolean;
  // HSTS max-age (秒)
  hstsMaxAge?: number;
  // 是否包含子域名
  hstsIncludeSubDomains?: boolean;
  // 内容安全策略
  csp?: string | false;
  // 是否启用 X-Frame-Options
  xFrameOptions?: boolean;
  // X-Frame-Options 值 (DENY, SAMEORIGIN)
  xFrameOptionsValue?: string;
  // 是否启用 X-Content-Type-Options
  xContentTypeOptions?: boolean;
  // 是否启用 X-XSS-Protection
  xXssProtection?: boolean;
  // 是否启用 Referrer-Policy
  referrerPolicy?: boolean;
  // Referrer-Policy 值
  referrerPolicyValue?: string;
}

export function createSecurityHeadersMiddleware(
  config: SecurityHeadersConfig = {}
): RequestHandler {
  const headers = config;

  return (req, res, next) => {
    // HSTS - 强制 HTTPS
    if (headers.hsts !== false) {
      const maxAge = headers.hstsMaxAge || 31536000; // 1 年
      const includeSubDomains = headers.hstsIncludeSubDomains ?? true;
      res.setHeader(
        'Strict-Transport-Security',
        `max-age=${maxAge}${includeSubDomains ? '; includeSubDomains' : ''}`
      );
    }

    // Content-Security-Policy
    if (headers.csp !== false) {
      const csp =
        headers.csp ||
        "default-src 'none'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data:; " +
        "font-src 'self'; " +
        "connect-src 'self'; " +
        "frame-ancestors 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'";
      res.setHeader('Content-Security-Policy', csp);
    }

    // X-Frame-Options - 防止点击劫持
    if (headers.xFrameOptions !== false) {
      res.setHeader('X-Frame-Options', headers.xFrameOptionsValue || 'DENY');
    }

    // X-Content-Type-Options - 防止 MIME 类型嗅探
    if (headers.xContentTypeOptions !== false) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }

    // X-XSS-Protection - 旧浏览器 XSS 防护
    if (headers.xXssProtection !== false) {
      res.setHeader('X-XSS-Protection', '1; mode=block');
    }

    // Referrer-Policy - 控制 Referrer 信息
    if (headers.referrerPolicy !== false) {
      res.setHeader(
        'Referrer-Policy',
        headers.referrerPolicyValue || 'strict-origin-when-cross-origin'
      );
    }

    // Permissions-Policy - 控制浏览器功能
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
    );

    // Cache-Control - 防止敏感数据缓存
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }

    next();
  };
}

/**
 * 预设配置
 */
export const presets = {
  // API 专用配置
  api: {
    csp: false, // API 不需要 CSP
    hsts: true,
    hstsMaxAge: 31536000,
    xFrameOptions: true,
    xContentTypeOptions: true,
    xXssProtection: true,
    referrerPolicy: true,
  },
  // Web Dashboard 配置
  web: {
    csp:
      "default-src 'self'; " +
      "script-src 'self'; " +
      "style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; " +
      "font-src 'self'; " +
      "connect-src 'self' http://localhost:*",
    hsts: true,
    hstsMaxAge: 31536000,
    xFrameOptions: 'DENY',
    xContentTypeOptions: true,
    xXssProtection: true,
    referrerPolicy: 'strict-origin-when-cross-origin',
  },
  // 严格模式（最高安全性）
  strict: {
    csp: "default-src 'none'; frame-ancestors 'none'",
    hsts: true,
    hstsMaxAge: 63072000, // 2 年
    hstsIncludeSubDomains: true,
    xFrameOptions: 'DENY',
    xContentTypeOptions: true,
    xXssProtection: true,
    referrerPolicy: 'no-referrer',
  },
} as const;
