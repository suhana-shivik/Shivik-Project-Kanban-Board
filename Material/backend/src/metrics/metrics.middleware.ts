import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

/**
 * The metrics endpoints would inflate their own numbers, socket.io's transport
 * polls constantly, and every browser tab asks for a favicon — counting any of
 * them drowns out the real traffic.
 */
const IGNORED = /^\/(api\/metrics|socket\.io|favicon\.ico)/;

/**
 * Middleware rather than an interceptor: an interceptor only runs for requests
 * that matched a route, so 404s — the ones worth seeing — would go uncounted.
 */
export function createMetricsMiddleware(metrics: MetricsService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (IGNORED.test(req.originalUrl)) {
      next();
      return;
    }

    const startedAt = process.hrtime.bigint();
    metrics.begin();

    // peek at error payloads on the way out so failures carry their reason
    let failureBody: unknown = null;
    const sendJson = res.json.bind(res) as (body: unknown) => Response;
    res.json = (body: unknown): Response => {
      if (res.statusCode >= 400) failureBody = body;
      return sendJson(body);
    };

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

      metrics.record(
        req.method,
        normalizeRoute(req.originalUrl),
        res.statusCode,
        durationMs,
        res.statusCode >= 400 ? describe(failureBody) : null,
      );
    });

    next();
  };
}

/**
 * Groups per-record URLs onto one endpoint, so /materials/1 and /materials/2
 * are counted together as /materials/:id.
 */
function normalizeRoute(url: string): string {
  const path = url.split('?')[0];

  return (
    path
      .split('/')
      .map((segment) => (/^\d+$/.test(segment) ? ':id' : segment))
      .join('/')
      .replace(/\/$/, '') || '/'
  );
}

/** Pulls a short reason out of whichever error shape came back. */
function describe(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const payload = body as Record<string, unknown>;

  if (typeof payload.reason === 'string') return payload.reason;

  if (payload.errors && typeof payload.errors === 'object') {
    const errors = payload.errors as Record<string, string>;
    return Object.entries(errors)
      .map(([field, message]) => `${field}: ${message}`)
      .join('; ');
  }

  if (typeof payload.message === 'string') return payload.message;
  if (Array.isArray(payload.message)) return payload.message.join('; ');

  return null;
}
