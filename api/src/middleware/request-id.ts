/**
 * request-id.ts
 *
 * Assigns a unique request ID to every incoming request.
 * Stored in res.locals.requestId so all downstream code can reference it.
 * Also added to every response as X-Request-Id for client debugging.
 */
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = `req_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}
