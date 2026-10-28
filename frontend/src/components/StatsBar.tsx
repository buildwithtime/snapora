import React from 'react';
import { useQueue } from '../context/QueueContext.js';

export const StatsBar: React.FC = () => {
  const { state } = useQueue();

  const total = state.jobs.length;
  const queued = state.jobs.filter((j) => j.status === 'queued').length;
  const processing = state.jobs.filter((j) => j.status === 'fetching' || j.status === 'validating').length;
  const ready = state.jobs.filter((j) => j.status === 'ready').length;
  const failed = state.jobs.filter((j) => j.status === 'failed').length;

  const stats = [
    { label: 'Total Jobs', count: total, color: 'var(--text-main)', border: 'var(--border-subtle)' },
    { label: 'In Queue', count: queued, color: 'var(--status-queued)', border: 'rgba(245, 158, 11, 0.25)' },
    { label: 'Processing', count: processing, color: 'var(--status-fetching)', border: 'rgba(6, 182, 212, 0.25)' },
    { label: 'Ready', count: ready, color: 'var(--status-ready)', border: 'rgba(16, 185, 129, 0.25)' },
    { label: 'Failed', count: failed, color: 'var(--status-failed)', border: 'rgba(244, 63, 94, 0.25)' }
  ];

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
      }}
    >
      {stats.map((s, idx) => (
        <div
          key={idx}
          className="glass-panel"
          style={{
            padding: '1.1rem 1.25rem',
            border: `1px solid ${s.border}`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {s.label}
          </span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.4rem' }}>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: s.color, lineHeight: 1 }}>
              {s.count}
            </span>
            {s.label === 'Processing' && processing > 0 && (
              <span className="animate-spin" style={{ display: 'inline-block', fontSize: '0.9rem' }}>
                ⚙️
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
