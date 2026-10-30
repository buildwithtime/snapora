import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import net from 'node:net';
import { z } from 'zod';
import { parseInstagramUrl } from '../utils/urlParser.js';
import { validateMediaBytes } from '../utils/mediaValidator.js';
import { createErrorResponse, parseRetryAfter, formatRateLimitMessage } from '../utils/errors.js';
import { safeHttpsRequest, SafeRequestResponse } from '../utils/ssrfClient.js';
import { isPrivateOrReservedIp } from '../utils/ssrf.js';
import { config } from '../config/index.js';

const DownloadQuerySchema = z.object({
  url: z.string().min(1, 'Media URL is required'),
  filename: z.string().optional(),
  expectedType: z.enum(['image', 'video']).optional()
});

function sanitizeFilename(raw?: string, detectedType?: string): string {
  if (!raw) {
    if (detectedType === 'video/mp4') return 'snapora_media.mp4';
    if (detectedType === 'image/jpeg') return 'snapora_media.jpg';
    if (detectedType === 'image/webp') return 'snapora_media.webp';
    return 'snapora_media.bin';
  }

  // Strip path traversal characters, directory separators, and control characters
  let clean = raw.replace(/[/\\?%*:|"<>]/g, '_').trim();
  if (clean.length === 0) clean = 'snapora_media';

  // Ensure file extension matches verified binary signature
  if (detectedType === 'video/mp4') {
    clean = clean.replace(/\.(jpg|jpeg|webp|bin)$/i, '') + (clean.toLowerCase().endsWith('.mp4') ? '' : '.mp4');
  } else if (detectedType === 'image/jpeg') {
    clean = clean.replace(/\.(mp4|webp|bin)$/i, '') + (clean.toLowerCase().endsWith('.jpg') || clean.toLowerCase().endsWith('.jpeg') ? '' : '.jpg');
  } else if (detectedType === 'image/webp') {
    clean = clean.replace(/\.(mp4|jpg|jpeg|bin)$/i, '') + (clean.toLowerCase().endsWith('.webp') ? '' : '.webp');
  }

  return clean;
}

export async function downloadRoutes(app: FastifyInstance) {
  app.get(
    '/api/download',
    async (request: FastifyRequest<{ Querystring: { url: string; filename?: string; expectedType?: 'image' | 'video' } }>, reply: FastifyReply) => {
      const parseResult = DownloadQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        return reply.status(400).send(
          createErrorResponse('INVALID_REQUEST', parseResult.error.errors[0]?.message || 'Invalid download parameters')
        );
      }

      const { url, filename, expectedType } = parseResult.data;

      let parsedTarget: URL;
      try {
        parsedTarget = new URL(url);
      } catch {
        return reply.status(400).send(createErrorResponse('INVALID_URL', 'Invalid destination URL'));
      }

      // Protocol check: only HTTPS allowed
      if (parsedTarget.protocol !== 'https:') {
        return reply.status(400).send(
          createErrorResponse('SSRF_BLOCKED', 'Only HTTPS destinations are permitted for media downloads')
        );
      }

      // Check literal IP address against SSRF private/loopback/cloud metadata
      const hostClean = parsedTarget.hostname.toLowerCase().replace(/\.+$/, '');
      if (net.isIP(hostClean) && isPrivateOrReservedIp(hostClean)) {
        return reply.status(400).send(
          createErrorResponse('SSRF_BLOCKED', `Prohibited destination IP '${hostClean}' resides in a restricted range`)
        );
      }

      // URL pattern validation
      const parsed = parseInstagramUrl(url);
      if (!parsed.valid) {
        return reply.status(400).send(
          createErrorResponse('UNSUPPORTED_URL', parsed.error || 'The requested media URL is invalid')
        );
      }

      const clientAbortController = new AbortController();
      request.raw.on('close', () => {
        if (!reply.raw.writableEnded) {
          clientAbortController.abort();
        }
      });

      // Execute connection-pinned safe HTTPS request (immune to DNS rebinding & redirect hijacking)
      let safeResponse: SafeRequestResponse;
      try {
        safeResponse = await safeHttpsRequest(url, {
          method: 'GET',
          timeoutMs: config.resolverTimeoutMs || 30000,
          maxResponseSizeBytes: config.maxResponseSizeBytes || 52428800,
          signal: clientAbortController.signal
        });
      } catch (err: any) {
        if (err.code === 'SSRF_BLOCKED') {
          return reply.status(400).send(createErrorResponse('SSRF_BLOCKED', err.message));
        }
        if (err.code === 'INVALID_URL') {
          return reply.status(400).send(createErrorResponse('INVALID_URL', err.message));
        }
        if (err.code === 'TIMEOUT') {
          return reply.status(499).send(createErrorResponse('TIMEOUT', err.message));
        }
        const msg = err instanceof Error ? err.message : 'Network fetch failure';
        return reply.status(502).send(createErrorResponse('NETWORK_ERROR', `Failed to connect to media host: ${msg}`));
      }

      if (safeResponse.statusCode === 429) {
        safeResponse.stream.destroy();
        const retryHeader = safeResponse.headers['retry-after'];
        const retrySeconds = parseRetryAfter(retryHeader);
        const message = formatRateLimitMessage(retrySeconds);
        if (retrySeconds && retrySeconds > 0) {
          reply.header('Retry-After', retrySeconds.toString());
        }
        return reply.status(429).send(
          createErrorResponse('RATE_LIMITED', message, undefined, retrySeconds && retrySeconds > 0 ? retrySeconds : undefined)
        );
      }

      if (safeResponse.statusCode >= 400) {
        safeResponse.stream.destroy();
        return reply.status(502).send(
          createErrorResponse('PROVIDER_ERROR', `Upstream host returned HTTP status ${safeResponse.statusCode}`)
        );
      }

      // Check Content-Length if supplied
      const contentLengthHeader = safeResponse.headers['content-length'];
      if (contentLengthHeader) {
        const expectedLength = parseInt(contentLengthHeader, 10);
        if (!isNaN(expectedLength) && expectedLength > config.maxResponseSizeBytes) {
          safeResponse.stream.destroy();
          return reply.status(413).send(
            createErrorResponse('FILE_TOO_LARGE', `Media exceeds maximum size of ${config.maxResponseSizeBytes} bytes`)
          );
        }
      }

      // Inspect initial chunk for magic bytes validation
      const stream = safeResponse.stream;
      let firstChunk: Buffer | null = null;

      try {
        firstChunk = await new Promise<Buffer | null>((resolve, reject) => {
          const onData = (chunk: Buffer) => {
            cleanup();
            resolve(chunk);
          };
          const onEnd = () => {
            cleanup();
            resolve(null);
          };
          const onError = (err: Error) => {
            cleanup();
            reject(err);
          };

          const cleanup = () => {
            stream.removeListener('data', onData);
            stream.removeListener('end', onEnd);
            stream.removeListener('error', onError);
          };

          stream.on('data', onData);
          stream.on('end', onEnd);
          stream.on('error', onError);
        });
      } catch (readErr) {
        stream.destroy();
        return reply.status(502).send(createErrorResponse('NETWORK_ERROR', 'Failed to read media header chunk'));
      }

      if (!firstChunk || firstChunk.length < 12) {
        stream.destroy();
        return reply.status(422).send(
          createErrorResponse('MEDIA_VALIDATION_FAILED', 'Media response is empty or truncated')
        );
      }

      const magicCheck = validateMediaBytes(firstChunk);
      if (!magicCheck.valid) {
        stream.destroy();
        return reply.status(422).send(
          createErrorResponse(
            'MEDIA_VALIDATION_FAILED',
            magicCheck.error || 'Corrupted or invalid file signature detected'
          )
        );
      }

      // Enforce strict media type matching (prevent thumbnail spoofing as video)
      if (expectedType === 'video' && magicCheck.detectedType !== 'video/mp4') {
        stream.destroy();
        return reply.status(422).send(
          createErrorResponse(
            'MEDIA_VALIDATION_FAILED',
            `Expected video stream (MP4), but received ${magicCheck.detectedType || 'preview/image'}. Preview images cannot be downloaded as videos.`
          )
        );
      }

      if (expectedType === 'image' && magicCheck.detectedType === 'video/mp4') {
        stream.destroy();
        return reply.status(422).send(
          createErrorResponse(
            'MEDIA_VALIDATION_FAILED',
            'Expected image stream, but received video/mp4 stream.'
          )
        );
      }

      // Stream verified bytes to client with extension synced to verified magic bytes
      const safeFilename = sanitizeFilename(filename, magicCheck.detectedType);
      reply.raw.setHeader('Content-Type', magicCheck.detectedType || 'application/octet-stream');
      reply.raw.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      reply.raw.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      reply.raw.setHeader('Pragma', 'no-cache');
      reply.raw.setHeader('X-Content-Type-Options', 'nosniff');
      if (contentLengthHeader) {
        reply.raw.setHeader('Content-Length', contentLengthHeader);
      }

      reply.raw.writeHead(200);
      reply.raw.write(firstChunk);

      let totalBytes = firstChunk.length;

      if (stream.readableEnded) {
        reply.raw.end();
      } else {
        stream.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > config.maxResponseSizeBytes) {
            stream.destroy(new Error('File size exceeded limit'));
            reply.raw.destroy(new Error('File size exceeded limit'));
            return;
          }
          reply.raw.write(chunk);
        });

        stream.on('end', () => {
          reply.raw.end();
        });
      }

      stream.on('error', () => {
        if (!reply.raw.writableEnded) {
          reply.raw.destroy();
        }
      });
    }
  );
}
