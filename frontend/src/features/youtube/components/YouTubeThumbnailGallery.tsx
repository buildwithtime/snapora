import React, { useState } from 'react';
import { YouTubeThumbnailItem } from '../types.js';

interface YouTubeThumbnailGalleryProps {
  thumbnails: YouTubeThumbnailItem[];
  title?: string;
}

const APPROVED_THUMBNAIL_HOSTS = new Set([
  'i.ytimg.com',
  'img.youtube.com'
]);

function isApprovedThumbnailUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'https:' && APPROVED_THUMBNAIL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export const YouTubeThumbnailGallery: React.FC<YouTubeThumbnailGalleryProps> = ({
  thumbnails = [],
  title
}) => {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});

  const handleImageError = (resKey: string) => {
    setFailedImages((prev) => ({ ...prev, [resKey]: true }));
  };

  const handleImageLoad = (resKey: string) => {
    setLoadedImages((prev) => ({ ...prev, [resKey]: true }));
  };

  // Filter thumbnails strictly to approved hosts
  const validThumbnails = thumbnails.filter((t) => isApprovedThumbnailUrl(t.url));

  if (validThumbnails.length === 0) {
    return (
      <div
        className="glass-panel"
        style={{
          padding: '1.75rem',
          marginBottom: '2rem',
          borderRadius: 'var(--radius-md)',
          textAlign: 'center'
        }}
        data-testid="youtube-thumbnail-gallery"
      >
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
          Discovered Thumbnails
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          No approved thumbnail variants are currently available for this video.
        </p>
      </div>
    );
  }

  return (
    <div
      className="glass-panel"
      style={{
        padding: '1.75rem',
        marginBottom: '2rem',
        borderRadius: 'var(--radius-md)'
      }}
      data-testid="youtube-thumbnail-gallery"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
            Discovered Thumbnails
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
            Available multi-resolution variants from approved YouTube CDN hosts
          </p>
        </div>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '0.2rem 0.5rem',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)'
          }}
        >
          {validThumbnails.length} {validThumbnails.length === 1 ? 'Variant' : 'Variants'}
        </span>
      </div>

      {/* Grid of Thumbnails */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '1.25rem'
        }}
      >
        {validThumbnails.map((thumb) => {
          const resKey = thumb.resolution;
          const isFailed = failedImages[resKey];
          const isLoaded = loadedImages[resKey];
          const isVerified = thumb.verified === true;

          return (
            <div
              key={resKey}
              style={{
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-subtle)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}
              data-testid={`thumbnail-card-${resKey}`}
            >
              {/* Image Preview Container */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  paddingBottom: '56.25%', // 16:9 aspect ratio
                  background: 'var(--bg-input)',
                  overflow: 'hidden'
                }}
              >
                {!isLoaded && !isFailed && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '0.8rem'
                    }}
                  >
                    Loading image...
                  </div>
                )}

                {isFailed ? (
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      padding: '1rem',
                      textAlign: 'center',
                      fontSize: '0.8rem'
                    }}
                  >
                    <span style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🖼️</span>
                    <span>Variant not available on CDN</span>
                  </div>
                ) : (
                  <img
                    src={thumb.url}
                    alt={`${title || 'YouTube'} - ${resKey} thumbnail`}
                    loading="lazy"
                    onLoad={() => handleImageLoad(resKey)}
                    onError={() => handleImageError(resKey)}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      opacity: isLoaded ? 1 : 0,
                      transition: 'opacity 0.2s ease-in'
                    }}
                  />
                )}

                {/* Resolution Badge Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    background: 'rgba(0, 0, 0, 0.75)',
                    backdropFilter: 'blur(4px)',
                    color: '#ffffff',
                    fontSize: '0.7rem',
                    fontFamily: 'monospace',
                    fontWeight: 600
                  }}
                >
                  {resKey}
                </div>

                {/* Verification Badge Overlay */}
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    background: isVerified ? 'rgba(16, 185, 129, 0.85)' : 'rgba(100, 116, 139, 0.75)',
                    backdropFilter: 'blur(4px)',
                    color: '#ffffff',
                    fontSize: '0.68rem',
                    fontWeight: 600
                  }}
                  title={isVerified ? 'Binary headers verified by server' : 'Discovered via metadata (unverified binary)'}
                >
                  {isVerified ? '✓ Verified' : 'Discovered'}
                </div>
              </div>

              {/* Card Footer Details */}
              <div
                style={{
                  padding: '0.75rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.78rem'
                }}
              >
                <div style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                  {thumb.width && thumb.height ? `${thumb.width} × ${thumb.height}` : resKey}
                </div>
                {!isFailed && (
                  <a
                    href={thumb.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--accent-cyan)',
                      textDecoration: 'none',
                      fontWeight: 600,
                      fontSize: '0.76rem'
                    }}
                  >
                    View Original ↗
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Compliance Notice */}
      <div
        style={{
          marginTop: '1.25rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}
      >
        <span>
          Direct thumbnail preview from official YouTube CDN. Automated stream extraction and bulk ZIP exports are prohibited.
        </span>
      </div>
    </div>
  );
};
