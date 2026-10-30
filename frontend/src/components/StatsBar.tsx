import React from 'react';
import { useQueue } from '../context/QueueContext.js';

export const StatsBar: React.FC = () => {
  const { state } = useQueue();

  const total = state.jobs.length;
  if (total === 0) {
    return null;
  }

  const queued = state.jobs.filter((j) => j.status === 'queued').length;
  const processing = state.jobs.filter((j) => j.status === 'fetching' || j.status === 'validating').length;
  const ready = state.jobs.filter((j) => j.status === 'ready' || j.status === 'preview_ready').length;
  const failed = state.jobs.filter((j) => j.status === 'failed').length;

  return (
    <div
      role="status"
      aria-label="Queue Summary"
      className="glass-panel"
      style={{
        padding: '0.65rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.6rem',
        fontSize: '0.82rem',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>
          Downloads · {total} {total === 1 ? 'item' : 'items'}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.45rem',
          flexWrap: 'wrap'
        }}
        aria-live="polite"
      >
        {ready > 0 && (
          <span
            style={{
              padding: '0.15rem 0.5rem',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.12)',
              color: 'var(--status-ready)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
          >
            ✓ {ready} ready
          </span>
        )}

        {processing > 0 && (
          <span
            style={{
              padding: '0.15rem 0.5rem',
              borderRadius: '12px',
              background: 'rgba(6, 182, 212, 0.12)',
              color: 'var(--status-fetching)',
              border: '1px solid rgba(6, 182, 212, 0.25)',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
          >
            <span className="animate-spin" style={{ display: 'inline-block' }}>⚙️</span>
            {processing} resolving
          </span>
        )}

        {queued > 0 && (
          <span
            style={{
              padding: '0.15rem 0.5rem',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.12)',
              color: 'var(--status-queued)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              fontWeight: 600
            }}
          >
            {queued} queued
          </span>
        )}

        {failed > 0 && (
          <span
            style={{
              padding: '0.15rem 0.5rem',
              borderRadius: '12px',
              background: 'rgba(244, 63, 94, 0.12)',
              color: 'var(--status-failed)',
              border: '1px solid rgba(244, 63, 94, 0.25)',
              fontWeight: 600
            }}
          >
            ✕ {failed} failed
          </span>
        )}
      </div>
    </div>
  );
};
