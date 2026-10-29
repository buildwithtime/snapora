import React, { useState } from 'react';
import { QueueJob } from '../types/queue.js';
import { MediaCard } from './MediaCard.js';
import { LightboxModal } from './LightboxModal.js';
import { useQueue } from '../context/QueueContext.js';

interface MediaGalleryProps {
  job: QueueJob;
}

export const MediaGallery: React.FC<MediaGalleryProps> = ({ job }) => {
  const { downloadAll, state, downloadMode } = useQueue();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const isCarousel = Boolean(job.carouselItems && job.carouselItems.length > 0);
  const items = isCarousel ? job.carouselItems! : job.media || [];

  if (items.length === 0) {
    return null;
  }

  const downloadableItems = items.filter((item) => item.downloadable !== false && Boolean(item.url));
  const previewOnlyCount = items.length - downloadableItems.length;

  const photoCount = items.filter((i) => i.type === 'image').length;
  const videoCount = items.filter((i) => i.type === 'video').length;

  const handleDownloadAllJob = () => {
    downloadAll(job.id, { mode: downloadMode });
  };

  const isDownloading = Boolean(
    state.downloadAllStats?.active &&
    items.some((item) => item.status === 'downloading')
  );

  return (
    <div
      style={{
        marginTop: '1rem',
        paddingTop: '1rem',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}
    >
      {/* Gallery Header Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc' }}>
            {isCarousel ? `🎞️ Carousel Album (${items.length} items)` : `📷 Media Collection (${items.length} item${items.length > 1 ? 's' : ''})`}
          </span>

          <span
            style={{
              fontSize: '0.74rem',
              color: 'var(--text-secondary)',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '0.2rem 0.55rem',
              borderRadius: '12px'
            }}
          >
            {[photoCount > 0 && `${photoCount} photo${photoCount > 1 ? 's' : ''}`, videoCount > 0 && `${videoCount} video${videoCount > 1 ? 's' : ''}`]
              .filter(Boolean)
              .join(', ')}
          </span>

          {previewOnlyCount > 0 && (
            <span
              style={{
                fontSize: '0.74rem',
                color: '#a5b4fc',
                background: 'rgba(99, 102, 241, 0.1)',
                padding: '0.2rem 0.55rem',
                borderRadius: '12px',
                border: '1px solid rgba(99, 102, 241, 0.25)'
              }}
            >
              {previewOnlyCount} preview-only
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {items.some((i) => i.status === 'failed') && (
            <button
              type="button"
              onClick={() => downloadAll(job.id, { retryFailedOnly: true })}
              disabled={isDownloading}
              className="btn btn-outline-danger btn-sm"
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem', fontWeight: 600 }}
            >
              🔄 Retry Failed ({items.filter((i) => i.status === 'failed').length})
            </button>
          )}

          {/* Multi-Item Download All Button */}
          {downloadableItems.length > 1 && (
            <button
              type="button"
              onClick={handleDownloadAllJob}
              disabled={isDownloading}
              className="btn btn-primary btn-sm"
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem', fontWeight: 600 }}
            >
              {isDownloading ? (
                <>
                  <span className="animate-spin" style={{ display: 'inline-block', marginRight: '0.35rem' }}>⚙️</span>
                  {downloadMode === 'zip' ? 'Packing Album ZIP...' : 'Downloading Album...'}
                </>
              ) : downloadMode === 'zip' ? (
                `📦 Download Album as ZIP (${downloadableItems.length})`
              ) : (
                `⬇️ Download Album (${downloadableItems.length} items)`
              )}
            </button>
          )}
        </div>
      </div>

      {/* Enlarged Responsive Media Cards Grid (3 cols desktop, 2 cols tablet, 1 col mobile) */}
      <div className="media-gallery-grid">
        {items.map((item, idx) => (
          <MediaCard
            key={item.id || `${job.id}_${idx}`}
            jobId={job.id}
            item={item}
            slideNumber={isCarousel ? idx + 1 : undefined}
            totalSlides={isCarousel ? items.length : undefined}
            providerName={job.provider}
            onOpenLightbox={() => setLightboxIndex(idx)}
          />
        ))}
      </div>

      {/* Click-to-Enlarge Lightbox with Previous/Next Navigation */}
      {lightboxIndex !== null && (
        <LightboxModal
          jobId={job.id}
          items={items}
          currentIndex={lightboxIndex}
          isOpen={lightboxIndex !== null}
          onClose={() => setLightboxIndex(null)}
          onNavigate={(newIdx) => setLightboxIndex(newIdx)}
        />
      )}
    </div>
  );
};
