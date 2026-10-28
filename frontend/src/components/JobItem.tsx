import React from 'react';
import { QueueJob } from '../types/queue.js';
import { useQueue } from '../context/QueueContext.js';

interface JobItemProps {
  job: QueueJob;
}

export const JobItem: React.FC<JobItemProps> = ({ job }) => {
  const { retryJob, removeJob, triggerDownload } = useQueue();

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

  return (
    <div
      className="glass-panel"
      style={{
        padding: '1.25rem',
        marginBottom: '0.85rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        transition: 'var(--transition)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {getStatusBadge()}
          <span
            style={{
              fontSize: '0.85rem',
              fontFamily: 'monospace',
              color: 'var(--text-main)',
              fontWeight: 600,
              background: 'rgba(255,255,255,0.04)',
              padding: '0.15rem 0.5rem',
              borderRadius: '4px'
            }}
          >
            {job.shortcode}
          </span>
          {job.author && (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              @{job.author}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {job.status === 'failed' && (
            <button
              type="button"
              onClick={() => retryJob(job.id)}
              className="btn btn-secondary btn-sm"
            >
              🔄 Retry
            </button>
          )}
          <button
            type="button"
            onClick={() => removeJob(job.id)}
            className="btn btn-outline-danger btn-sm"
            title="Remove from queue"
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>
        <a
          href={job.normalizedUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
        >
          {job.normalizedUrl} ↗
        </a>
      </div>

      {/* Error state display */}
      {job.status === 'failed' && job.error && (
        <div
          style={{
            padding: '0.6rem 0.8rem',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(244, 63, 94, 0.08)',
            border: '1px solid rgba(244, 63, 94, 0.2)',
            color: '#fb7185',
            fontSize: '0.8rem'
          }}
        >
          <strong>{job.error.code}:</strong> {job.error.message}
        </div>
      )}

      {/* Resolved media gallery & download triggers */}
      {job.status === 'ready' && job.media && job.media.length > 0 && (
        <div
          style={{
            marginTop: '0.5rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {job.media.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                {item.thumbnailUrl && (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.filename}
                    style={{
                      width: '42px',
                      height: '42px',
                      objectFit: 'cover',
                      borderRadius: '4px'
                    }}
                  />
                )}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    {item.type === 'video' ? '🎬 Video' : '📷 Photo'}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {item.filename}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => triggerDownload(item)}
                  className="btn btn-primary btn-sm"
                  style={{ marginLeft: '0.5rem', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                >
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
