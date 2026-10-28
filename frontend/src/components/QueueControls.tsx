import React from 'react';
import { useQueue } from '../context/QueueContext.js';

export const QueueControls: React.FC = () => {
  const { state, pauseQueue, resumeQueue, clearCompleted } = useQueue();

  const hasCompleted = state.jobs.some((j) => j.status === 'ready' || j.status === 'failed');

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem',
        marginBottom: '1.25rem'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
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
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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
          <button
            type="button"
            onClick={clearCompleted}
            className="btn btn-secondary btn-sm"
          >
            Clear Completed
          </button>
        )}
      </div>
    </div>
  );
};
