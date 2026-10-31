import React from 'react';
import { useProfileGallery } from '../../context/ProfileGalleryContext.js';

function formatNumber(num?: number): string {
  if (num === undefined || num === null) return '—';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 10_000) return `${(num / 1_000).toFixed(1)}K`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toLocaleString();
}

export const ProfileHeader: React.FC = () => {
  const { state, closeGallery } = useProfileGallery();
  const profile = state.profile;

  if (!profile) return null;

  return (
    <div className="glass-panel profile-header-container" style={{ padding: '1.75rem', marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Avatar */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <div
            style={{
              width: '84px',
              height: '84px',
              borderRadius: '50%',
              padding: '3px',
              background: 'var(--accent-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 18px rgba(99, 102, 241, 0.35)'
            }}
          >
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt={profile.username}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  objectFit: 'cover',
                  backgroundColor: 'var(--bg-surface)'
                }}
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  backgroundColor: 'var(--bg-surface)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2rem'
                }}
              >
                📸
              </div>
            )}
          </div>
        </div>

        {/* Profile Info & Stats */}
        <div style={{ flex: 1, minWidth: '260px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
              @{profile.username}
            </h2>

            {profile.isVerified && (
              <span
                title="Verified Account"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: '#0ea5e9',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 'bold'
                }}
              >
                ✓
              </span>
            )}

            {profile.isPrivate && (
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(244, 63, 94, 0.15)',
                  color: '#fb7185',
                  border: '1px solid rgba(244, 63, 94, 0.3)'
                }}
              >
                🔒 Private
              </span>
            )}
          </div>

          {profile.fullName && (
            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '0.35rem' }}>
              {profile.fullName}
            </div>
          )}

          {profile.biography && (
            <p
              style={{
                fontSize: '0.875rem',
                color: 'var(--text-secondary)',
                marginBottom: '1rem',
                whiteSpace: 'pre-line',
                maxWidth: '650px'
              }}
            >
              {profile.biography}
            </p>
          )}

          {/* Stats Bar */}
          <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <span style={{ fontWeight: 700, color: '#f8fafc', marginRight: '0.3rem' }}>
                {formatNumber(profile.postsCount ?? state.items.length)}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>posts</span>
            </div>
            {profile.followersCount !== undefined && (
              <div>
                <span style={{ fontWeight: 700, color: '#f8fafc', marginRight: '0.3rem' }}>
                  {formatNumber(profile.followersCount)}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>followers</span>
              </div>
            )}
            {profile.followingCount !== undefined && (
              <div>
                <span style={{ fontWeight: 700, color: '#f8fafc', marginRight: '0.3rem' }}>
                  {formatNumber(profile.followingCount)}
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>following</span>
              </div>
            )}
            <div
              style={{
                padding: '0.2rem 0.65rem',
                borderRadius: '8px',
                background: state.selectedIds.size > 0 ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid ' + (state.selectedIds.size > 0 ? 'rgba(99, 102, 241, 0.4)' : 'var(--border-subtle)'),
                fontSize: '0.825rem'
              }}
            >
              <strong style={{ color: state.selectedIds.size > 0 ? 'var(--accent-cyan)' : 'var(--text-main)' }}>
                {state.selectedIds.size}
              </strong>{' '}
              selected
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '0.5rem', alignSelf: 'flex-start' }}>
          <a
            href={`https://www.instagram.com/${profile.username}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            style={{ textDecoration: 'none' }}
            title="Open profile on Instagram in a new tab"
          >
            Instagram ↗
          </a>
          <button
            type="button"
            onClick={closeGallery}
            className="btn btn-secondary btn-sm"
            aria-label="Close Profile Gallery"
            title="Close Profile Gallery"
          >
            ✕ Close
          </button>
        </div>
      </div>
    </div>
  );
};
