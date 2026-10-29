import React from 'react';
import { QueueJob } from '../types/queue.js';
import { useQueue } from '../context/QueueContext.js';
import { MediaGallery } from './MediaGallery.js';

interface JobItemProps {
  job: QueueJob;
}

export const JobItem: React.FC<JobItemProps> = ({ job }) => {
  const { retryJob, removeJob } = useQueue();

  const getStatusBadge = () => {
    switch (job.status) {
      case 'queued':
        return (
          <span
            style={{
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: 'rgba(245, 158, 11, 0.15)',
              color: 'var(--status-queued)',
              border: '1px solid rgba(245, 158, 11, 0.3)'
            }}
          >
            Queued
          </span>
        );
      case 'fetching':
      case 'validating':
        return (
          <span
            style={{
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: 'rgba(6, 182, 212, 0.15)',
              color: 'var(--status-fetching)',
              border: '1px solid rgba(6, 182, 212, 0.3)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
          >
            <span className="animate-spin" style={{ display: 'inline-block' }}>⚙️</span>
            Resolving
          </span>
        );
      case 'preview_ready':
        return (
          <span
            style={{
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#a5b4fc',
              border: '1px solid rgba(99, 102, 241, 0.3)'
            }}
          >
            👁️ Preview Available
          </span>
        );
      case 'ready':
        return (
          <span
            style={{
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: 'rgba(16, 185, 129, 0.15)',
              color: 'var(--status-ready)',
              border: '1px solid rgba(16, 185, 129, 0.3)'
            }}
          >
            ✓ Ready
          </span>
        );
      case 'failed':
        return (
          <span
            style={{
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              background: 'rgba(244, 63, 94, 0.15)',
              color: 'var(--status-failed)',
              border: '1px solid rgba(244, 63, 94, 0.3)'
            }}
          >
            Failed
          </span>
        );
    }
  };

  const getProviderBadge = () => {
    if (!job.provider) return null;
    let badgeText = job.provider;
    let badgeColor = '#94a3b8';
    let badgeBg = 'rgba(148, 163, 184, 0.1)';

    if (job.provider === 'MockProvider' || job.provider === 'mock') {
      badgeText = '🧪 Demo Fixture';
      badgeColor = '#38bdf8';
      badgeBg = 'rgba(56, 189, 248, 0.12)';
    } else if (job.provider === 'InstagramOEmbedProvider' || job.provider === 'oembed') {
      badgeText = '🛡️ Meta oEmbed';
      badgeColor = '#c084fc';
      badgeBg = 'rgba(192, 132, 252, 0.12)';
    } else if (job.provider === 'DirectMediaUrlProvider' || job.provider === 'direct') {
      badgeText = '⚡ Direct CDN';
      badgeColor = '#34d399';
      badgeBg = 'rgba(52, 211, 153, 0.12)';
    } else if (job.provider === 'AuthorizedAccountMediaProvider' || job.provider === 'authorized') {
      badgeText = '🔑 Meta Graph API';
      badgeColor = '#fbbf24';
      badgeBg = 'rgba(251, 191, 36, 0.12)';
    } else if (job.provider === 'PublicWebMediaProvider' || job.provider === 'public') {
      badgeText = '🌐 Public Web';
      badgeColor = '#38bdf8';
      badgeBg = 'rgba(56, 189, 248, 0.12)';
    }

    return (
      <span
        style={{
          fontSize: '0.72rem',
          fontWeight: 600,
          color: badgeColor,
          background: badgeBg,
          padding: '0.15rem 0.45rem',
          borderRadius: '4px',
          border: `1px solid ${badgeColor}33`
        }}
      >
        {badgeText}
      </span>
    );
  };

  const getMediaKindLabel = () => {
    if (job.mediaType === 'direct_media') return '🔗 Direct CDN';
    if (job.mediaType === 'reel') return '🎬 Reel';
    if (job.mediaType === 'tv') return '📺 IGTV';
    return '📷 Post';
  };

  return (
    <div
      className="glass-panel"
      style={{
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
        transition: 'var(--transition)'
      }}
    >
      {/* Compact Source Post Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.65rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
          {getStatusBadge()}
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: 'var(--text-secondary)',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '0.15rem 0.45rem',
              borderRadius: '4px'
            }}
          >
            {getMediaKindLabel()}
          </span>
          {getProviderBadge()}

          <a
            href={job.normalizedUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: '0.84rem',
              fontFamily: 'monospace',
              color: 'var(--text-main)',
              fontWeight: 600,
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'rgba(255, 255, 255, 0.04)',
              padding: '0.2rem 0.55rem',
              borderRadius: '5px',
              border: '1px solid var(--border-subtle)',
              transition: 'var(--transition)'
            }}
            title="Open original post on Instagram"
          >
            <span>{job.shortcode}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-cyan)' }}>↗</span>
          </a>

          {job.author && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
              @{job.author}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          {job.status === 'failed' && (
            <button
              type="button"
              onClick={() => retryJob(job.id)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}
            >
              🔄 Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => removeJob(job.id)}
            className="btn btn-outline-danger btn-sm"
            style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}
            title="Remove from queue"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Error state display with classified actionable guidance */}
      {job.status === 'failed' && job.error && (
        <div
          style={{
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(244, 63, 94, 0.08)',
            border: '1px solid rgba(244, 63, 94, 0.25)',
            color: '#fb7185',
            fontSize: '0.82rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontWeight: 700 }}>⚠️ {job.error.code}:</span>
            <span>{job.error.message}</span>
          </div>

          {job.error.code === 'PROVIDER_NOT_CONFIGURED' && (
            <div style={{ fontSize: '0.76rem', color: '#fda4af', marginTop: '0.2rem', lineHeight: 1.4 }}>
              💡 <strong>Configuration Missing:</strong> Supply <code>INSTAGRAM_APP_ID</code> and <code>INSTAGRAM_CLIENT_TOKEN</code> in your backend <code>.env</code> file for live previews, or switch to Demo Mode.
            </div>
          )}

          {(job.error.code === 'AUTHENTICATION_REQUIRED' || job.error.code === 'AUTHENTICATION_ERROR') && (
            <div style={{ fontSize: '0.76rem', color: '#fef08a', marginTop: '0.2rem', lineHeight: 1.4 }}>
              🔑 <strong>Authentication Required:</strong> Meta Graph API requires an OAuth 2.0 User Access Token with <code>instagram_basic</code> scope for an Instagram Professional (Creator or Business) account.
            </div>
          )}

          {job.error.code === 'CONTENT_UNAVAILABLE' && (
            <div style={{ fontSize: '0.76rem', color: '#e2e8f0', marginTop: '0.2rem', lineHeight: 1.4 }}>
              ℹ️ <strong>Scope Limitation:</strong> Meta Graph API only permits downloading media owned or managed by the authenticated account. Arbitrary third-party posts cannot be downloaded via Graph API.
            </div>
          )}

          {(job.error.code === 'CONTENT_PRIVATE' || job.error.code === 'PRIVATE_ACCOUNT') && (
            <div style={{ fontSize: '0.76rem', color: '#fed7aa', marginTop: '0.2rem', lineHeight: 1.4 }}>
              🔒 <strong>Private Post:</strong> This Instagram post or account is private, or embedding has been disabled by the creator. Private content cannot be retrieved without authorization.
            </div>
          )}

          {(job.error.code === 'UNSUPPORTED_URL' || job.error.code === 'INVALID_URL') && (
            <div style={{ fontSize: '0.76rem', color: '#cbd5e1', marginTop: '0.2rem', lineHeight: 1.4 }}>
              🔍 <strong>Format Guidance:</strong> Snapora supports standard Instagram post (<code>/p/...</code>), Reel (<code>/reel/...</code>), and verified Meta CDN URLs. Profiles and stories are unsupported.
            </div>
          )}

          {job.error.code === 'MEDIA_VALIDATION_FAILED' && (
            <div style={{ fontSize: '0.76rem', color: '#fda4af', marginTop: '0.2rem', lineHeight: 1.4 }}>
              🛡️ <strong>Integrity Guard:</strong> The retrieved binary payload did not match genuine JPEG, MP4, or WebP file signatures, or was truncated.
            </div>
          )}

          {job.error.code === 'HTTP_429_RATE_LIMITED' && (
            <div style={{ fontSize: '0.76rem', color: '#fef08a', marginTop: '0.2rem', lineHeight: 1.4 }}>
              ⏳ <strong>Upstream Rate Limited:</strong> Instagram web server temporarily limited requests from this IP. Please wait a moment before retrying.
            </div>
          )}

          {job.error.code === 'HTTP_403_FORBIDDEN' && (
            <div style={{ fontSize: '0.76rem', color: '#fed7aa', marginTop: '0.2rem', lineHeight: 1.4 }}>
              🚫 <strong>Access Restricted:</strong> Instagram returned HTTP 403 Forbidden. The post may require a logged-in session or age-verification on Instagram.
            </div>
          )}

          {job.error.code === 'POST_NOT_FOUND' && (
            <div style={{ fontSize: '0.76rem', color: '#cbd5e1', marginTop: '0.2rem', lineHeight: 1.4 }}>
              🔍 <strong>Post Unavailable:</strong> The requested post or reel could not be found. It may have been deleted, archived, or is inaccessible.
            </div>
          )}

          {job.error.code === 'LOGIN_WALL_ENCOUNTERED' && (
            <div style={{ fontSize: '0.76rem', color: '#fed7aa', marginTop: '0.2rem', lineHeight: 1.4 }}>
              🔒 <strong>Login Wall:</strong> Instagram redirected this request to its login page. Public anonymous access is currently restricted for this URL.
            </div>
          )}
        </div>
      )}

      {/* Live Preview Mode Display (oEmbed Embed / Thumbnail Preview) */}
      {job.status === 'preview_ready' && (
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.9rem',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(99, 102, 241, 0.05)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}
        >
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            {job.preview?.thumbnailUrl && (
              <img
                src={job.preview.thumbnailUrl}
                alt={job.title || 'Preview'}
                style={{
                  width: '72px',
                  height: '72px',
                  objectFit: 'cover',
                  borderRadius: '6px',
                  border: '1px solid var(--border-subtle)'
                }}
              />
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)' }}>
                {job.title || 'Official Instagram Preview'}
              </span>
              {job.author && (
                <span style={{ fontSize: '0.78rem', color: '#a5b4fc' }}>
                  By @{job.author}
                </span>
              )}
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Provider: {job.provider || 'Official Instagram oEmbed'}
              </span>
            </div>
          </div>

          <div
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '4px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)'
            }}
          >
            🛡️ <strong>Official Live Preview Notice:</strong> {job.disclaimer || 'Meta public oEmbed API supplies embed and thumbnail metadata, but does not provide direct downloadable video or raw media files.'}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <a
              href={job.normalizedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', textDecoration: 'none' }}
            >
              View on Instagram ↗
            </a>
          </div>
        </div>
      )}

      {/* Resolved Media Gallery (Carousel & Single Media Cards) */}
      {(job.status === 'ready' || job.status === 'preview_ready') && (
        <MediaGallery job={job} />
      )}
    </div>
  );
};
