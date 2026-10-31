import React from 'react';
import { useProfileGallery } from '../../context/ProfileGalleryContext.js';
import { useQueue } from '../../context/QueueContext.js';
import { ProfileFilterType } from '../../types/profile.js';
import { MediaItem, CarouselItem } from '../../types/queue.js';
import { generateMediaFilename } from '../../utils/filenameGenerator.js';
import { MAX_ZIP_ITEMS } from '../../utils/zipDownloader.js';

interface SelectionToolbarProps {
  onQueueAdded?: (count: number) => void;
}

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({ onQueueAdded }) => {
  const {
    state,
    filteredItems,
    selectAll,
    selectNone,
    invertSelection,
    setFilter
  } = useProfileGallery();

  const { addUrls, downloadItemsAsZip } = useQueue();
  const [zipWarning, setZipWarning] = React.useState<string | null>(null);

  const counts = React.useMemo(() => {
    let photos = 0;
    let videos = 0;
    let carousels = 0;
    for (const item of state.items) {
      if (item.type === 'image') photos++;
      else if (item.type === 'video') videos++;
      else if (item.type === 'carousel') carousels++;
    }
    return { photos, videos, carousels, total: state.items.length };
  }, [state.items]);

  const selectedCount = state.selectedIds.size;

  const handleDownloadSelected = async (asZip = false) => {
    if (selectedCount === 0) return;

    const selectedPosts = state.items.filter((item) => state.selectedIds.has(item.id));
    if (selectedPosts.length === 0) return;

    if (asZip) {
      setZipWarning(null);
      // Build isolated items list from selected profile posts
      const customItems: Array<{ jobId: string; item: MediaItem | CarouselItem }> = [];

      selectedPosts.forEach((post) => {
        if (post.type === 'carousel' && post.carouselMedia && post.carouselMedia.length > 0) {
          post.carouselMedia.forEach((slide, idx) => {
            const filename = generateMediaFilename({
              username: state.profile?.username,
              shortcode: post.shortcode,
              takenAt: post.timestamp,
              slideNumber: idx + 1,
              isCarousel: true,
              mediaType: slide.type
            });
            customItems.push({
              jobId: post.id,
              item: {
                id: slide.id || `${post.id}_${idx}`,
                postId: post.shortcode,
                index: idx,
                type: slide.type,
                url: slide.url,
                thumbnailUrl: slide.thumbnailUrl,
                filename,
                downloadable: true
              }
            });
          });
        } else {
          const mediaType = post.type === 'video' ? 'video' : 'image';
          const filename = generateMediaFilename({
            username: state.profile?.username,
            shortcode: post.shortcode,
            takenAt: post.timestamp,
            mediaType
          });
          customItems.push({
            jobId: post.id,
            item: {
              id: post.id,
              postId: post.shortcode,
              type: mediaType,
              url: post.displayUrl || post.thumbnailUrl,
              thumbnailUrl: post.thumbnailUrl,
              filename,
              downloadable: true
            }
          });
        }
      });

      if (customItems.length > MAX_ZIP_ITEMS) {
        setZipWarning(
          `ZIP archives are limited to ${MAX_ZIP_ITEMS} media items to prevent browser memory issues (current selection has ${customItems.length} media files). Please select up to ${MAX_ZIP_ITEMS} files, or click 'Download Selected' to download via the sequential queue.`
        );
        return;
      }

      const prefix = `Snapora_${state.profile?.username || 'profile'}_selection`;
      const zipRes = await downloadItemsAsZip(customItems, prefix);
      if (zipRes && !zipRes.success) {
        setZipWarning(zipRes.error || 'Failed to generate ZIP archive');
      } else if (zipRes && zipRes.failed > 0) {
        setZipWarning(
          `Created ZIP archive with ${zipRes.completed} of ${customItems.length} items (${zipRes.failed} failed and were excluded).`
        );
      } else if (onQueueAdded) {
        onQueueAdded(selectedPosts.length);
      }
      return;
    }

    // Normal queue download
    setZipWarning(null);
    const selectedUrls = selectedPosts.map((item) => item.url);
    const res = addUrls(selectedUrls.join('\n'));
    if (onQueueAdded) {
      onQueueAdded(res.addedCount);
    }
  };

  const filterOptions: Array<{ type: ProfileFilterType; label: string; count: number }> = [
    { type: 'all', label: 'All', count: counts.total },
    { type: 'image', label: 'Photos', count: counts.photos },
    { type: 'video', label: 'Videos', count: counts.videos },
    { type: 'carousel', label: 'Carousels', count: counts.carousels }
  ];

  return (
    <div
      className="glass-panel"
      style={{
        padding: '0.85rem 1.25rem',
        marginBottom: '1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.85rem'
      }}
    >
      {/* Left: Filter Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginRight: '0.3rem', fontWeight: 600 }}>
          Filter:
        </span>
        {filterOptions.map((opt) => (
          <button
            key={opt.type}
            type="button"
            onClick={() => setFilter(opt.type)}
            className={`btn btn-sm ${state.filter === opt.type ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              padding: '0.3rem 0.75rem',
              fontSize: '0.8rem',
              fontWeight: state.filter === opt.type ? 700 : 500
            }}
          >
            {opt.label} ({opt.count})
          </button>
        ))}
      </div>

      {/* Middle: Selection Operations */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.825rem', color: 'var(--text-muted)', marginRight: '0.2rem' }}>
          Select:
        </span>
        <button
          type="button"
          onClick={selectAll}
          className="btn btn-secondary btn-sm"
          style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
          title={`Select all ${filteredItems.length} visible posts`}
        >
          All
        </button>
        <button
          type="button"
          onClick={selectNone}
          disabled={selectedCount === 0}
          className="btn btn-secondary btn-sm"
          style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
          title="Deselect all"
        >
          None
        </button>
        <button
          type="button"
          onClick={invertSelection}
          className="btn btn-secondary btn-sm"
          style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
          title="Invert current selection"
        >
          Invert
        </button>
      </div>

      {/* Right: Primary CTAs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
        <button
          type="button"
          onClick={() => handleDownloadSelected(false)}
          disabled={selectedCount === 0}
          className="btn btn-primary btn-sm"
          style={{
            padding: '0.5rem 1rem',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
          title={selectedCount > 0 ? `Send ${selectedCount} selected items to download queue` : 'Select items to download'}
        >
          <span>📥</span> Download Selected ({selectedCount})
        </button>

        <button
          type="button"
          onClick={() => handleDownloadSelected(true)}
          disabled={selectedCount === 0}
          className="btn btn-secondary btn-sm"
          style={{
            padding: '0.5rem 0.9rem',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}
          title={
            selectedCount > MAX_ZIP_ITEMS
              ? `ZIP archives are limited to ${MAX_ZIP_ITEMS} media items. Use Download Selected or select fewer posts.`
              : selectedCount > 0
              ? `Package ${selectedCount} selected items into a ZIP export`
              : 'Select items to download as ZIP'
          }
        >
          <span>📦</span> ZIP ({selectedCount})
        </button>
      </div>

      {zipWarning && (
        <div
          role="alert"
          style={{
            width: '100%',
            marginTop: '0.4rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8rem',
            background: 'rgba(245, 158, 11, 0.12)',
            color: '#fbbf24',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem'
          }}
        >
          <span>⚠️ {zipWarning}</span>
          <button
            type="button"
            onClick={() => setZipWarning(null)}
            className="btn btn-sm"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fbbf24',
              cursor: 'pointer',
              padding: '0.1rem 0.3rem',
              fontSize: '0.85rem'
            }}
            title="Dismiss warning"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
