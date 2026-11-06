import React, { useState, useEffect, useRef, useCallback } from 'react';
import { YouTubeWorkspaceRecord, YouTubeResolutionStatus, YouTubeResolutionError } from './types.js';
import { resolveYouTubeVideo } from './services/youtubeApi.js';
import {
  loadYouTubeRecords,
  saveYouTubeRecord,
  deleteYouTubeRecord,
  updateYouTubeRecordUserFields,
  refreshYouTubeRecord,
  clearAllYouTubeRecords
} from './services/youtubeStorage.js';
import { YouTubeUrlInput } from './components/YouTubeUrlInput.js';
import { YouTubeVideoPreview } from './components/YouTubeVideoPreview.js';
import { YouTubeMetadataCard } from './components/YouTubeMetadataCard.js';
import { YouTubeThumbnailGallery } from './components/YouTubeThumbnailGallery.js';
import { YouTubeHistory } from './components/YouTubeHistory.js';

export const YouTubeWorkspace: React.FC = () => {
  const [status, setStatus] = useState<YouTubeResolutionStatus>('idle');
  const [activeRecord, setActiveRecord] = useState<YouTubeWorkspaceRecord | null>(null);
  const [error, setError] = useState<YouTubeResolutionError | null>(null);
  const [history, setHistory] = useState<YouTubeWorkspaceRecord[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load history on mount
  useEffect(() => {
    const records = loadYouTubeRecords();
    setHistory(records);
    if (records.length > 0 && !activeRecord) {
      // Don't auto-select if expired, but if fresh, optionally select latest
      setActiveRecord(records[0]);
      setStatus('resolved');
    }
  }, []);

  const handleCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setStatus('cancelled');
    setError({
      code: 'CANCELLED',
      message: 'Resolution request was cancelled.'
    });
  }, []);

  const handleResolve = useCallback(async (url: string) => {
    // Abort any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStatus('resolving');
    setError(null);

    const result = await resolveYouTubeVideo(url, { signal: controller.signal });

    if (controller.signal.aborted) {
      return;
    }

    if (result.ok && result.data) {
      // Save to workspace history
      const saved = saveYouTubeRecord(result.data);
      setActiveRecord(saved);
      setStatus('resolved');
      setHistory(loadYouTubeRecords());
    } else {
      setStatus('failed');
      setError(
        result.error || {
          code: 'RESOLUTION_FAILED',
          message: 'Unable to resolve video metadata from YouTube.'
        }
      );
    }
  }, []);

  const handleSelectRecord = useCallback((record: YouTubeWorkspaceRecord) => {
    setActiveRecord(record);
    setStatus('resolved');
    setError(null);
  }, []);

  const handleDeleteRecord = useCallback((id: string) => {
    deleteYouTubeRecord(id);
    const updated = loadYouTubeRecords();
    setHistory(updated);
    if (activeRecord?.id === id) {
      setActiveRecord(updated.length > 0 ? updated[0] : null);
      if (updated.length === 0) {
        setStatus('idle');
      }
    }
  }, [activeRecord]);

  const handleSaveUserFields = useCallback(
    (notes?: string, tags?: string[], collections?: string[]) => {
      if (!activeRecord) return;
      const updated = updateYouTubeRecordUserFields(activeRecord.id, {
        notes,
        tags,
        collections
      });
      if (updated) {
        setActiveRecord(updated);
        setHistory(loadYouTubeRecords());
      }
    },
    [activeRecord]
  );

  const handleRefreshMetadata = useCallback(
    async (recordToRefresh?: YouTubeWorkspaceRecord) => {
      const target = recordToRefresh || activeRecord;
      if (!target) return;

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setStatus('resolving');
      setError(null);

      const result = await resolveYouTubeVideo(target.canonicalUrl, {
        signal: controller.signal
      });

      if (controller.signal.aborted) return;

      if (result.ok && result.data) {
        const refreshed = refreshYouTubeRecord(target.id, result.data);
        if (refreshed) {
          setActiveRecord(refreshed);
          setStatus('resolved');
          setHistory(loadYouTubeRecords());
        }
      } else {
        setStatus('failed');
        setError(
          result.error || {
            code: 'REFRESH_FAILED',
            message: 'Failed to refresh metadata from YouTube.'
          }
        );
      }
    },
    [activeRecord]
  );

  const handleClearAllHistory = useCallback(() => {
    clearAllYouTubeRecords();
    setHistory([]);
    setActiveRecord(null);
    setStatus('idle');
    setError(null);
  }, []);

  return (
    <div style={{ marginTop: '0.5rem' }} data-testid="youtube-workspace">
      {/* Workspace Header Notice */}
      <div
        className="glass-panel"
        style={{
          padding: '1.25rem 1.5rem',
          marginBottom: '1.75rem',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          borderLeft: '4px solid #ef4444'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '1.1rem' }}>📺</span>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              YouTube Media Workspace
            </h2>
          </div>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', margin: 0 }}>
            Inspect public video metadata, multi-resolution thumbnails, and privacy-enhanced preview player
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '0.25rem 0.6rem',
              borderRadius: '20px',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontWeight: 600
            }}
          >
            Stream Ripping Prohibited
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '0.25rem 0.6rem',
              borderRadius: '20px',
              background: 'rgba(99, 102, 241, 0.12)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              color: 'var(--accent-indigo)',
              fontWeight: 600
            }}
          >
            30-Day Data Retention
          </span>
        </div>
      </div>

      {/* URL Input Form */}
      <YouTubeUrlInput
        onResolve={handleResolve}
        onCancel={handleCancel}
        isLoading={status === 'resolving'}
        activeCanonicalUrl={activeRecord?.canonicalUrl}
      />

      {/* Loading Skeleton */}
      {status === 'resolving' && (
        <div
          className="glass-panel"
          style={{
            padding: '2rem',
            textAlign: 'center',
            marginBottom: '2rem',
            borderRadius: 'var(--radius-md)'
          }}
          data-testid="youtube-loading-indicator"
        >
          <div
            style={{
              display: 'inline-block',
              width: '36px',
              height: '36px',
              border: '3px solid rgba(99, 102, 241, 0.2)',
              borderTopColor: 'var(--accent-indigo)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '1rem'
            }}
          />
          <h3 style={{ fontSize: '1.05rem', color: 'var(--text-main)', marginBottom: '0.3rem' }}>
            Resolving Video Metadata...
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Retrieving video details and thumbnail variants via privacy-safe endpoints
          </p>
        </div>
      )}

      {/* Error State */}
      {status === 'failed' && error && (
        <div
          className="glass-panel"
          style={{
            padding: '1.5rem',
            marginBottom: '2rem',
            borderRadius: 'var(--radius-md)',
            borderLeft: '4px solid var(--status-failed)'
          }}
          role="alert"
          data-testid="youtube-error-banner"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '1.3rem' }}>⚠️</span>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--status-failed)' }}>
              Resolution Error ({error.code})
            </h3>
          </div>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            {error.message}
          </p>
          {error.retryAfterSeconds && (
            <div style={{ fontSize: '0.8rem', color: 'var(--status-queued)', marginBottom: '0.75rem' }}>
              Suggested retry cooldown: {error.retryAfterSeconds} seconds
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setStatus(activeRecord ? 'resolved' : 'idle');
            }}
            className="btn btn-secondary"
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Resolved Content Sections */}
      {activeRecord && (
        <>
          {/* Video Preview Player */}
          <YouTubeVideoPreview data={activeRecord.data} />

          {/* Metadata Card & Notes Editor */}
          <YouTubeMetadataCard
            data={activeRecord.data}
            notes={activeRecord.notes}
            tags={activeRecord.tags}
            collections={activeRecord.collections}
            onSaveUserFields={handleSaveUserFields}
            onRefreshMetadata={() => handleRefreshMetadata(activeRecord)}
            isRefreshing={status === 'resolving'}
          />

          {/* Thumbnail Gallery */}
          <YouTubeThumbnailGallery
            thumbnails={activeRecord.data.thumbnails}
            title={activeRecord.data.title}
          />
        </>
      )}

      {/* Workspace History */}
      <YouTubeHistory
        records={history}
        onSelectRecord={handleSelectRecord}
        onDeleteRecord={handleDeleteRecord}
        onRefreshRecord={handleRefreshMetadata}
        onClearAll={handleClearAllHistory}
        activeRecordId={activeRecord?.id}
      />
    </div>
  );
};
