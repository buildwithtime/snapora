import { PINTEREST_PIN_ID_REGEX } from './urlParser.js';

export const APPROVED_PINTEREST_EMBED_HOST = 'assets.pinterest.com';
export const APPROVED_PINTEREST_EMBED_PATH = '/ext/embed.html';

/**
 * Required HTML iframe sandbox attributes when rendering Pinterest embeds in the frontend.
 * Enforces strict origin separation while permitting interactive Pin execution.
 */
export const PINTEREST_REQUIRED_IFRAME_SANDBOX = 'allow-scripts allow-same-origin allow-popups';

export interface ValidatedPinterestEmbed {
  embedUrl: string;
  isEmbeddable: boolean;
  embeddingAllowed: boolean;
  embedStatus: 'allowed';
  requiredSandbox: string;
}

export class PinterestEmbedService {
  /**
   * Constructs the canonical privacy-enhanced standalone embed URL for a verified Pin ID.
   */
  buildEmbedUrl(pinId: string): string {
    if (!PINTEREST_PIN_ID_REGEX.test(pinId)) {
      throw new Error(`INVALID_PIN_ID: Cannot build embed URL for invalid Pin ID '${pinId}'`);
    }
    return `https://${APPROVED_PINTEREST_EMBED_HOST}${APPROVED_PINTEREST_EMBED_PATH}?id=${pinId}&src=oembed`;
  }

  /**
   * Alias for buildEmbedUrl matching Universal Media Workspace conventions.
   */
  generateEmbedUrl(pinId: string): string {
    return this.buildEmbedUrl(pinId);
  }

  /**
   * Validates an embed URL to ensure it points strictly to Pinterest's official embed frame.
   * Rejects non-HTTPS protocols, foreign hostnames, unexpected paths, and arbitrary query parameters.
   */
  validateEmbedUrl(urlStr: string, expectedPinId?: string): boolean {
    if (!urlStr || typeof urlStr !== 'string') {
      return false;
    }

    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      return false;
    }

    // 1. Enforce HTTPS only
    if (parsed.protocol !== 'https:') {
      return false;
    }

    // 2. Exact hostname check
    const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    if (hostname !== APPROVED_PINTEREST_EMBED_HOST) {
      return false;
    }

    // 3. Exact path check
    if (parsed.pathname !== APPROVED_PINTEREST_EMBED_PATH) {
      return false;
    }

    // 4. Pin ID query parameter validation
    const id = parsed.searchParams.get('id');
    if (!id || !PINTEREST_PIN_ID_REGEX.test(id)) {
      return false;
    }

    if (expectedPinId && id !== expectedPinId) {
      return false;
    }

    // 5. Query parameter allowlist (only 'id' and optional 'src=oembed' are permitted)
    for (const key of parsed.searchParams.keys()) {
      if (key !== 'id' && key !== 'src') {
        return false;
      }
    }

    const src = parsed.searchParams.get('src');
    if (src !== null && src !== 'oembed') {
      return false;
    }

    return true;
  }

  /**
   * Extracts and validates the iframe src URL from Pinterest's oEmbed HTML snippet.
   * If valid, returns the secure embed URL; otherwise falls back to buildEmbedUrl.
   */
  resolveEmbedUrl(html?: string | null, pinId?: string): ValidatedPinterestEmbed {
    if (pinId && !PINTEREST_PIN_ID_REGEX.test(pinId)) {
      throw new Error(`INVALID_PIN_ID: Invalid Pin ID '${pinId}' supplied to embed service`);
    }

    let extractedUrl: string | null = null;

    if (html && typeof html === 'string') {
      const match = html.match(/<iframe\s+[^>]*src=["']([^"']+)["']/i);
      if (match && match[1]) {
        const candidate = match[1].replace(/&amp;/g, '&');
        if (this.validateEmbedUrl(candidate, pinId)) {
          extractedUrl = candidate;
        }
      }
    }

    // If candidate extracted from HTML was valid, use it; otherwise build deterministic canonical URL
    const finalEmbedUrl = extractedUrl || (pinId ? this.buildEmbedUrl(pinId) : '');

    return {
      embedUrl: finalEmbedUrl,
      isEmbeddable: true,
      embeddingAllowed: true,
      embedStatus: 'allowed',
      requiredSandbox: PINTEREST_REQUIRED_IFRAME_SANDBOX
    };
  }
}

export const pinterestEmbedService = new PinterestEmbedService();
