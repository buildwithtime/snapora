import React, { useState } from 'react';
import { useProfileGallery } from '../../context/ProfileGalleryContext.js';
import { ProfileHeader } from './ProfileHeader.js';
import { SelectionToolbar } from './SelectionToolbar.js';
import { MediaGrid } from './MediaGrid.js';
import { CarouselSlideModal } from './CarouselSlideModal.js';

export const ProfileGallery: React.FC = () => {
  const { state, loadMore, closeGallery, loadProfile } = useProfileGallery();
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!state.isOpen) {
    return null;
  }

  const handleQueueAdded = (count: number) => {
    setFeedback(`Added ${count} media post${count > 1 ? 's' : ''} to download queue!`);
    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  const handleSingleQueued = () => {
    setFeedback('Added 1 media post to download queue!');
    setTimeout(() => {
      setFeedback(null);
    }, 3500);
  };

  return (
    <section
      aria-label="Instagram Profile Discovery Gallery"
      style={{
        marginTop: '1.5rem',
        marginBottom: '2.5rem',
        position: 'relative'
      }}
    >
      {/* Toast Notification */}
      {feedback && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            padding: '0.85rem 1.4rem',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: '#10b981',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '0.9rem',
            boxShadow: '0 8px 30px rgba(16, 185, 129, 0.4)',
            zIndex: 1100,
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          ✓ {feedback}
        </div>
      )}

      {/* Loading State */}
      {state.isLoading && (
        <div
          className="glass-panel"
          style={{
            padding: '3.5rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem'
          }}
        >
          <div
            className="animate-spin"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              border: '3px solid rgba(255, 255, 255, 0.1)',
              borderTopColor: 'var(--accent-cyan)'
            }}
          />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#f8fafc', margin: 0 }}>
            Discovering Instagram Profile Media...
          </h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', maxWidth: '420px', margin: 0 }}>
            Scanning public posts, Reels, and carousel albums.
          </p>
        </div>
      )}

      {/* Error State */}
      {!state.isLoading && state.error && (
        <div
          className="glass-panel"
          style={{
            padding: '2.25rem 2rem',
            textAlign: 'center',
            borderColor: 'rgba(244, 63, 94, 0.35)',
            backgroundColor: 'rgba(30, 16, 24, 0.75)'
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>
            {state.error.code === 'PRIVATE_ACCOUNT'
              ? '🔒'
              : state.error.code === 'LOGIN_WALL_ENCOUNTERED'
              ? '🛡️'
              : state.error.code === 'RATE_LIMITED'
              ? '⏳'
              : '⚠️'}
          </div>

          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fb7185', marginBottom: '0.5rem' }}>
            {state.error.code === 'PRIVATE_ACCOUNT'
              ? 'Private Instagram Account'
              : state.error.code === 'LOGIN_WALL_ENCOUNTERED'
              ? 'Instagram Login Required'
              : state.error.code === 'RATE_LIMITED'
              ? 'Rate Limit Reached'
              : 'Profile Discovery Error'}
          </h3>

          <p style={{ fontSize: '0.9rem', color: '#e2e8f0', maxWidth: '580px', margin: '0 auto 1.5rem' }}>
            {state.error.message}
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            {state.profile?.username && (
              <button
                type="button"
                onClick={() => loadProfile(state.profile!.username)}
                className="btn btn-primary btn-sm"
              >
                🔄 Retry Discovery
              </button>
            )}
            <button
              type="button"
              onClick={closeGallery}
              className="btn btn-secondary btn-sm"
            >
              ✕ Close Gallery
            </button>
          </div>
        </div>
      )}

      {/* Loaded Profile Gallery */}
      {!state.isLoading && !state.error && state.profile && (
        <>
          <ProfileHeader />
          <SelectionToolbar onQueueAdded={handleQueueAdded} />
          <MediaGrid onItemQueued={handleSingleQueued} />

          {/* Load More Button */}
          {state.pagination.hasMore && (
            <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
              <button
                type="button"
                onClick={loadMore}
                disabled={state.isLoadingMore}
                className="btn btn-secondary"
                style={{
                  minWidth: '200px',
                  padding: '0.75rem 1.75rem',
                  fontWeight: 600,
                  fontSize: '0.9rem'
                }}
              >
                {state.isLoadingMore ? (
                  <>
                    <span
                      className="animate-spin"
                      style={{
                        display: 'inline-block',
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: '2px solid rgba(255, 255, 255, 0.2)',
                        borderTopColor: '#ffffff',
                        marginRight: '0.5rem'
                      }}
                    />
                    Loading more posts...
                  </>
                ) : (
                  '⬇ Load More Posts'
                )}
              </button>
            </div>
          )}

          {/* Slide Modal */}
          <CarouselSlideModal />
        </>
      )}
    </section>
  );
};

