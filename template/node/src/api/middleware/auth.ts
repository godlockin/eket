/**
 * 认证中间件
 *
 * API Key 认证
 */

import { Request, Response, NextFunction } from 'express';

export function authMiddleware(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Missing Authorization header'
      });
      return;
    }

    const [type, token] = authHeader.split(' ');

    if (type !== 'Bearer') {
      res.status(401).json({
        error: 'unauthorized',
        message: 'Invalid authorization type. Expected: Bearer'
      });
      return;
    }

    if (token !== apiKey) {
      res.status(403).json({
        error: 'forbidden',
        message: 'Invalid API key'
      });
      return;
    }

    next();
  };
}
