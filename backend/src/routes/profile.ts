import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { parseInstagramUrl, USERNAME_REGEX } from '../utils/urlParser.js';
import { createErrorResponse } from '../utils/errors.js';
import { providerRegistry } from '../providers/registry.js';
import { IMediaProvider } from '../providers/types.js';

const CURSOR_REGEX = /^[a-zA-Z0-9_.:=+-]{1,512}$/;

const ProfileDiscoverBody = z.object({
  url: z.string({ required_error: 'Profile URL or username is required' }).min(1, 'Profile URL or username cannot be empty'),
  cursor: z
    .string()
    .regex(CURSOR_REGEX, 'Pagination cursor parameter contains invalid characters')
    .refine((val) => !val.includes('..'), 'Pagination cursor parameter cannot contain traversal sequences')
    .optional(),
  userAccessToken: z.string().optional(),
  provider: z.string().optional()
});

export async function profileRoutes(app: FastifyInstance, options?: { provider?: IMediaProvider }) {
  app.post(
    '/api/profile/discover',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = ProfileDiscoverBody.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send(
          createErrorResponse('INVALID_REQUEST', parseResult.error.errors[0]?.message || 'Invalid request body')
        );
      }

      const { url: rawInput, cursor, userAccessToken: bodyToken, provider: preferredProviderId } = parseResult.data;
      const authHeader = request.headers.authorization;
      const headerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
      const userAccessToken = bodyToken || headerToken;

      const trimmed = rawInput.trim();
      let canonicalUrl: string;
      let cleanUsername: string;

      if (trimmed.includes('/') || trimmed.includes('.')) {
        const parsed = parseInstagramUrl(trimmed);
        if (!parsed.valid || !parsed.canonicalUrl) {
          return reply.status(400).send(
            createErrorResponse('UNSUPPORTED_URL', parsed.error || 'The provided URL is not a valid Instagram link.')
          );
        }

        if (parsed.contentType !== 'profile' || !parsed.username) {
          return reply.status(400).send(
            createErrorResponse(
              'INVALID_REQUEST',
              `The provided URL points to an individual ${parsed.contentType || 'post'}, not an Instagram profile. Use the standard download queue for individual posts.`
            )
          );
        }

        canonicalUrl = parsed.canonicalUrl;
        cleanUsername = parsed.username;
      } else {
        const candidate = trimmed.replace(/^@/, '');
        if (!USERNAME_REGEX.test(candidate)) {
          return reply.status(400).send(
            createErrorResponse('INVALID_URL', `Invalid Instagram username format: '${candidate}'`)
          );
        }
        cleanUsername = candidate;
        canonicalUrl = `https://www.instagram.com/${cleanUsername}/`;
      }

      // Provider selection
      const provider = options?.provider || providerRegistry.selectProviderForProfile(canonicalUrl, preferredProviderId);

      if (!provider.discoverProfile) {
        return reply.status(503).send(
          createErrorResponse('UNSUPPORTED_RETRIEVAL_METHOD', `Provider '${provider.name}' does not support profile discovery.`)
        );
      }

      try {
        const result = await provider.discoverProfile(canonicalUrl, {
          cursor,
          userAccessToken
        });

        // Enforce server-side ceiling of 500 items per response to protect memory
        if (result.ok && Array.isArray(result.items) && result.items.length > 500) {
          result.items = result.items.slice(0, 500);
          if (result.pagination) {
            result.pagination.hasMore = false;
          }
        }

        if (!result.ok) {
          const status =
            result.error.code === 'AUTHENTICATION_REQUIRED' || result.error.code === 'AUTHENTICATION_ERROR'
              ? 401
              : result.error.code === 'CONTENT_PRIVATE' ||
                result.error.code === 'PRIVATE_ACCOUNT' ||
                result.error.code === 'HTTP_403_FORBIDDEN' ||
                result.error.code === 'LOGIN_WALL_ENCOUNTERED'
              ? 403
              : result.error.code === 'CONTENT_UNAVAILABLE' || result.error.code === 'POST_NOT_FOUND' || result.error.code === 'METADATA_NOT_FOUND'
              ? 404
              : result.error.code === 'EXPIRED_MEDIA_URL' || result.error.code === 'MEDIA_URL_EXPIRED'
              ? 410
              : result.error.code === 'RATE_LIMITED' || result.error.code === 'HTTP_429_RATE_LIMITED'
              ? 429
              : result.error.code === 'PROVIDER_NOT_CONFIGURED' || result.error.code === 'CONFIGURATION_REQUIRED'
              ? 503
              : result.error.code === 'SSRF_BLOCKED' ||
                result.error.code === 'UNSUPPORTED_URL' ||
                result.error.code === 'INVALID_URL' ||
                result.error.code === 'INVALID_REQUEST'
              ? 400
              : 502;

          if (status === 429 && result.error.retryAfterSeconds && result.error.retryAfterSeconds > 0) {
            reply.header('Retry-After', result.error.retryAfterSeconds.toString());
          }

          return reply.status(status).send(result);
        }

        return reply.status(200).send(result);
      } catch (err: unknown) {
        request.log.error(err, 'Profile discovery failure');
        return reply.status(500).send(
          createErrorResponse('PROVIDER_ERROR', 'An unexpected error occurred while discovering profile media')
        );
      }
    }
  );
}

