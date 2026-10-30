import React from 'react';
import { useProfileGallery } from '../../context/ProfileGalleryContext.js';
import { MediaCard } from './MediaCard.js';

interface MediaGridProps {
  onItemQueued?: () => void;
}

export const MediaGrid: React.FC<MediaGridProps> = ({ onItemQueued }) => {
  const { filteredItems, state } = useProfileGallery();

  if (filteredItems.length === 0) {
    return (
      <div
        className="glass-panel"
        style={{
          padding: '3rem 1.5rem',
          textAlign: 'center',
          color: 'var(--text-muted)'
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📭</div>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
          No {state.filter !== 'all' ? state.filter : 'media'} posts found
        </h3>
        <p style={{ fontSize: '0.85rem' }}>
          {state.filter !== 'all'
            ? `This profile does not have any ${state.filter} posts loaded. Try selecting 'All'.`
            : 'No media posts were retrieved for this account.'}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '1.25rem',
        marginBottom: '2rem'
      }}
    >
      {filteredItems.map((item) => (
        <MediaCard key={item.id} item={item} onSingleQueued={onItemQueued} />
      ))}
    </div>
  );
};

