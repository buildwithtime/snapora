import React, { useEffect } from 'react';
import { useProfileGallery } from '../../context/ProfileGalleryContext.js';
import { useQueue } from '../../context/QueueContext.js';

export const CarouselSlideModal: React.FC = () => {
  const { state, closeCarouselModal } = useProfileGallery();
  const { addUrls } = useQueue();
  const item = state.inspectingCarousel;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeCarouselModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [closeCarouselModal]);

  if (!item) return null;

  const slides = item.carouselMedia || [
    {
      id: `${item.id}_slide_0`,
      type: item.type === 'video' ? ('video' as const) : ('image' as const),
      url: item.displayUrl || item.thumbnailUrl,
      thumbnailUrl: item.thumbnailUrl
    }
  ];

  const handleQueueAll = () => {
    addUrls(item.url);
    closeCarouselModal();
  };

  const handleDownloadSlide = (slideUrl: string) => {
    // If it's a direct url or permalink
    const downloadLink = document.createElement('a');
    downloadLink.href = slideUrl;
    downloadLink.target = '_blank';
    downloadLink.rel = 'noopener noreferrer';
    downloadLink.download = `snapora_${item.shortcode}_slide.jpg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Carousel Slides for post ${item.shortcode}`}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 15, 0.82)',
        backdropFilter: 'blur(10px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeCarouselModal();
        }
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '850px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.15)'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.7)'
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
              Carousel Album — {slides.length} Slides
            </h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Post shortcode: {item.shortcode}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={handleQueueAll}
              className="btn btn-primary btn-sm"
              style={{ fontWeight: 600 }}
              title="Add this entire carousel post to the download queue"
            >
              📥 Queue Carousel
            </button>
            <button
              type="button"
              onClick={closeCarouselModal}
              className="btn btn-secondary btn-sm"
              aria-label="Close Slide Viewer"
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Content / Slide Grid */}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: '1.25rem'
          }}
        >
          {slides.map((slide, index) => (
            <div
              key={slide.id || index}
              style={{
                borderRadius: 'var(--radius-sm)',
                overflow: 'hidden',
                backgroundColor: '#0c111c',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden' }}>
                <img
                  src={slide.thumbnailUrl || slide.url}
                  alt={`Slide ${index + 1}`}
                  loading="lazy"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                <span
                  style={{
                    position: 'absolute',
                    top: '0.5rem',
                    left: '0.5rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#ffffff'
                  }}
                >
                  {index + 1} / {slides.length}
                </span>
                {slide.type === 'video' && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '0.5rem',
                      right: '0.5rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: '#ffffff'
                    }}
                  >
                    🎬 Video
                  </span>
                )}
              </div>

              <div style={{ padding: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Slide {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleDownloadSlide(slide.url)}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '0.25rem 0.55rem', fontSize: '0.75rem' }}
                  title="Open/download this slide"
                >
                  Download ↗
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

