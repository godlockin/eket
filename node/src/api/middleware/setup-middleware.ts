/**
 * Server Middleware Setup
 *
 * CORS, rate-limiting, and request-logging setup functions.
 */

import cors from 'cors';
import express, { Express, Request } from 'express';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';

import { logger } from '../../utils/logger.js';

export function setupCORS(app: Express): void {
  const corsOrigin = process.env.CORS_ORIGIN;
  const hasExplicitOrigin = Boolean(corsOrigin);
  app.use(
    cors({
      origin: corsOrigin || false,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: hasExplicitOrigin,
    })
  );
  if (!hasExplicitOrigin) {
    logger.warn('cors_disabled', {
      message: 'CORS_ORIGIN not set — cross-origin requests blocked. Set CORS_ORIGIN to enable.',
    });
  } else {
    logger.info('cors_enabled', { origin: corsOrigin });
  }
}

export function setupRateLimiting(app: Express): void {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    message: {
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP, please try again later.',
      },
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use('/api/', limiter);
  logger.info('rate_limiting_enabled', { windowMs: 15 * 60 * 1000, max: 100 });
}

export function setupRequestLogging(app: Express): void {
  morgan.token('body', (req: Request) => {
    const body = { ...req.body };
    if (body.token) {body.token = '[REDACTED]';}
    if (body.password) {body.password = '[REDACTED]';}
    if (body.secret) {body.secret = '[REDACTED]';}
    return JSON.stringify(body);
  });
  const logFormat =
    ':remote-addr :method :url :status :res[content-length] - :response-time ms :body';
  app.use(
    morgan(logFormat, {
      stream: { write: (message: string) => logger.info(message.trim()) },
      skip: (req: Request) => req.path === '/health',
    })
  );
}

export function setupBodyParsing(app: Express): void {
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
}
