import React, { useState } from 'react';
import { ProfileMediaItem } from '../../types/profile.js';
import { useProfileGallery } from '../../context/ProfileGalleryContext.js';
import { useQueue } from '../../context/QueueContext.js';

interface MediaCardProps {
  item: ProfileMediaItem;
  onSingleQueued?: () => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({ item, onSingleQueued }) => {
  const { state, toggleSelect, openCarouselModal } = useProfileGallery();
  const { addUrls } = useQueue();
  const [isHovered, setIsHovered] = useState(false);
  const [imgError, setImgError] = useState(false);

  const isSelected = state.selectedIds.has(item.id);

  const handleCardClick = (e: React.MouseEvent) => {
    // If clicked directly on a button or link, don't toggle
    if ((e.target as HTMLElement).closest('button, a')) {
      return;
    }
    toggleSelect(item.id);
  };

  const handleQuickDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    addUrls(item.url);
    if (onSingleQueued) {
      onSingleQueued();
    }
  };

  const handleCarouselInspect = (e: React.MouseEvent) => {
    e.stopPropagation();
    openCarouselModal(item);
  };

  return (
    <div
      onClick={handleCardClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="media-card"
      style={{
        position: 'relative',
        cursor: 'pointer',
        borderColor: isSelected ? 'var(--accent-cyan)' : 'var(--border-subtle)',
        boxShadow: isSelected
          ? '0 0 0 2px var(--accent-cyan), 0 8px 30px rgba(6, 182, 212, 0.3)'
          : undefined,
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
      tabIndex={0}
      role="checkbox"
      aria-checked={isSelected}
      aria-label={`Media post ${item.shortcode}`}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          toggleSelect(item.id);
        }
      }}
    >
      {/* Square Media Preview */}
      <div className="media-card-preview">
        {!imgError && (item.thumbnailUrl || item.displayUrl) ? (
          <img
            src={item.thumbnailUrl || item.displayUrl}
            alt={item.caption ? item.caption.slice(0, 80) : `Post ${item.shortcode}`}
            loading="lazy"
            className="media-card-img"
            onError={() => setImgError(true)}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#111726',
              color: 'var(--text-muted)',
              fontSize: '2rem'
            }}
          >
            {item.type === 'video' ? '🎬' : item.type === 'carousel' ? '📚' : '🖼️'}
          </div>
        )}

        {/* Top-Left Selection Checkbox */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            toggleSelect(item.id);
          }}
          style={{
            position: 'absolute',
            top: '0.6rem',
            left: '0.6rem',
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            backgroundColor: isSelected ? 'var(--accent-cyan)' : 'rgba(0, 0, 0, 0.55)',
            backdropFilter: 'blur(4px)',
            border: isSelected ? '2px solid #ffffff' : '1.5px solid rgba(255, 255, 255, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0b0f17',
            fontSize: '14px',
            fontWeight: 'bold',
            zIndex: 3,
            transition: 'all 0.15s ease'
          }}
          title={isSelected ? 'Deselect item' : 'Select item for download'}
        >
          {isSelected && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>

        {/* Top-Right Media Type Badge */}
        <div
          style={{
            position: 'absolute',
            top: '0.6rem',
            right: '0.6rem',
            padding: '0.2rem 0.45rem',
            borderRadius: '6px',
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(6px)',
            border: '1px solid rgba(255, 255, 255, 0.18)',
            color: '#f8fafc',
            fontSize: '0.72rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            zIndex: 2
          }}
        >
          {item.type === 'video' ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              <span>Video</span>
            </>
          ) : item.type === 'carousel' ? (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="2" y="2" width="16" height="16" rx="2" />
                <path d="M6 18v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2" />
              </svg>
              <span>{item.carouselMedia?.length || 'Multi'}</span>
            </>
          ) : (
            <>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Photo</span>
            </>
          )}
        </div>

        {/* Hover / Overlay Details */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.4) 100%)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '0.85rem',
            opacity: isHovered || isSelected ? 1 : 0,
            transition: 'opacity 0.2s ease',
            zIndex: 2,
            pointerEvents: isHovered ? 'auto' : 'none'
          }}
        >
          {/* Top spacer */}
          <div />

          {/* Bottom Info & Quick Actions */}
          <div>
            {/* Likes & Comments */}
            {(item.likesCount !== undefined || item.commentsCount !== undefined) && (
              <div
                style={{
                  display: 'flex',
                  gap: '0.85rem',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  marginBottom: '0.5rem'
                }}
              >
                {item.likesCount !== undefined && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    ❤️ {item.likesCount.toLocaleString()}
                  </span>
                )}
                {item.commentsCount !== undefined && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    💬 {item.commentsCount.toLocaleString()}
                  </span>
                )}
              </div>
            )}

            {/* Quick action buttons */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleQuickDownload}
                className="btn btn-primary btn-sm"
                style={{
                  padding: '0.35rem 0.65rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  flex: 1
                }}
                title="Add this post to download queue"
              >
                📥 Enqueue
              </button>

              {item.type === 'carousel' && (
                <button
                  type="button"
                  onClick={handleCarouselInspect}
                  className="btn btn-secondary btn-sm"
                  style={{
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.75rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.2)'
                  }}
                  title="Inspect individual carousel slides"
                >
                  👁️ Slides
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
