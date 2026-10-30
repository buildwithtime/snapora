import React, { useState, useRef, useEffect } from 'react';
import { useQueue } from '../context/QueueContext.js';

export const QueueControls: React.FC = () => {
  const {
    state,
    pauseQueue,
    resumeQueue,
    clearCompleted,
    clearFailed,
    downloadAll,
    cancelDownloadAll,
    downloadMode,
    setDownloadMode
  } = useQueue();

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsDropdownOpen(false);
      }
    };

    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const hasCompleted = state.jobs.some(
    (j) => j.status === 'ready' || j.status === 'preview_ready'
  );
  const hasFailedJobs = state.jobs.some((j) => j.status === 'failed');

  // Compute downloadable items across all resolved jobs
  const resolvedJobs = state.jobs.filter(
    (j) => j.status === 'ready' || j.status === 'preview_ready'
  );
  let totalResolvedItems = 0;
  let downloadableCount = 0;
  let failedCount = 0;

  resolvedJobs.forEach((job) => {
    const items =
      job.carouselItems && job.carouselItems.length > 0 ? job.carouselItems : job.media || [];
    items.forEach((item) => {
      totalResolvedItems++;
      if (item.downloadable !== false && Boolean(item.url)) {
        downloadableCount++;
        if (item.status === 'failed') {
          failedCount++;
        }
      }
    });
  });

  const previewOnlyCount = totalResolvedItems - downloadableCount;
  const stats = state.downloadAllStats;
  const isDownloadingAll = Boolean(stats?.active);

  return (
    <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Queue Jobs</h2>
          <span
            style={{
              fontSize: '0.72rem',
              padding: '0.15rem 0.5rem',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.06)',
              color: 'var(--text-secondary)'
            }}
          >
            Concurrency: 1 (Sequential)
          </span>

          {totalResolvedItems > 0 && (
            <span
              style={{
                fontSize: '0.72rem',
                padding: '0.15rem 0.5rem',
                borderRadius: '10px',
                background: 'rgba(56, 189, 248, 0.12)',
                color: '#38bdf8',
                border: '1px solid rgba(56, 189, 248, 0.25)'
              }}
            >
              {downloadableCount} Downloadable {previewOnlyCount > 0 ? `(${previewOnlyCount} preview-only)` : ''}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Retry Failed Button if any downloadable item failed */}
          {failedCount > 0 && (
            <button
              type="button"
              onClick={() => downloadAll(undefined, { retryFailedOnly: true, mode: downloadMode })}
              disabled={isDownloadingAll}
              className="btn btn-outline-danger btn-sm"
              style={{ fontWeight: 600, padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}
            >
              🔄 Retry Failed ({failedCount})
            </button>
          )}

          {/* Prominent Download All with Format Dropdown */}
          {downloadableCount > 0 && (
            <div
              ref={dropdownRef}
              style={{
                position: 'relative',
                display: 'inline-flex',
                alignItems: 'stretch',
                boxShadow: '0 4px 14px rgba(0, 0, 0, 0.25)'
              }}
            >
              <button
                type="button"
                id="download-all-btn"
                onClick={() => downloadAll(undefined, { mode: downloadMode })}
                disabled={isDownloadingAll}
                className="btn btn-primary btn-sm"
                style={{
                  fontWeight: 700,
                  padding: '0.45rem 0.85rem',
                  fontSize: '0.82rem',
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                  borderRight: '1px solid rgba(255, 255, 255, 0.22)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem'
                }}
                title={
                  downloadMode === 'zip'
                    ? 'Download all eligible media as a single ZIP archive'
                    : 'Download all eligible media as individual files'
                }
              >
                {isDownloadingAll ? (
                  <>
                    <span className="animate-spin" style={{ display: 'inline-block' }}>
                      ⚙️
                    </span>
                    {stats?.mode === 'zip'
                      ? stats?.phase === 'compressing'
                        ? 'Compressing ZIP...'
                        : 'Packing ZIP...'
                      : 'Downloading...'}
                  </>
                ) : downloadMode === 'zip' ? (
                  `📦 Download All as ZIP (${downloadableCount})`
                ) : (
                  `⬇️ Download All (${downloadableCount})`
                )}
              </button>

              <button
                type="button"
                id="download-mode-dropdown-trigger"
                onClick={() => setIsDropdownOpen((prev) => !prev)}
                disabled={isDownloadingAll}
                aria-haspopup="menu"
                aria-expanded={isDropdownOpen}
                aria-label="Choose download format: ZIP archive or individual files"
                className="btn btn-primary btn-sm"
                style={{
                  padding: '0.45rem 0.55rem',
                  borderTopLeftRadius: 0,
                  borderBottomLeftRadius: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease'
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {/* Popover Dropdown Menu */}
              {isDropdownOpen && (
                <div
                  role="menu"
                  aria-label="Download format options"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    right: 0,
                    minWidth: '250px',
                    background: '#13151c',
                    border: '1px solid rgba(255, 255, 255, 0.16)',
                    borderRadius: '8px',
                    boxShadow: '0 12px 30px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)',
                    padding: '0.4rem',
                    zIndex: 100,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem'
                  }}
                >
                  {/* Option: Download individually */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDownloadMode('individual');
                      setIsDropdownOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '0.2rem',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '6px',
                      background: downloadMode === 'individual' ? 'rgba(56, 189, 248, 0.14)' : 'transparent',
                      border: downloadMode === 'individual' ? '1px solid rgba(56, 189, 248, 0.35)' : '1px solid transparent',
                      color: downloadMode === 'individual' ? '#38bdf8' : 'var(--text-primary)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>⬇️ Download individually</span>
                      {downloadMode === 'individual' && <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      Save each file separately (default)
                    </span>
                  </button>

                  {/* Option: Download as ZIP */}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setDownloadMode('zip');
                      setIsDropdownOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '0.2rem',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '6px',
                      background: downloadMode === 'zip' ? 'rgba(168, 85, 247, 0.14)' : 'transparent',
                      border: downloadMode === 'zip' ? '1px solid rgba(168, 85, 247, 0.35)' : '1px solid transparent',
                      color: downloadMode === 'zip' ? '#c084fc' : 'var(--text-primary)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>📦 Download as ZIP</span>
                      {downloadMode === 'zip' && <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      Pack all eligible media into a single .zip archive
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {state.isPaused ? (
            <button
              type="button"
              onClick={resumeQueue}
              className="btn btn-secondary btn-sm"
              style={{ color: '#34d399', borderColor: 'rgba(52, 211, 153, 0.4)' }}
            >
              ▶ Resume Queue
            </button>
          ) : (
            <button
              type="button"
              onClick={pauseQueue}
              className="btn btn-secondary btn-sm"
              style={{ color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.4)' }}
            >
              ⏸ Pause Queue
            </button>
          )}

          {hasCompleted && (
            <button type="button" onClick={clearCompleted} className="btn btn-secondary btn-sm">
              Clear Completed
            </button>
          )}

          {hasFailedJobs && (
            <button type="button" onClick={clearFailed} className="btn btn-outline-danger btn-sm" style={{ fontSize: '0.78rem' }}>
              Clear Failed
            </button>
          )}
        </div>
      </div>

      {/* Active Download All / ZIP Progress Banner */}
      {isDownloadingAll && stats && (
        <div
          className="glass-panel"
          style={{
            padding: '0.85rem 1rem',
            borderRadius: 'var(--radius-sm)',
            border:
              stats.mode === 'zip'
                ? '1px solid rgba(168, 85, 247, 0.4)'
                : '1px solid rgba(6, 182, 212, 0.4)',
            background:
              stats.mode === 'zip'
                ? 'rgba(168, 85, 247, 0.08)'
                : 'rgba(6, 182, 212, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span
              style={{
                fontSize: '0.82rem',
                fontWeight: 600,
                color: stats.mode === 'zip' ? '#d8b4fe' : '#67e8f9'
              }}
            >
              {stats.mode === 'zip' ? (
                stats.phase === 'compressing' ? (
                  `📦 Compressing ${stats.archiveName || 'archive'}...`
                ) : (
                  `📦 Packing ZIP: ${stats.completed + stats.failed + 1} of ${stats.total}${
                    stats.currentFilename ? ` • ${stats.currentFilename}` : ''
                  }`
                )
              ) : (
                `Sequential Download: ${stats.completed + stats.failed + 1} of ${stats.total}${
                  stats.currentFilename ? ` • ${stats.currentFilename}` : ''
                }`
              )}
            </span>
            <button
              type="button"
              onClick={cancelDownloadAll}
              className="btn btn-outline-danger btn-sm"
              style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
            >
              Cancel
            </button>
          </div>

          <div
            style={{
              height: '6px',
              borderRadius: '3px',
              background: 'rgba(255, 255, 255, 0.1)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.round(((stats.completed + stats.failed) / stats.total) * 100)}%`,
                background:
                  stats.mode === 'zip'
                    ? 'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)'
                    : 'var(--accent-gradient)',
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>
      )}

      {/* Completed Download Summary Banner */}
      {!isDownloadingAll && stats && stats.total > 0 && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.82rem',
            fontWeight: 500,
            background: stats.failed === 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
            color: stats.failed === 0 ? '#34d399' : '#fbbf24',
            border: `1px solid ${stats.failed === 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>
            {stats.mode === 'zip'
              ? stats.failed === 0
                ? `✓ Successfully created ZIP archive (${stats.completed} media items downloaded as ${
                    stats.archiveName || 'archive.zip'
                  })!`
                : `Created ZIP archive with ${stats.completed} of ${stats.total} items (${stats.failed} item${
                    stats.failed > 1 ? 's' : ''
                  } failed and were excluded).`
              : stats.failed === 0
              ? `✓ Successfully downloaded all ${stats.completed} media items!`
              : `Completed ${stats.completed} of ${stats.total} downloads (${stats.failed} item${
                  stats.failed > 1 ? 's' : ''
                } failed).`}
          </span>

          {stats.failed > 0 && (
            <button
              type="button"
              onClick={() => downloadAll(undefined, { retryFailedOnly: true, mode: downloadMode })}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.74rem', padding: '0.25rem 0.55rem' }}
            >
              🔄 Retry Failed
            </button>
          )}
        </div>
      )}
    </div>
  );
};
