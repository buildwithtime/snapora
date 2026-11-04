import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { config } from './config/index.js';
import { healthRoutes } from './routes/health.js';
import { resolveRoutes } from './routes/resolve.js';
import { profileRoutes } from './routes/profile.js';
import { downloadRoutes } from './routes/download.js';
import { createErrorResponse, formatRateLimitMessage, ErrorCode } from './utils/errors.js';
import { IMediaProvider } from './providers/types.js';
import { upstreamResilienceManager } from './utils/resilience.js';

export interface BuildServerOptions {
  provider?: IMediaProvider;
  enableRateLimit?: boolean;
  serveStatic?: boolean;
  corsOrigin?: string[] | boolean;
  rateLimitMax?: number;
  rateLimitWindowMs?: number;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
    disableRequestLogging: config.nodeEnv === 'test',
    bodyLimit: 1048576 // 1MB payload ceiling
  });

  // Security: CORS
  await app.register(cors, {
    origin: options.corsOrigin !== undefined ? options.corsOrigin : config.corsOrigin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400
  });

  // Security: Rate limiting
  if (options.enableRateLimit !== false) {
    await app.register(rateLimit, {
      max: options.rateLimitMax ?? config.rateLimitMax,
      timeWindow: options.rateLimitWindowMs ?? config.rateLimitWindowMs,
      errorResponseBuilder: (_request, context) => {
        const retryAfterSeconds = typeof (context as any)?.after === 'number'
          ? Math.ceil((context as any).after / 1000)
          : typeof (context as any)?.ttl === 'number'
          ? Math.ceil((context as any).ttl / 1000)
          : null;
        const message = formatRateLimitMessage(retryAfterSeconds, 'snapora');
        const errPayload = createErrorResponse(
          'LOCAL_RATE_LIMITED',
          message,
          undefined,
          retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds : undefined
        );
        const rateLimitError = Object.assign(new Error(message), errPayload, {
          statusCode: (context as any)?.statusCode || 429,
          code: 'LOCAL_RATE_LIMITED',
          retryAfterSeconds: retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds : undefined
        });
        return rateLimitError;
      }
    });
  }

  // Security Headers (defense-in-depth without external dependencies)
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    if (reply.statusCode === 429 && !reply.getHeader('x-ratelimit-source')) {
      reply.header('X-RateLimit-Source', 'snapora');
    }

    const reqUrl = request.raw.url || request.url || '';
    if (reqUrl.startsWith('/api')) {
      reply.header('Cache-Control', 'no-store, no-cache, must-revalidate');
      reply.header('Pragma', 'no-cache');
    }
  });

  // Safe global error handler (never leaks stack traces to caller)
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode || 500;

    // Explicit handling: preserve rate limit codes vs internal provider errors
    let code: ErrorCode = 'PROVIDER_ERROR';
    if (statusCode === 429) {
      const explicitCode = (error as any).code || (error as any).error?.code;
      if (explicitCode === 'UPSTREAM_RATE_LIMITED' || explicitCode === 'LOCAL_RATE_LIMITED') {
        code = explicitCode;
      } else {
        code = 'LOCAL_RATE_LIMITED';
      }
    }

    const retryAfter = (error as any).retryAfterSeconds || (error as any).error?.retryAfterSeconds;
    if (statusCode === 429 && retryAfter && !reply.getHeader('retry-after')) {
      reply.header('retry-after', retryAfter.toString());
    }

    let clientMessage = error.message || 'An internal error occurred';
    if ((config.nodeEnv === 'production' || process.env.NODE_ENV === 'production') && statusCode >= 500) {
      clientMessage = 'An unexpected internal server error occurred. Please try again later.';
    }

    reply.status(statusCode).send(
      createErrorResponse(code, clientMessage, (error as any).details || (error as any).error?.details, retryAfter)
    );
  });

  // Register API routes
  await app.register(healthRoutes);
  await app.register(resolveRoutes, { provider: options.provider });
  await app.register(profileRoutes, { provider: options.provider });
  await app.register(downloadRoutes);

  // Aggregate operational metrics (separate from public health endpoint)
  app.get('/api/admin/metrics', async (_request, reply) => {
    return reply.status(200).send({
      ok: true,
      metrics: upstreamResilienceManager.getMetrics()
    });
  });

  // Serve compiled frontend when dist directory exists (single-service deployment)
  if (options.serveStatic === true || (options.serveStatic !== false && config.nodeEnv !== 'test')) {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidateDirs = [
      path.resolve(process.cwd(), 'frontend/dist'),
      path.resolve(process.cwd(), '../frontend/dist'),
      path.resolve(currentDir, '../../frontend/dist'),
      path.resolve(currentDir, '../../../frontend/dist')
    ];
    const staticDir = candidateDirs.find((dir) => fs.existsSync(dir));

    if (staticDir) {
      await app.register(fastifyStatic, {
        root: staticDir,
        prefix: '/',
        wildcard: false
      });
    }

    // Client-side SPA routing fallback and guaranteed JSON 404 for all /api endpoints
    app.setNotFoundHandler((request, reply) => {
      const reqUrl = request.raw.url || request.url || '';
      const isApi = reqUrl.startsWith('/api');
      const isGetOrHead = request.method === 'GET' || request.method === 'HEAD';

      if (isApi) {
        reply.status(404).send(createErrorResponse('INVALID_REQUEST', 'API endpoint not found'));
      } else if (isGetOrHead && staticDir) {
        reply.sendFile('index.html');
      } else {
        reply.status(404).send(createErrorResponse('INVALID_REQUEST', 'Resource not found'));
      }
    });
  } else {
    // When static serving is disabled, ensure /api 404 still returns structured JSON
    app.setNotFoundHandler((request, reply) => {
      reply.status(404).send(createErrorResponse('INVALID_REQUEST', 'API endpoint not found'));
    });
  }

  return app;
}
