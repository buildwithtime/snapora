import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { validateAndSanitizeUrl } from '../utils/ssrf.js';
import { createErrorResponse } from '../utils/errors.js';
import { providerRegistry } from '../providers/registry.js';
import { IMediaProvider } from '../providers/types.js';

const ResolveRequestBody = z.object({
  url: z.string({ required_error: 'URL is required' }).min(1, 'URL cannot be empty'),
  provider: z.string().optional(),
  userAccessToken: z.string().optional()
});

export async function resolveRoutes(app: FastifyInstance, options?: { provider?: IMediaProvider }) {
  // 1. List Providers and Capabilities
  app.get('/api/providers', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.status(200).send({
      ok: true,
      defaultProvider: providerRegistry.getDefaultProvider().id,
      providers: providerRegistry.listProviders()
    });
  });

  // 2. Resolve URL
  app.post(
    '/api/resolve',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Schema validation
      const parseResult = ResolveRequestBody.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send(
          createErrorResponse('INVALID_REQUEST', parseResult.error.errors[0]?.message || 'Invalid request body')
        );
      }

      const { url, provider: preferredProviderId, userAccessToken: bodyToken } = parseResult.data;
      const authHeader = request.headers.authorization;
      const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
      const userAccessToken = bodyToken || headerToken;

      // SSRF validation & URL canonicalization
      const validation = validateAndSanitizeUrl(url);
      if (!validation.valid || !validation.normalizedUrl || !validation.shortcode) {
        return reply.status(400).send(
          createErrorResponse('UNSUPPORTED_URL', validation.error || 'The provided URL is unsupported or invalid')
        );
      }

      // Provider selection
      const provider = options?.provider || providerRegistry.selectProviderForUrl(validation.normalizedUrl, preferredProviderId);

      try {
        const result = await provider.resolve(validation.normalizedUrl, validation.shortcode, { userAccessToken });

        if (!result.ok) {
          const status =
            result.error.code === 'AUTHENTICATION_REQUIRED' || result.error.code === 'AUTHENTICATION_ERROR'
              ? 401
              : result.error.code === 'CONTENT_PRIVATE' || result.error.code === 'PRIVATE_ACCOUNT' || result.error.code === 'HTTP_403_FORBIDDEN' || result.error.code === 'LOGIN_WALL_ENCOUNTERED'
              ? 403
              : result.error.code === 'CONTENT_UNAVAILABLE' || result.error.code === 'POST_NOT_FOUND' || result.error.code === 'METADATA_NOT_FOUND'
              ? 404
              : result.error.code === 'EXPIRED_MEDIA_URL' || result.error.code === 'MEDIA_URL_EXPIRED'
              ? 410
              : result.error.code === 'RATE_LIMITED' || result.error.code === 'HTTP_429_RATE_LIMITED'
              ? 429
              : result.error.code === 'PAGE_FETCH_FAILED' || result.error.code === 'CDN_REQUEST_FAILED' || result.error.code === 'STREAM_INTERRUPTED'
              ? 502
              : result.error.code === 'PROVIDER_NOT_CONFIGURED' || result.error.code === 'CONFIGURATION_REQUIRED'
              ? 503
              : result.error.code === 'SSRF_BLOCKED' || result.error.code === 'UNSUPPORTED_URL' || result.error.code === 'INVALID_URL'
              ? 400
              : result.error.code === 'FILE_TOO_LARGE'
              ? 413
              : result.error.code === 'MEDIA_VALIDATION_FAILED'
              ? 422
              : 502;

          if (status === 429 && result.error.retryAfterSeconds && result.error.retryAfterSeconds > 0) {
            reply.header('Retry-After', result.error.retryAfterSeconds.toString());
          }

          return reply.status(status).send(result);
        }

        return reply.status(200).send(result);
      } catch (err: unknown) {
        request.log.error(err, 'Provider resolution failure');
        return reply.status(500).send(
          createErrorResponse('PROVIDER_ERROR', 'An unexpected error occurred while resolving the media')
        );
      }
    }
  );
}
