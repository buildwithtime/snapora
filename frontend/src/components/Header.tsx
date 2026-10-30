import React from 'react';
import { useQueue } from '../context/QueueContext.js';

export const Header: React.FC = () => {
  const { state } = useQueue();

  const activeJob = state.jobs.find((j) => j.status === 'fetching');
  const queuedCount = state.jobs.filter((j) => j.status === 'queued').length;
  const showStatusBadge = state.isPaused || Boolean(activeJob) || queuedCount > 0;

  return (
    <header
      style={{
        marginBottom: '2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '1rem'
      }}
    >
      <a
        href="/"
        aria-label="Snapora Home"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          textDecoration: 'none',
          color: 'inherit',
          borderRadius: '12px',
          outlineOffset: '4px'
        }}
      >
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
            fontSize: '1.4rem',
            flexShrink: 0
          }}
          aria-hidden="true"
        >
          ⚡
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 800,
                letterSpacing: '-0.02em',
                background: 'linear-gradient(to right, #ffffff, #cbd5e1)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                margin: 0
              }}
            >
              Snapora
            </h1>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', margin: '0.2rem 0 0 0' }}>
            Fast, private Instagram media downloader
          </p>
        </div>
      </a>

      {showStatusBadge && (
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
          role="status"
          aria-live="polite"
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
              ? `Resolving ${activeJob.shortcode}...`
              : `${queuedCount} in queue`}
          </span>
        </div>
      )}
    </header>
  );
};
