import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config/index.js';
import { healthRoutes } from './routes/health.js';
import { resolveRoutes } from './routes/resolve.js';
import { createErrorResponse } from './utils/errors.js';
import { IMediaProvider } from './providers/types.js';

export interface BuildServerOptions {
  provider?: IMediaProvider;
  enableRateLimit?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.nodeEnv !== 'test',
    disableRequestLogging: config.nodeEnv === 'test'
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
      errorResponseBuilder: () => {
        return createErrorResponse('RATE_LIMITED', 'Too many requests. Please slow down.');
      }
    });
  }

  // Safe global error handler (never leaks stack traces to caller)
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    const statusCode = error.statusCode || 500;
    const code = statusCode === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR';
    reply.status(statusCode).send(
      createErrorResponse(code, error.message || 'An internal error occurred')
    );
  });

  // Register routes
  await app.register(healthRoutes);
  await app.register(resolveRoutes, { provider: options.provider });

  return app;
}
