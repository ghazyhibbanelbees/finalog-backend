import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AppError } from '../utils/errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'AUTH_TOKEN_EXPIRED', 'Sesi tidak valid, silakan login ulang');
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    req.userId = String(payload.sub);
    next();
  } catch {
    throw new AppError(401, 'AUTH_TOKEN_EXPIRED', 'Sesi berakhir, silakan login ulang');
  }
}
