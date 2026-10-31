export interface MediaValidationResult {
  valid: boolean;
  detectedType?: 'image/jpeg' | 'video/mp4' | 'image/webp' | 'unknown';
  error?: string;
}

/**
 * Validates initial chunk of media bytes to confirm authentic file signatures
 * and prevent HTML error pages or scripts from being marked as valid media.
 */
export function validateMediaBytes(headerChunk: Uint8Array | Buffer): MediaValidationResult {
  if (!headerChunk || headerChunk.length < 12) {
    return {
      valid: false,
      error: 'Header chunk too short to determine file signature (expected at least 12 bytes)'
    };
  }

  const bytes = headerChunk instanceof Buffer ? headerChunk : Buffer.from(headerChunk);

  // 1. Check for HTML / XML / JSON text disguised as media
  const prefixText = bytes.subarray(0, 64).toString('utf8').trim().toLowerCase();
  if (
    prefixText.startsWith('<!doctype html') ||
    prefixText.startsWith('<html') ||
    prefixText.startsWith('<?xml') ||
    prefixText.startsWith('{') ||
    prefixText.includes('<script')
  ) {
    return {
      valid: false,
      error: 'Received HTML/text/JSON response instead of binary media'
    };
  }

  // 2. Check JPEG: SOI marker 0xFF 0xD8 0xFF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return {
      valid: true,
      detectedType: 'image/jpeg'
    };
  }

  // 3. Check MP4 (ISO Base Media File Format / QuickTime / WebM):
  // Box header: [4-byte big-endian length][4-byte ASCII type]
  let isIsoBmffVideo = false;

  if (bytes.length >= 8) {
    const box1Type = bytes.subarray(4, 8).toString('latin1');
    const box1Size = bytes.readUInt32BE(0);

    // Direct 'ftyp' box at offset 0..7
    if (box1Type === 'ftyp' && (box1Size >= 8 || box1Size === 0 || box1Size === 1)) {
      isIsoBmffVideo = true;
    }
    // Box preceded by 'wide' or 'free' atom (common in camera-captured MP4s)
    else if ((box1Type === 'wide' || box1Type === 'free') && box1Size >= 8 && box1Size + 8 <= bytes.length) {
      const box2Type = bytes.subarray(box1Size + 4, box1Size + 8).toString('latin1');
      if (box2Type === 'ftyp') {
        isIsoBmffVideo = true;
      }
    }
    // QuickTime movie/mdat atom: size + 'moov' or 'mdat'
    else if ((box1Type === 'moov' || box1Type === 'mdat') && box1Size >= 8) {
      isIsoBmffVideo = true;
    }
  }

  // WebM / Matroska: EBML header 0x1A 0x45 0xDF 0xA3 strictly at offset 0
  const isWebm =
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3;

  if (isIsoBmffVideo || isWebm) {
    return {
      valid: true,
      detectedType: 'video/mp4'
    };
  }

  // 4. Check WebP: RIFF at 0..3 and WEBP at 8..11
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return {
      valid: true,
      detectedType: 'image/webp'
    };
  }

  return {
    valid: false,
    detectedType: 'unknown',
    error: 'Unrecognized binary signature (expected JPEG SOI, MP4 ftyp box, or WebP header)'
  };
}
