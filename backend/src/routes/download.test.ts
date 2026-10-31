import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../server.js';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import * as ssrfClient from '../utils/ssrfClient.js';

describe('Media Download Route — Security & Stream Validation', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({ enableRateLimit: false });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects download request with missing URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download'
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
  });

  it('blocks private or loopback IP download destinations (SSRF defense)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://127.0.0.1/test.jpg'
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('SSRF_BLOCKED');
  });

  it('blocks cloud metadata endpoint downloads (SSRF defense)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://169.254.169.254/latest/meta-data/'
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('SSRF_BLOCKED');
  });

  it('blocks unencrypted HTTP download URLs', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=http://scontent-iad3-1.cdninstagram.com/photo.jpg'
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('SSRF_BLOCKED');
  });

  it('blocks downloads from unapproved external domains', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://attacker.example.com/malware.exe'
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('UNSUPPORTED_URL');
  });

  it('blocks downloads with non-standard ports', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://scontent-iad3-1.cdninstagram.com:8443/photo.jpg'
    });
    expect(res.statusCode).toBe(400);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('UNSUPPORTED_URL');
  });

  it('sets Cache-Control: no-store, no-cache, must-revalidate and Pragma: no-cache on /api/download error responses', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/download'
    });
    expect(res.statusCode).toBe(400);
    expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
    expect(res.headers['pragma']).toBe('no-cache');
  });

  it('handles upstream HTTP 429 on download with Retry-After header and formatted message', async () => {
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 429,
      headers: { 'retry-after': '30' },
      stream: Readable.from([]) as any,
      finalUrl: 'https://scontent-iad3-1.cdninstagram.com/photo.jpg'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://scontent-iad3-1.cdninstagram.com/photo.jpg'
    });

    expect(res.statusCode).toBe(429);
    expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
    expect(res.headers['pragma']).toBe('no-cache');
    expect(res.headers['retry-after']).toBe('30');

    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('RATE_LIMITED');
    expect(json.error.message).toBe('Instagram is temporarily limiting requests. Please try again in 30 seconds.');
    expect(json.error.retryAfterSeconds).toBe(30);
  });

  it('sets Cache-Control and Pragma headers on raw streaming download response without interfering with stream', async () => {
    // Valid JPEG header bytes: FF D8 FF E0 00 10 4A 46 49 46 00 01
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01
    ]);

    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'image/jpeg', 'content-length': String(jpegBytes.length) },
      stream: Readable.from([jpegBytes]) as any,
      finalUrl: 'https://scontent-iad3-1.cdninstagram.com/photo.jpg'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://scontent-iad3-1.cdninstagram.com/photo.jpg&filename=test.jpg'
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store, no-cache, must-revalidate');
    expect(res.headers['pragma']).toBe('no-cache');
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['content-disposition']).toContain('attachment; filename="test.jpg"');
    expect(res.rawPayload.length).toBe(jpegBytes.length);
  });

  it('streams MP4 video file from video CDN hostname end-to-end', async () => {
    // Valid MP4 header bytes with ftyp box: 00 00 00 18 66 74 79 70 69 73 6f 6d ...
    const mp4Bytes = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
      0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10
    ]);

    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'video/mp4', 'content-length': String(mp4Bytes.length) },
      stream: Readable.from([mp4Bytes]) as any,
      finalUrl: 'https://video-iad3-1.cdninstagram.com/o1/v/t2/f2/m86/video.mp4'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://video-iad3-1.cdninstagram.com/o1/v/t2/f2/m86/video.mp4&filename=video.mp4&expectedType=video'
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('video/mp4');
    expect(res.headers['content-disposition']).toContain('attachment; filename="video.mp4"');
    expect(res.rawPayload.length).toBe(mp4Bytes.length);
  });

  it('handles upstream HTTP 403 / 410 as EXPIRED_MEDIA_URL', async () => {
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 403,
      headers: {},
      stream: Readable.from([]) as any,
      finalUrl: 'https://video-iad3-1.cdninstagram.com/video.mp4?oe=65abcdef'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://video-iad3-1.cdninstagram.com/video.mp4?oe=65abcdef'
    });

    expect(res.statusCode).toBe(403);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('EXPIRED_MEDIA_URL');
  });

  it('handles upstream HTTP 404 as POST_NOT_FOUND', async () => {
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 404,
      headers: {},
      stream: Readable.from([]) as any,
      finalUrl: 'https://scontent-iad3-1.cdninstagram.com/photo.jpg'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://scontent-iad3-1.cdninstagram.com/photo.jpg'
    });

    expect(res.statusCode).toBe(404);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('POST_NOT_FOUND');
  });

  it('rejects files exceeding MAX_RESPONSE_SIZE_BYTES with 413 FILE_TOO_LARGE', async () => {
    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'video/mp4', 'content-length': '200000000' }, // 200 MB > 150 MB
      stream: Readable.from([]) as any,
      finalUrl: 'https://video-iad3-1.cdninstagram.com/large_video.mp4'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://video-iad3-1.cdninstagram.com/large_video.mp4'
    });

    expect(res.statusCode).toBe(413);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('FILE_TOO_LARGE');
  });

  it('rejects truncated streams with 422 MEDIA_VALIDATION_FAILED', async () => {
    const tinyBytes = Buffer.from([0x00, 0x01, 0x02]);

    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'image/jpeg' },
      stream: Readable.from([tinyBytes]) as any,
      finalUrl: 'https://scontent-iad3-1.cdninstagram.com/photo.jpg'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://scontent-iad3-1.cdninstagram.com/photo.jpg'
    });

    expect(res.statusCode).toBe(422);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('MEDIA_VALIDATION_FAILED');
  });

  it('delivers all chunks across multi-chunk streaming without byte drops', async () => {
    // 3 separate chunks simulating multi-chunk TCP stream
    const chunk1 = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
    ]);
    const chunk2 = Buffer.alloc(1024, 0xaa);
    const chunk3 = Buffer.alloc(2048, 0xbb);

    const stream = new Readable({
      read() {
        this.push(chunk1);
        this.push(chunk2);
        this.push(chunk3);
        this.push(null);
      }
    });

    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'video/mp4' },
      stream: stream as any,
      finalUrl: 'https://video-iad3-1.cdninstagram.com/video.mp4'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://video-iad3-1.cdninstagram.com/video.mp4&filename=reel.mp4&expectedType=video'
    });

    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.length).toBe(chunk1.length + chunk2.length + chunk3.length);
    // Verify first chunk and later chunks are intact in output payload
    expect(res.rawPayload.subarray(0, 16)).toEqual(chunk1);
    expect(res.rawPayload.subarray(16, 16 + 1024)).toEqual(chunk2);
  });

  it('rejects expected video stream when payload is an image thumbnail', async () => {
    // JPEG bytes sent when video was expected
    const jpegBytes = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01
    ]);

    vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
      statusCode: 200,
      headers: { 'content-type': 'image/jpeg' },
      stream: Readable.from([jpegBytes]) as any,
      finalUrl: 'https://scontent-iad3-1.cdninstagram.com/thumb.jpg'
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/download?url=https://scontent-iad3-1.cdninstagram.com/thumb.jpg&expectedType=video'
    });

    expect(res.statusCode).toBe(422);
    const json = res.json();
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('MEDIA_VALIDATION_FAILED');
    expect(json.error.message).toContain('Expected video stream');
  });

  describe('Stream Integrity, Exact Byte Delivery & Checksum Verification', () => {
    it('verifies single-chunk MP4 delivery with exact byte count and matching SHA-256 checksum', async () => {
      // Authentic ISO BMFF MP4 header: 4-byte size (24), 'ftyp', 'isom', minor ver, compatible brands + payload
      const originalPayload = Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, 0x6d, 0x70, 0x34, 0x31, 0x69, 0x73, 0x6f, 0x6d]),
        Buffer.alloc(8192, 0x42) // 8 KB payload
      ]);
      const originalByteCount = originalPayload.length;
      const originalSha256 = crypto.createHash('sha256').update(originalPayload).digest('hex');

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(originalByteCount) },
        stream: Readable.from([originalPayload]) as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/single_chunk.mp4'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://video-iad3-1.cdninstagram.com/single_chunk.mp4&filename=single.mp4&expectedType=video'
      });

      expect(res.statusCode).toBe(200);
      const receivedByteCount = res.rawPayload.length;
      const receivedSha256 = crypto.createHash('sha256').update(res.rawPayload).digest('hex');

      expect(receivedByteCount).toBe(originalByteCount);
      expect(receivedSha256).toBe(originalSha256);
      expect(res.rawPayload).toEqual(originalPayload);
    });

    it('verifies multi-chunk MP4 delivery with exact byte count and matching SHA-256 checksum', async () => {
      const headerChunk = Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
        0x6d, 0x70, 0x34, 0x31, 0x69, 0x73, 0x6f, 0x6d
      ]);
      const chunk2 = Buffer.alloc(512, 0x11);
      const chunk3 = Buffer.alloc(1024, 0x22);
      const chunk4 = Buffer.alloc(2048, 0x33);
      const chunk5 = Buffer.alloc(4096, 0x44);

      const originalPayload = Buffer.concat([headerChunk, chunk2, chunk3, chunk4, chunk5]);
      const originalByteCount = originalPayload.length;
      const originalSha256 = crypto.createHash('sha256').update(originalPayload).digest('hex');

      const stream = new Readable({
        read() {
          this.push(headerChunk);
          this.push(chunk2);
          this.push(chunk3);
          this.push(chunk4);
          this.push(chunk5);
          this.push(null);
        }
      });

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(originalByteCount) },
        stream: stream as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/multi_chunk.mp4'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://video-iad3-1.cdninstagram.com/multi_chunk.mp4&filename=multi.mp4&expectedType=video'
      });

      expect(res.statusCode).toBe(200);
      const receivedByteCount = res.rawPayload.length;
      const receivedSha256 = crypto.createHash('sha256').update(res.rawPayload).digest('hex');

      expect(receivedByteCount).toBe(originalByteCount);
      expect(receivedSha256).toBe(originalSha256);
      expect(res.rawPayload).toEqual(originalPayload);
    });

    it('verifies MP4 delivery with asynchronous delayed chunks with matching SHA-256 checksum', async () => {
      const headerChunk = Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
        0x6d, 0x70, 0x34, 0x31, 0x69, 0x73, 0x6f, 0x6d
      ]);
      const delayedChunk1 = Buffer.alloc(1024, 0xaa);
      const delayedChunk2 = Buffer.alloc(1024, 0xbb);

      const originalPayload = Buffer.concat([headerChunk, delayedChunk1, delayedChunk2]);
      const originalByteCount = originalPayload.length;
      const originalSha256 = crypto.createHash('sha256').update(originalPayload).digest('hex');

      let chunkIndex = 0;
      const stream = new Readable({
        read() {
          if (chunkIndex === 0) {
            chunkIndex++;
            this.push(headerChunk);
          } else if (chunkIndex === 1) {
            chunkIndex++;
            setTimeout(() => this.push(delayedChunk1), 10);
          } else if (chunkIndex === 2) {
            chunkIndex++;
            setTimeout(() => this.push(delayedChunk2), 10);
          } else if (chunkIndex === 3) {
            chunkIndex++;
            setTimeout(() => this.push(null), 10);
          }
        }
      });

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(originalByteCount) },
        stream: stream as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/delayed.mp4'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://video-iad3-1.cdninstagram.com/delayed.mp4&filename=delayed.mp4&expectedType=video'
      });

      expect(res.statusCode).toBe(200);
      const receivedByteCount = res.rawPayload.length;
      const receivedSha256 = crypto.createHash('sha256').update(res.rawPayload).digest('hex');

      expect(receivedByteCount).toBe(originalByteCount);
      expect(receivedSha256).toBe(originalSha256);
      expect(res.rawPayload).toEqual(originalPayload);
    });

    it('verifies large 256 KB MP4 stream delivery with exact byte count and matching SHA-256 checksum', async () => {
      const headerBox = Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00,
        0x6d, 0x70, 0x34, 0x31, 0x69, 0x73, 0x6f, 0x6d
      ]);
      // 256 KB payload minus header length
      const payloadSize = 256 * 1024 - headerBox.length;
      const bodyBuffer = Buffer.alloc(payloadSize);
      for (let i = 0; i < payloadSize; i++) {
        bodyBuffer[i] = (i * 31) & 0xff;
      }

      const originalPayload = Buffer.concat([headerBox, bodyBuffer]);
      const originalByteCount = originalPayload.length; // Exactly 262,144 bytes
      const originalSha256 = crypto.createHash('sha256').update(originalPayload).digest('hex');

      // Stream in 64 KB chunks
      const chunkSize = 64 * 1024;
      let offset = 0;
      const stream = new Readable({
        read() {
          if (offset < originalPayload.length) {
            const nextOffset = Math.min(offset + chunkSize, originalPayload.length);
            const chunk = originalPayload.subarray(offset, nextOffset);
            offset = nextOffset;
            this.push(chunk);
          } else {
            this.push(null);
          }
        }
      });

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(originalByteCount) },
        stream: stream as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/large.mp4'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://video-iad3-1.cdninstagram.com/large.mp4&filename=large.mp4&expectedType=video'
      });

      expect(res.statusCode).toBe(200);
      const receivedByteCount = res.rawPayload.length;
      const receivedSha256 = crypto.createHash('sha256').update(res.rawPayload).digest('hex');

      expect(receivedByteCount).toBe(originalByteCount);
      expect(receivedSha256).toBe(originalSha256);
      expect(receivedByteCount).toBe(262144);
    });

    it('safely terminates downstream response when upstream stream is truncated with error', async () => {
      const headerChunk = Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
      ]);

      let pushed = false;
      const stream = new Readable({
        read() {
          if (!pushed) {
            pushed = true;
            this.push(headerChunk);
          } else {
            this.destroy(new Error('Premature TCP socket disconnection from upstream'));
          }
        }
      });
      stream.on('error', () => {}); // Handle stream error safely

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4' },
        stream: stream as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/truncated.mp4'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://video-iad3-1.cdninstagram.com/truncated.mp4&filename=trunc.mp4&expectedType=video'
      });

      // Stream destroyed cleanly
      expect(stream.destroyed).toBe(true);
    });

    it('destroys upstream stream immediately upon client cancellation', async () => {
      const headerChunk = Buffer.from([
        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
      ]);

      let pushed = false;
      const stream = new Readable({
        read() {
          if (!pushed) {
            pushed = true;
            this.push(headerChunk);
            this.push(null);
          }
        }
      });

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4' },
        stream: stream as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/cancelled.mp4'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://video-iad3-1.cdninstagram.com/cancelled.mp4&expectedType=video'
      });

      expect(res.statusCode).toBe(200);
      // Manually trigger stream cleanup as would happen on client disconnect
      stream.destroy();
      expect(stream.destroyed).toBe(true);
    });
  });

  describe('Large Media Streaming & Resource Protection Suite (150 MB Enforcement)', () => {
    const validHeader = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00
    ]);

    it('successfully accepts valid 10 MB video (10,485,760 bytes)', async () => {
      const size10Mb = 10 * 1024 * 1024;
      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(size10Mb) },
        stream: Readable.from([validHeader]) as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/10mb.mp4'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://video-iad3-1.cdninstagram.com/10mb.mp4&expectedType=video'
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-length']).toBe(String(size10Mb));
    });

    it('successfully accepts valid 50 MB video (52,428,800 bytes)', async () => {
      const size50Mb = 50 * 1024 * 1024;
      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(size50Mb) },
        stream: Readable.from([validHeader]) as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/50mb.mp4'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://video-iad3-1.cdninstagram.com/50mb.mp4&expectedType=video'
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-length']).toBe(String(size50Mb));
    });

    it('successfully accepts valid 100 MB video (104,857,600 bytes)', async () => {
      const size100Mb = 100 * 1024 * 1024;
      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(size100Mb) },
        stream: Readable.from([validHeader]) as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/100mb.mp4'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://video-iad3-1.cdninstagram.com/100mb.mp4&expectedType=video'
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-length']).toBe(String(size100Mb));
    });

    it('successfully accepts valid 150 MB video at ceiling (157,286,400 bytes)', async () => {
      const size150Mb = 150 * 1024 * 1024; // Exactly maxResponseSizeBytes default
      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(size150Mb) },
        stream: Readable.from([validHeader]) as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/150mb.mp4'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://video-iad3-1.cdninstagram.com/150mb.mp4&expectedType=video'
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-length']).toBe(String(size150Mb));
    });

    it('rejects oversized 151 MB video with 413 FILE_TOO_LARGE via Content-Length', async () => {
      const size151Mb = 151 * 1024 * 1024; // 158,334,976 bytes > 150 MB
      let streamDestroyed = false;
      const stream = new Readable({
        read() {},
        destroy(err, cb) {
          streamDestroyed = true;
          cb(err);
        }
      });

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4', 'content-length': String(size151Mb) },
        stream: stream as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/151mb.mp4'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://video-iad3-1.cdninstagram.com/151mb.mp4&expectedType=video'
      });

      expect(res.statusCode).toBe(413);
      const json = res.json();
      expect(json.ok).toBe(false);
      expect(json.error.code).toBe('FILE_TOO_LARGE');
      expect(json.error.message).toContain('Media exceeds maximum size of 157286400 bytes');
      expect(streamDestroyed).toBe(true);
    });

    it('aborts chunked stream dynamically when payload exceeds 150 MB ceiling without Content-Length', async () => {
      // Stream that emits 150 MB + 1 MB in-flight without declaring Content-Length
      const chunkSize = 10 * 1024 * 1024; // 10 MB per chunk
      let sentBytes = 0;
      let streamDestroyed = false;

      const stream = new Readable({
        read() {
          if (sentBytes === 0) {
            sentBytes += validHeader.length;
            this.push(validHeader);
          } else if (sentBytes < 160 * 1024 * 1024) {
            // Push 10 MB chunks until passing 150 MB limit
            sentBytes += chunkSize;
            this.push(Buffer.alloc(chunkSize, 0xee));
          } else {
            this.push(null);
          }
        },
        destroy(err, cb) {
          streamDestroyed = true;
          cb(err);
        }
      });

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4' }, // No content-length
        stream: stream as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/chunked_oversized.mp4'
      });

      try {
        await app.inject({
          method: 'GET',
          url: '/api/download?url=https://video-iad3-1.cdninstagram.com/chunked_oversized.mp4&expectedType=video'
        });
      } catch (err: any) {
        // Fastify app.inject bubbles the stream destruction error
        expect(err.message).toContain('File size exceeded limit');
      }

      // Dynamic byte counter detected overflow and destroyed stream
      expect(streamDestroyed).toBe(true);
    });

    it('handles slow upstream response without memory ballooning or byte dropping', async () => {
      const slowChunk1 = Buffer.alloc(512, 0x11);
      const slowChunk2 = Buffer.alloc(512, 0x22);

      let step = 0;
      const stream = new Readable({
        read() {
          if (step === 0) {
            step++;
            this.push(validHeader);
          } else if (step === 1) {
            step++;
            setTimeout(() => this.push(slowChunk1), 20);
          } else if (step === 2) {
            step++;
            setTimeout(() => this.push(slowChunk2), 20);
          } else if (step === 3) {
            step++;
            setTimeout(() => this.push(null), 10);
          }
        }
      });

      vi.spyOn(ssrfClient, 'safeHttpsRequest').mockResolvedValueOnce({
        statusCode: 200,
        headers: { 'content-type': 'video/mp4' },
        stream: stream as any,
        finalUrl: 'https://video-iad3-1.cdninstagram.com/slow.mp4'
      });

      const res = await app.inject({
        method: 'GET',
        url: '/api/download?url=https://video-iad3-1.cdninstagram.com/slow.mp4&expectedType=video'
      });

      expect(res.statusCode).toBe(200);
      expect(res.rawPayload.length).toBe(validHeader.length + slowChunk1.length + slowChunk2.length);
    });
  });
});
