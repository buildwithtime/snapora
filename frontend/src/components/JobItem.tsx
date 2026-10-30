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

      {/* Error state display with user-friendly actionable guidance */}
      {job.status === 'failed' && job.error && (() => {
        const getFriendlyError = (err: { code: string; message: string }) => {
          switch (err.code) {
            case 'UNSUPPORTED_URL':
            case 'INVALID_URL':
              return {
                title: 'Invalid Instagram Link',
                detail: 'Please enter a valid public Instagram post, Reel, or carousel URL.'
              };
            case 'UNSUPPORTED_CONTENT':
              return {
                title: 'Unsupported Content',
                detail: "This type of Instagram content isn't supported yet."
              };
            case 'HTTP_429_RATE_LIMITED':
            case 'RATE_LIMITED':
              return {
                title: 'Temporarily Rate Limited',
                detail: err.message || 'Instagram is temporarily limiting requests. Please try again later.'
              };
            case 'TIMEOUT':
              return {
                title: 'Request Timed Out',
                detail: 'The request took too long. You can try again.'
              };
            case 'CONTENT_UNAVAILABLE':
            case 'NO_MEDIA':
              return {
                title: 'No Downloadable Media Found',
                detail: "We couldn't find downloadable media for this post."
              };
            case 'MALFORMED_RESPONSE':
            case 'INCOMPLETE_RESPONSE':
              return {
                title: 'Incomplete Response',
                detail: 'We received an incomplete response. Please try again.'
              };
            case 'NETWORK_ERROR':
              return {
                title: 'Connection Interrupted',
                detail: err.message?.includes('refused')
                  ? err.message
                  : 'Connection interrupted. Please check your connection and retry.'
              };
            case 'DOWNLOAD_INTERRUPTED':
              return {
                title: 'Download Interrupted',
                detail: 'The download was interrupted. Please retry.'
              };
            case 'SERVER_UNAVAILABLE':
            case 'SERVICE_UNAVAILABLE':
              return {
                title: 'Service Unavailable',
                detail: 'The upstream media service is temporarily unavailable. Please try again.'
              };
            case 'CONTENT_PRIVATE':
            case 'PRIVATE_ACCOUNT':
            case 'LOGIN_WALL_ENCOUNTERED':
            case 'HTTP_403_FORBIDDEN':
              return {
                title: 'Private or Restricted Post',
                detail: 'This post belongs to a private account or requires an Instagram login.'
              };
            case 'MEDIA_VALIDATION_FAILED':
              return {
                title: 'Media Verification Failed',
                detail: 'The retrieved data could not be verified as a valid image or video file.'
              };
            case 'PROVIDER_NOT_CONFIGURED':
              return {
                title: 'Preview Service Unavailable',
                detail: 'The upstream preview provider is not configured.'
              };
            case 'AUTHENTICATION_REQUIRED':
            case 'AUTHENTICATION_ERROR':
              return {
                title: 'Account Authorization Required',
                detail: 'Access to this content requires authorized account permissions.'
              };
            case 'POST_NOT_FOUND':
              return {
                title: 'Post Not Found',
                detail: 'The requested post or Reel could not be found. It may have been deleted or archived.'
              };
            default:
              return {
                title: 'Unable to Resolve Media',
                detail: err.message || 'An unexpected error occurred while resolving this link.'
              };
          }
        };

        const friendly = getFriendlyError(job.error);

        return (
          <div
            role="alert"
            style={{
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              color: '#fb7185',
              fontSize: '0.82rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span style={{ fontWeight: 700, color: '#fda4af' }}>⚠️ {friendly.title}</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: '#fecdd3', lineHeight: 1.4 }}>
              {friendly.detail}
            </p>
            {job.error.message && job.error.message !== friendly.detail && (
              <span style={{ fontSize: '0.74rem', color: '#fda4af', opacity: 0.9 }}>
                {job.error.message}
              </span>
            )}
          </div>
        );
      })()}

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
            🛡️ <strong>Official Preview Notice:</strong> {job.disclaimer || 'Meta public oEmbed API supplies embed and thumbnail metadata, but does not provide direct downloadable video or raw media files.'}
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
