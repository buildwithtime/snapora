import React, { useState } from 'react';
import { MediaItem, CarouselItem } from '../types/queue.js';
import { useQueue } from '../context/QueueContext.js';

interface MediaCardProps {
  jobId: string;
  item: MediaItem | CarouselItem;
  slideNumber?: number;
  totalSlides?: number;
  providerName?: string;
  onOpenLightbox?: () => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  jobId,
  item,
  slideNumber,
  totalSlides,
  providerName: _providerName,
  onOpenLightbox
}) => {
  const { downloadMediaItem } = useQueue();
  const [imgError, setImgError] = useState(false);

  const previewSource = item.previewUrl || item.thumbnailUrl;
  const isVideo = item.type === 'video';
  const isDownloadable = item.downloadable !== false && Boolean(item.url);
  const status = item.status || 'pending';

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadMediaItem(jobId, item);
  };

  return (
    <div className="media-card">
      {/* Visual Preview / Thumbnail Area (Clean, Uncluttered, Click-to-Enlarge) */}
      <div
        className="media-card-preview"
        onClick={onOpenLightbox}
        title="Click to view full size"
      >
        {previewSource && !imgError ? (
          <img
            src={previewSource}
            alt={item.filename}
            onError={() => setImgError(true)}
            className="media-card-img"
            loading="lazy"
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              background: '#070a12'
            }}
          >
            <span style={{ fontSize: '2.5rem' }}>{isVideo ? '🎬' : '📷'}</span>
            <span style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
              {isVideo ? 'Video Preview' : 'Image Preview'}
            </span>
          </div>
        )}

        {/* Subtle Video Play Indicator (Videos & Reels only) */}
        {isVideo && (
          <div className="video-play-indicator" aria-label="Video stream">
            ▶
          </div>
        )}

        {/* Subtle Hover Enlarge Badge */}
        <div className="media-card-expand-badge">
          <span>⤢</span>
          <span>Enlarge</span>
        </div>
      </div>

      {/* Card Body & Actions beneath the preview */}
      <div
        style={{
          padding: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.65rem',
          flex: 1,
          justifyContent: 'space-between',
          background: 'rgba(11, 16, 27, 0.4)'
        }}
      >
        <div>
          {/* Subtle Metadata Line: Slide number + Dimensions/Size */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.35rem',
              fontSize: '0.74rem'
            }}
          >
            {slideNumber && totalSlides ? (
              <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>
                Slide {slideNumber} of {totalSlides}
              </span>
            ) : (
              <span style={{ fontWeight: 500, color: 'var(--text-secondary)' }}>
                {isVideo ? '🎬 Video' : '📷 Photo'}
              </span>
            )}

            <span style={{ color: 'var(--text-muted)' }}>
              {item.width && item.height ? `${item.width} × ${item.height}` : ''}
              {item.sizeBytes ? ` • ${(item.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : ''}
            </span>
          </div>

          {/* Filename with single-line ellipsis and hover tooltip */}
          <div
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: 'var(--text-main)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontFamily: 'monospace'
            }}
            title={item.filename}
          >
            {item.filename}
          </div>
        </div>

        {/* Preview-only notice */}
        {!isDownloadable && (
          <div
            style={{
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              background: 'rgba(255, 255, 255, 0.02)',
              padding: '0.4rem 0.55rem',
              borderRadius: '4px',
              border: '1px solid var(--border-subtle)',
              lineHeight: 1.35
            }}
          >
            {isVideo
              ? 'Public web metadata did not provide a downloadable video stream for this item (preview poster only).'
              : 'Original high-resolution media stream is unavailable without authorized credentials; preview poster displayed.'}
          </div>
        )}

        {/* Error Feedback */}
        {status === 'failed' && item.error && (
          <div
            style={{
              fontSize: '0.72rem',
              color: '#fb7185',
              background: 'rgba(244, 63, 94, 0.1)',
              padding: '0.4rem 0.55rem',
              borderRadius: '4px',
              border: '1px solid rgba(244, 63, 94, 0.25)'
            }}
          >
            ⚠️ {item.error}
          </div>
        )}

        {/* Download Action placed beneath the preview */}
        <div style={{ marginTop: '0.2rem' }}>
          {isDownloadable ? (
            status === 'downloading' ? (
              <button
                type="button"
                disabled
                className="btn btn-primary btn-sm"
                style={{ width: '100%', fontSize: '0.78rem', padding: '0.5rem' }}
              >
                <span className="animate-spin" style={{ display: 'inline-block', marginRight: '0.35rem' }}>⚙️</span>
                Downloading Bytes...
              </button>
            ) : status === 'completed' ? (
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span
                  style={{
                    flex: 1,
                    textAlign: 'center',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    color: '#34d399',
                    background: 'rgba(16, 185, 129, 0.12)',
                    padding: '0.45rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid rgba(16, 185, 129, 0.3)'
                  }}
                >
                  ✓ Downloaded
                </span>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.74rem', padding: '0.45rem 0.65rem' }}
                  title="Download again"
                >
                  ↻
                </button>
              </div>
            ) : status === 'failed' ? (
              <button
                type="button"
                onClick={handleDownload}
                className="btn btn-outline-danger btn-sm"
                style={{ width: '100%', fontSize: '0.78rem', padding: '0.5rem' }}
              >
                🔄 Retry Download
              </button>
            ) : (
              <button
                type="button"
                onClick={handleDownload}
                className="btn btn-primary btn-sm"
                style={{ width: '100%', fontSize: '0.8rem', padding: '0.5rem', fontWeight: 600 }}
              >
                ⬇️ <span>Download</span> {isVideo ? 'Video (MP4)' : 'Photo (JPG)'}
              </button>
            )
          ) : (
            <button
              type="button"
              disabled
              className="btn btn-secondary btn-sm"
              style={{
                width: '100%',
                fontSize: '0.76rem',
                padding: '0.5rem',
                opacity: 0.6,
                cursor: 'not-allowed'
              }}
              title="Original media stream unavailable via public web metadata"
            >
              👁️ Preview Only (No Download)
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
