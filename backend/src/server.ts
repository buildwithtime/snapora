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
import { createErrorResponse, formatRateLimitMessage } from './utils/errors.js';
import { IMediaProvider } from './providers/types.js';

export interface BuildServerOptions {
  provider?: IMediaProvider;
  enableRateLimit?: boolean;
  serveStatic?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
    disableRequestLogging: config.nodeEnv === 'test',
    bodyLimit: 1048576 // 1MB payload ceiling
  });

  // Security: CORS
  await app.register(cors, {
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'OPTIONS']
  });

  // Security: Rate limiting
  if (options.enableRateLimit !== false) {
    await app.register(rateLimit, {
      max: config.rateLimitMax,
      timeWindow: config.rateLimitWindowMs,
      errorResponseBuilder: (_request, context) => {
        const retryAfterSeconds = typeof (context as any)?.after === 'number'
          ? Math.ceil((context as any).after / 1000)
          : typeof (context as any)?.ttl === 'number'
          ? Math.ceil((context as any).ttl / 1000)
          : null;
        const message = formatRateLimitMessage(retryAfterSeconds);
        return createErrorResponse(
          'RATE_LIMITED',
          message,
          undefined,
          retryAfterSeconds && retryAfterSeconds > 0 ? retryAfterSeconds : undefined
        );
      }
    });
  }

  // Security Headers (defense-in-depth without external dependencies)
  app.addHook('onSend', async (request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'SAMEORIGIN');
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

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
    const code = statusCode === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR';

    let clientMessage = error.message || 'An internal error occurred';
    if (config.nodeEnv === 'production' && statusCode >= 500) {
      clientMessage = 'An unexpected internal server error occurred. Please try again later.';
    }

    reply.status(statusCode).send(
      createErrorResponse(code, clientMessage)
    );
  });

  // Register API routes
  await app.register(healthRoutes);
  await app.register(resolveRoutes, { provider: options.provider });
  await app.register(profileRoutes, { provider: options.provider });
  await app.register(downloadRoutes);

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
