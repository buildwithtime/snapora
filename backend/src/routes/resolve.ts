import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { validateAndSanitizeUrl } from '../utils/ssrf.js';
import { createErrorResponse } from '../utils/errors.js';
import { MockProvider } from '../providers/mock.js';
import { IMediaProvider } from '../providers/types.js';

const ResolveRequestBody = z.object({
  url: z.string({ required_error: 'URL is required' }).min(1, 'URL cannot be empty')
});

export async function resolveRoutes(app: FastifyInstance, options?: { provider?: IMediaProvider }) {
  const provider = options?.provider || new MockProvider();

  app.post(
    '/api/resolve',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // 1. Schema parsing
      const parseResult = ResolveRequestBody.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send(
          createErrorResponse('INVALID_REQUEST', parseResult.error.errors[0]?.message || 'Invalid request body')
        );
      }

      const { url } = parseResult.data;

      // 2. SSRF validation & normalization
      const validation = validateAndSanitizeUrl(url);
      if (!validation.valid || !validation.normalizedUrl || !validation.shortcode) {
        return reply.status(400).send(
          createErrorResponse('UNSUPPORTED_URL', validation.error || 'The provided URL is unsupported or invalid')
        );
      }

      // 3. Provider resolution
      try {
        const result = await provider.resolve(validation.normalizedUrl, validation.shortcode);

        if (!result.ok) {
          const status = result.error.code === 'PRIVATE_ACCOUNT' ? 403 : 502;
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
