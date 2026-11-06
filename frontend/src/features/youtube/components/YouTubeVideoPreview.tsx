import React, { useState } from 'react';
import { YouTubeResolvedData } from '../types.js';

interface YouTubeVideoPreviewProps {
  data: YouTubeResolvedData;
}

export const YouTubeVideoPreview: React.FC<YouTubeVideoPreviewProps> = ({ data }) => {
  const [embedLoadFailed, setEmbedLoadFailed] = useState(false);

  // Validate embed URL strictly adheres to privacy-enhanced nocookie host
  const safeEmbedUrl = React.useMemo(() => {
    if (!data.embedUrl) return null;
    try {
      const parsed = new URL(data.embedUrl);
      if (
        parsed.protocol === 'https:' &&
        parsed.hostname === 'www.youtube-nocookie.com' &&
        parsed.pathname.startsWith('/embed/')
      ) {
        return data.embedUrl;
      }
      return null;
    } catch {
      return null;
    }
  }, [data.embedUrl]);

  const { embedStatus, canonicalUrl, title, videoId } = data;

  return (
    <div
      className="glass-panel"
      style={{
        padding: '1.5rem',
        marginBottom: '2rem',
        borderRadius: 'var(--radius-md)'
      }}
      data-testid="youtube-video-preview"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
          Video Preview
        </h3>
        {/* Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {embedStatus === 'allowed' && (
            <span
              style={{
                fontSize: '0.78rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--status-ready)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                fontWeight: 600
              }}
            >
              ✓ Embedding Allowed
            </span>
          )}
          {embedStatus === 'disabled' && (
            <span
              style={{
                fontSize: '0.78rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                background: 'rgba(244, 63, 94, 0.15)',
                color: 'var(--status-failed)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                fontWeight: 600
              }}
            >
              ✕ Embedding Disabled by Creator
            </span>
          )}
          {embedStatus === 'unknown' && (
            <span
              style={{
                fontSize: '0.78rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '12px',
                background: 'rgba(245, 158, 11, 0.15)',
                color: 'var(--status-queued)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                fontWeight: 600
              }}
            >
              ⚠️ Embedding Permission Unconfirmed
            </span>
          )}
        </div>
      </div>

      {/* 1. Disabled Embedding State: strictly NO iframe rendered */}
      {embedStatus === 'disabled' && (
        <div
          style={{
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            background: 'rgba(0, 0, 0, 0.25)',
            borderRadius: 'var(--radius-sm)',
            border: '1px dashed var(--border-subtle)'
          }}
          data-testid="embed-disabled-notice"
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }} role="img" aria-label="Restricted">
            🔒
          </div>
          <h4 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: 'var(--text-main)' }}>
            Embedding Disabled for this Video
          </h4>
          <p
            style={{
              fontSize: '0.9rem',
              color: 'var(--text-secondary)',
              maxWidth: '520px',
              margin: '0 auto 1.5rem',
              lineHeight: 1.5
            }}
          >
            The video creator or owner has restricted embedded playback outside of YouTube. You can view the video directly on YouTube.
          </p>
          <a
            href={canonicalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
            style={{ textDecoration: 'none' }}
          >
            Watch Video on YouTube ↗
          </a>
        </div>
      )}

      {/* 2. Unknown Embedding State: embed attempt with explicit disclaimer */}
      {embedStatus === 'unknown' && (
        <div style={{ marginBottom: '1rem' }}>
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              color: 'var(--text-main)',
              fontSize: '0.86rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}
            role="note"
          >
            <div>
              <strong>Notice:</strong> YouTube embedding permission has not been confirmed for this video. An embed attempt is displayed below.
            </div>
            <a
              href={canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ fontSize: '0.78rem', padding: '0.3rem 0.6rem', textDecoration: 'none' }}
            >
              Open on YouTube ↗
            </a>
          </div>

          {safeEmbedUrl && !embedLoadFailed ? (
            <div
              style={{
                position: 'relative',
                paddingBottom: '56.25%', // 16:9 aspect ratio
                height: 0,
                overflow: 'hidden',
                borderRadius: 'var(--radius-sm)',
                background: '#000000'
              }}
            >
              <iframe
                src={safeEmbedUrl}
                title={title || `YouTube Video ${videoId}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  border: 0
                }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                sandbox="allow-scripts allow-same-origin allow-presentation"
                referrerPolicy="strict-origin-when-cross-origin"
                onError={() => setEmbedLoadFailed(true)}
              />
            </div>
          ) : (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Embedded player could not be loaded.
              </p>
              <a
                href={canonicalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Watch on YouTube ↗
              </a>
            </div>
          )}
        </div>
      )}

      {/* 3. Allowed Embedding State: normal full preview */}
      {embedStatus === 'allowed' && safeEmbedUrl && (
        <div
          style={{
            position: 'relative',
            paddingBottom: '56.25%', // 16:9 aspect ratio
            height: 0,
            overflow: 'hidden',
            borderRadius: 'var(--radius-sm)',
            background: '#000000'
          }}
        >
          <iframe
            src={safeEmbedUrl}
            title={title || `YouTube Video ${videoId}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              border: 0
            }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}

      {/* Player footer compliance note */}
      <div
        style={{
          marginTop: '0.75rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}
      >
        <span>
          Privacy-enhanced player via <code style={{ color: 'var(--text-secondary)' }}>youtube-nocookie.com</code>
        </span>
        <a
          href={canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }}
        >
          Open canonical watch URL ↗
        </a>
      </div>
    </div>
  );
};
