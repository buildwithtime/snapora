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

  // 3. Check MP4 (ISO Base Media File Format):
  // Offset 4..7 must be 'ftyp' (0x66 0x74 0x79 0x70)
  if (
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    const brand = bytes.subarray(8, 12).toString('ascii');
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
