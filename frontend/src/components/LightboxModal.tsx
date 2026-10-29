import React, { useEffect, useCallback } from 'react';
import { MediaItem, CarouselItem } from '../types/queue.js';
import { useQueue } from '../context/QueueContext.js';

interface LightboxModalProps {
  jobId: string;
  items: (MediaItem | CarouselItem)[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (index: number) => void;
}

export const LightboxModal: React.FC<LightboxModalProps> = ({
  jobId,
  items,
  currentIndex,
  isOpen,
  onClose,
  onNavigate
}) => {
  const { downloadMediaItem } = useQueue();

  const currentItem = items[currentIndex];
  const hasMultiple = items.length > 1;

  const handlePrev = useCallback(() => {
    if (!hasMultiple) return;
    const prev = (currentIndex - 1 + items.length) % items.length;
    onNavigate(prev);
  }, [currentIndex, items.length, hasMultiple, onNavigate]);

  const handleNext = useCallback(() => {
    if (!hasMultiple) return;
    const next = (currentIndex + 1) % items.length;
    onNavigate(next);
  }, [currentIndex, items.length, hasMultiple, onNavigate]);

  // Keyboard navigation & body scroll locking
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, handlePrev, handleNext]);

  if (!isOpen || !currentItem) {
    return null;
  }

  const isVideo = currentItem.type === 'video';
  const previewSource = currentItem.url || currentItem.previewUrl || currentItem.thumbnailUrl;
  const isDownloadable = currentItem.downloadable !== false && Boolean(currentItem.url);

  const handleDownload = () => {
    downloadMediaItem(jobId, currentItem);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Media Lightbox"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(5, 8, 15, 0.94)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={onClose}
    >
      {/* Top Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.5rem',
          zIndex: 2010,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {hasMultiple && (
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 700,
                color: '#ffffff',
                background: 'rgba(99, 102, 241, 0.85)',
                padding: '0.25rem 0.65rem',
                borderRadius: '6px',
                backdropFilter: 'blur(4px)'
              }}
            >
              Slide {currentIndex + 1} of {items.length}
            </span>
          )}
          <span
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-secondary)',
              fontFamily: 'monospace',
              maxWidth: '300px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
            title={currentItem.filename}
          >
            {currentItem.filename}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isDownloadable && (
            <button
              type="button"
              onClick={handleDownload}
              className="btn btn-primary btn-sm"
              style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem', fontWeight: 600 }}
            >
              ⬇️ Download {isVideo ? 'Video' : 'Photo'}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary btn-sm"
            style={{
              width: '36px',
              height: '36px',
              padding: 0,
              fontSize: '1.1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%'
            }}
            aria-label="Close Lightbox"
            title="Close (Esc)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Main Centered Media Stage */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: '0 1rem',
          minHeight: 0
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Previous Navigation Button */}
        {hasMultiple && (
          <button
            type="button"
            onClick={handlePrev}
            style={{
              position: 'absolute',
              left: '1.25rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              fontSize: '1.3rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 2020,
              backdropFilter: 'blur(8px)',
              transition: 'var(--transition)'
            }}
            aria-label="Previous Slide"
          >
            ◀
          </button>
        )}

        {/* Media Element */}
        <div
          style={{
            maxWidth: '90vw',
            maxHeight: '76vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {isVideo && currentItem.url ? (
            <video
              src={currentItem.url}
              controls
              autoPlay
              playsInline
              style={{
                maxWidth: '90vw',
                maxHeight: '76vh',
                borderRadius: '8px',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
                outline: 'none'
              }}
            />
          ) : previewSource ? (
            <img
              src={previewSource}
              alt={currentItem.filename}
              style={{
                maxWidth: '90vw',
                maxHeight: '76vh',
                objectFit: 'contain',
                borderRadius: '8px',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)'
              }}
            />
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
              Preview unavailable
            </div>
          )}
        </div>

        {/* Next Navigation Button */}
        {hasMultiple && (
          <button
            type="button"
            onClick={handleNext}
            style={{
              position: 'absolute',
              right: '1.25rem',
              top: '50%',
              transform: 'translateY(-50%)',
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              fontSize: '1.3rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 2020,
              backdropFilter: 'blur(8px)',
              transition: 'var(--transition)'
            }}
            aria-label="Next Slide"
          >
            ▶
          </button>
        )}
      </div>

      {/* Bottom Bar / Slide Indicators */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '1rem',
          background: 'linear-gradient(to top, rgba(0,0,0,0.7), transparent)',
          zIndex: 2010
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {hasMultiple && (
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {items.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onNavigate(idx)}
                style={{
                  width: idx === currentIndex ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: idx === currentIndex ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.25)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'all 0.2s ease'
                }}
                aria-label={`Jump to slide ${idx + 1}`}
              />
            ))}
          </div>
        )}

        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
          {currentItem.width && currentItem.height ? `${currentItem.width} × ${currentItem.height}` : ''}
          {currentItem.sizeBytes ? ` • ${(currentItem.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : ''}
        </div>
      </div>
    </div>
  );
};
