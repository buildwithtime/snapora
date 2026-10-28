import React from 'react';
import { useQueue } from '../context/QueueContext.js';
import { JobItem } from './JobItem.js';

export const QueueList: React.FC = () => {
  const { state } = useQueue();

  if (state.jobs.length === 0) {
    return (
      <div
        className="glass-panel"
        style={{
          padding: '3rem 2rem',
          textAlign: 'center',
          color: 'var(--text-secondary)'
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📥</div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
          Queue is Empty
        </h3>
        <p style={{ fontSize: '0.85rem', maxWidth: '420px', margin: '0 auto', color: 'var(--text-muted)' }}>
          Paste public Instagram post or reel links into the box above or click &quot;Load Sample URLs&quot; to test sequential queue processing.
        </p>
      </div>
    );
  }

  return (
    <div>
      {state.jobs.map((job) => (
        <JobItem key={job.id} job={job} />
      ))}
    </div>
  );
};
