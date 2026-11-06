import React from 'react';
import { YouTubeWorkspaceRecord } from '../types.js';

interface YouTubeHistoryProps {
  records: YouTubeWorkspaceRecord[];
  onSelectRecord: (record: YouTubeWorkspaceRecord) => void;
  onDeleteRecord: (id: string) => void;
  onRefreshRecord: (record: YouTubeWorkspaceRecord) => void;
  onClearAll: () => void;
  activeRecordId?: string;
}

export const YouTubeHistory: React.FC<YouTubeHistoryProps> = ({
  records,
  onSelectRecord,
  onDeleteRecord,
  onRefreshRecord,
  onClearAll,
  activeRecordId
}) => {
  if (records.length === 0) {
    return (
      <div
        className="glass-panel"
        style={{
          padding: '1.75rem',
          borderRadius: 'var(--radius-md)',
          textAlign: 'center'
        }}
        data-testid="youtube-history-empty"
      >
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
          Workspace History
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          No YouTube videos in your workspace history yet. Resolved videos and their notes will appear here.
        </p>
      </div>
    );
  }

  return (
    <div
      className="glass-panel"
      style={{
        padding: '1.75rem',
        borderRadius: 'var(--radius-md)'
      }}
      data-testid="youtube-history"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
            Workspace History
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.2rem 0 0 0' }}>
            Previously resolved YouTube items stored in local workspace
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '0.75rem',
              padding: '0.2rem 0.5rem',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)'
            }}
          >
            {records.length} {records.length === 1 ? 'Item' : 'Items'}
          </span>
          <button
            type="button"
            onClick={onClearAll}
            className="btn btn-secondary"
            style={{ fontSize: '0.76rem', padding: '0.3rem 0.65rem' }}
          >
            Clear History
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {records.map((record) => {
          const { id, data, notes, tags, collections, canonicalUrl } = record;
          const isSelected = activeRecordId === id;
          const isExpired = data.isExpired === true;
          const thumbUrl = data.thumbnails[0]?.url || `https://i.ytimg.com/vi/${record.videoId}/hqdefault.jpg`;

          return (
            <div
              key={id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-sm)',
                background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'rgba(0, 0, 0, 0.25)',
                border: `1px solid ${isSelected ? 'var(--border-focus)' : 'var(--border-subtle)'}`,
                transition: 'var(--transition)',
                flexWrap: 'wrap'
              }}
              data-testid={`history-item-${record.videoId}`}
            >
              {/* Thumbnail Thumbnail Thumbnail */}
              <div
                style={{
                  width: '96px',
                  height: '54px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  background: 'var(--bg-input)',
                  flexShrink: 0,
                  position: 'relative'
                }}
              >
                {!isExpired && thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={data.title}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    loading="lazy"
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                      fontSize: '0.7rem',
                      textAlign: 'center',
                      padding: '4px'
                    }}
                  >
                    {isExpired ? 'Expired' : 'No Preview'}
                  </div>
                )}
              </div>

              {/* Title & Metadata */}
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                  <h4
                    style={{
                      fontSize: '0.92rem',
                      fontWeight: 600,
                      color: 'var(--text-main)',
                      margin: 0,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis'
                    }}
                    title={data.title}
                  >
                    {data.title}
                  </h4>
                  {isExpired && (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '4px',
                        background: 'rgba(244, 63, 94, 0.15)',
                        border: '1px solid rgba(244, 63, 94, 0.3)',
                        color: 'var(--status-failed)',
                        fontWeight: 600,
                        flexShrink: 0
                      }}
                    >
                      Expired
                    </span>
                  )}
                </div>

                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span>{data.author}</span>
                  {data.durationFormatted && <span>• ⏱️ {data.durationFormatted}</span>}
                  <span>• Added {new Date(record.createdAt).toLocaleDateString()}</span>
                </div>

                {/* Notes & Tags snippet */}
                {(notes || (tags && tags.length > 0) || (collections && collections.length > 0)) && (
                  <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.35rem', alignItems: 'center' }}>
                    {tags && tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '4px',
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: 'var(--accent-indigo)'
                        }}
                      >
                        #{t}
                      </span>
                    ))}
                    {collections && collections.map((c) => (
                      <span
                        key={c}
                        style={{
                          fontSize: '0.7rem',
                          padding: '0.1rem 0.35rem',
                          borderRadius: '4px',
                          background: 'rgba(6, 182, 212, 0.15)',
                          color: 'var(--accent-cyan)'
                        }}
                      >
                        📁 {c}
                      </span>
                    ))}
                    {notes && (
                      <span
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--text-muted)',
                          fontStyle: 'italic',
                          maxWidth: '250px',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                        title={notes}
                      >
                        "{notes}"
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginLeft: 'auto', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => onSelectRecord(record)}
                  className="btn btn-primary"
                  style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
                >
                  {isSelected ? 'Viewing' : 'Reopen'}
                </button>

                {isExpired ? (
                  <button
                    type="button"
                    onClick={() => onRefreshRecord(record)}
                    className="btn btn-secondary"
                    style={{
                      fontSize: '0.78rem',
                      padding: '0.35rem 0.75rem',
                      borderColor: 'var(--status-queued)',
                      color: 'var(--status-queued)'
                    }}
                    title="Refresh expired metadata while keeping notes and tags"
                  >
                    🔄 Refresh
                  </button>
                ) : (
                  <a
                    href={canonicalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', textDecoration: 'none' }}
                  >
                    Watch ↗
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => onDeleteRecord(id)}
                  className="btn btn-secondary"
                  style={{
                    fontSize: '0.78rem',
                    padding: '0.35rem 0.55rem',
                    color: 'var(--text-muted)'
                  }}
                  title="Remove from history"
                >
                  🗑️
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
