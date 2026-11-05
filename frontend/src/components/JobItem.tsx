import React from 'react';
import { QueueJob } from '../types/queue.js';
import { useQueue } from '../context/QueueContext.js';
import { MediaGallery } from './MediaGallery.js';

interface JobItemProps {
  job: QueueJob;
}

export const JobItem: React.FC<JobItemProps> = ({ job }) => {
  const { state, retryJob, removeJob } = useQueue();
  const isCoolingDown = Boolean(
    state.upstreamCooldownRemaining && state.upstreamCooldownRemaining > 0
  );

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
              disabled={isCoolingDown}
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: '0.75rem',
                padding: '0.3rem 0.65rem',
                opacity: isCoolingDown ? 0.6 : 1,
                cursor: isCoolingDown ? 'not-allowed' : 'pointer'
              }}
              title={
                isCoolingDown
                  ? `Cooldown active (${state.upstreamCooldownRemaining}s remaining). Retry will be available shortly.`
                  : 'Retry this job'
              }
            >
              {isCoolingDown ? `⏳ Wait (${state.upstreamCooldownRemaining}s)` : '🔄 Retry'}
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
        interface FriendlyErrorDescriptor {
          title: string;
          detail: string;
          category: 'temporary' | 'restricted' | 'permanent' | 'transient';
          tag: string;
        }

        const getFriendlyError = (err: { code: string; message: string }): FriendlyErrorDescriptor => {
          switch (err.code) {
            case 'HTTP_429_RATE_LIMITED':
            case 'RATE_LIMITED':
            case 'UPSTREAM_RATE_LIMITED':
              return {
                title: 'Temporarily Rate Limited (Upstream Instagram)',
                detail: err.message || 'Instagram is temporarily limiting requests from this network. The queue is automatically paused and will resume when the cooldown period expires.',
                category: 'temporary',
                tag: '⏳ Temporary Rate Limit'
              };
            case 'LOCAL_RATE_LIMITED':
              return {
                title: 'Snapora Request Limit Reached',
                detail: err.message || 'Snapora application limit reached to maintain service reliability. The queue is paused and will resume automatically.',
                category: 'temporary',
                tag: '⏳ Temporary Limit'
              };
            case 'CONTENT_PRIVATE':
            case 'PRIVATE_ACCOUNT':
            case 'LOGIN_WALL_ENCOUNTERED':
            case 'HTTP_403_FORBIDDEN':
              return {
                title: 'Private or Restricted Post (Instagram Login Required)',
                detail: 'Instagram requires an authenticated login to access this post from cloud hosting networks. Open directly on Instagram or provide an authorized Meta access token in Advanced Options.',
                category: 'restricted',
                tag: '🚫 Login Required'
              };
            case 'UNSUPPORTED_RETRIEVAL_METHOD':
            case 'UNSUPPORTED_CONTENT':
              return {
                title: 'Unsupported Content Format',
                detail: "This type of Instagram content (e.g. Stories, Live broadcasts, or subscriber-only posts) cannot be resolved via public web access.",
                category: 'permanent',
                tag: '🚫 Unsupported Format'
              };
            case 'UNSUPPORTED_URL':
            case 'INVALID_URL':
              return {
                title: 'Invalid Instagram Link',
                detail: 'Please enter a valid public Instagram post, Reel, or carousel URL.',
                category: 'permanent',
                tag: '⚠️ Invalid Link'
              };
            case 'TIMEOUT':
              return {
                title: 'Request Timed Out',
                detail: 'The request took too long. You can try again.',
                category: 'transient',
                tag: '⏱️ Timed Out'
              };
            case 'CONTENT_UNAVAILABLE':
            case 'METADATA_NOT_FOUND':
            case 'NO_MEDIA':
              return {
                title: 'No Downloadable Media Found',
                detail: "We couldn't extract downloadable media metadata for this post.",
                category: 'permanent',
                tag: 'ℹ️ No Media'
              };
            case 'EXPIRED_MEDIA_URL':
            case 'MEDIA_URL_EXPIRED':
              return {
                title: 'Media URL Expired',
                detail: 'The temporary signed download link has expired. Please retry to refresh the URL.',
                category: 'transient',
                tag: '🔄 Link Expired'
              };
            case 'PAGE_FETCH_FAILED':
            case 'CDN_REQUEST_FAILED':
              return {
                title: 'Upstream Fetch Failed',
                detail: 'Unable to connect to Instagram or CDN servers. Please verify your network connection.',
                category: 'transient',
                tag: '🌐 Connection Error'
              };
            case 'STREAM_INTERRUPTED':
            case 'DOWNLOAD_INTERRUPTED':
              return {
                title: 'Download Interrupted',
                detail: 'The media stream was interrupted before completion. Please retry.',
                category: 'transient',
                tag: '⚡ Interrupted'
              };
            case 'SERVER_UNAVAILABLE':
            case 'SERVICE_UNAVAILABLE':
              return {
                title: 'Service Unavailable',
                detail: 'The upstream media service is temporarily unavailable. Please try again.',
                category: 'transient',
                tag: '⚠️ Service Down'
              };
            case 'MEDIA_VALIDATION_FAILED':
              return {
                title: 'Media Verification Failed',
                detail: 'The retrieved data could not be verified as a valid image or video file.',
                category: 'transient',
                tag: '🛡️ Validation Failed'
              };
            case 'PROVIDER_NOT_CONFIGURED':
              return {
                title: 'Preview Service Unavailable',
                detail: 'The upstream preview provider is not configured.',
                category: 'permanent',
                tag: '⚙️ Unconfigured'
              };
            case 'AUTHENTICATION_REQUIRED':
            case 'AUTHENTICATION_ERROR':
              return {
                title: 'Account Authorization Required',
                detail: 'Access to this content requires authorized account permissions.',
                category: 'restricted',
                tag: '🔑 Auth Required'
              };
            case 'POST_NOT_FOUND':
              return {
                title: 'Post Not Found',
                detail: 'The requested post or Reel could not be found. It may have been deleted or archived.',
                category: 'permanent',
                tag: '🔍 Not Found'
              };
            default:
              return {
                title: 'Unable to Resolve Media',
                detail: err.message || 'An unexpected error occurred while resolving this link.',
                category: 'transient',
                tag: '⚠️ Error'
              };
          }
        };

        const friendly = getFriendlyError(job.error);
        const isTemporary = friendly.category === 'temporary';
        const isRestricted = friendly.category === 'restricted';

        return (
          <div
            role="alert"
            style={{
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-sm)',
              background: isTemporary
                ? 'rgba(251, 191, 36, 0.08)'
                : isRestricted
                ? 'rgba(244, 63, 94, 0.08)'
                : 'rgba(148, 163, 184, 0.08)',
              border: `1px solid ${
                isTemporary
                  ? 'rgba(251, 191, 36, 0.3)'
                  : isRestricted
                  ? 'rgba(244, 63, 94, 0.25)'
                  : 'rgba(148, 163, 184, 0.25)'
              }`,
              color: isTemporary ? '#fbbf24' : isRestricted ? '#fb7185' : '#cbd5e1',
              fontSize: '0.82rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span style={{ fontWeight: 700, color: isTemporary ? '#fde68a' : '#fda4af' }}>⚠️ {friendly.title}</span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  padding: '0.15rem 0.45rem',
                  borderRadius: '4px',
                  background: isTemporary ? 'rgba(251, 191, 36, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                  color: isTemporary ? '#fbbf24' : '#fda4af',
                  border: `1px solid ${isTemporary ? 'rgba(251, 191, 36, 0.35)' : 'rgba(244, 63, 94, 0.35)'}`
                }}
              >
                {friendly.tag}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.78rem', color: isTemporary ? '#fef3c7' : '#fecdd3', lineHeight: 1.4 }}>
              {friendly.detail}
            </p>
            {job.error.message && job.error.message !== friendly.detail && (
              <span style={{ fontSize: '0.74rem', color: isTemporary ? '#fde68a' : '#fda4af', opacity: 0.9 }}>
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
