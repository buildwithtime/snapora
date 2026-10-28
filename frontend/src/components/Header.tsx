import React from 'react';
import { useQueue } from '../context/QueueContext.js';

export const Header: React.FC = () => {
  const { state } = useQueue();

  const activeJob = state.jobs.find((j) => j.status === 'fetching');
  const queuedCount = state.jobs.filter((j) => j.status === 'queued').length;

  return (
    <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div
          style={{
            width: '46px',
            height: '46px',
            borderRadius: '12px',
            background: 'var(--accent-gradient)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--accent-glow)',
            fontSize: '1.4rem'
          }}
        >
          ⚡
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', background: 'linear-gradient(to right, #ffffff, #cbd5e1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Snapora
            </h1>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '0.2rem 0.5rem',
                borderRadius: '4px',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#a5b4fc',
                border: '1px solid rgba(99, 102, 241, 0.3)'
              }}
            >
              Open Source v0.1
            </span>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Sequential, privacy-focused media queue engine with IndexedDB persistence
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          padding: '0.5rem 0.9rem',
          borderRadius: '20px',
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid var(--border-subtle)',
          fontSize: '0.82rem'
        }}
      >
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: state.isPaused
              ? 'var(--status-queued)'
              : activeJob
              ? 'var(--status-fetching)'
              : 'var(--status-ready)',
            boxShadow: state.isPaused
              ? '0 0 8px var(--status-queued)'
              : activeJob
              ? '0 0 10px var(--status-fetching)'
              : '0 0 8px var(--status-ready)'
          }}
        />
        <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
          {state.isPaused
            ? 'Queue Paused'
            : activeJob
            ? `Resolving shortcode ${activeJob.shortcode}...`
            : queuedCount > 0
            ? `${queuedCount} in queue`
            : 'Engine Idle'}
        </span>
      </div>
    </header>
  );
};
