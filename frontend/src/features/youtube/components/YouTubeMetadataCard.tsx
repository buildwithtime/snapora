import React, { useState } from 'react';
import { YouTubeResolvedData } from '../types.js';

interface YouTubeMetadataCardProps {
  data: YouTubeResolvedData;
  notes?: string;
  tags?: string[];
  collections?: string[];
  onSaveUserFields?: (notes?: string, tags?: string[], collections?: string[]) => void;
  onRefreshMetadata?: () => void;
  isRefreshing?: boolean;
}

export const YouTubeMetadataCard: React.FC<YouTubeMetadataCardProps> = ({
  data,
  notes: initialNotes = '',
  tags: initialTags = [],
  collections: initialCollections = [],
  onSaveUserFields,
  onRefreshMetadata,
  isRefreshing = false
}) => {
  const [notes, setNotes] = useState(initialNotes);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>(initialTags);
  const [collectionInput, setCollectionInput] = useState(initialCollections.join(', '));
  const [showEditor, setShowEditor] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [copiedFeedback, setCopiedFeedback] = useState(false);

  const {
    title,
    author,
    authorUrl,
    canonicalUrl,
    durationFormatted,
    publishedAt,
    metadataCapability,
    metadataExpiresAt,
    isExpired
  } = data;

  const handleAddTag = (e: React.KeyboardEvent | React.MouseEvent) => {
    if ('key' in e && e.key !== 'Enter') return;
    e.preventDefault();
    const trimmed = tagInput.trim().toLowerCase().replace(/^#/, '');
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleSaveUserFields = () => {
    const parsedCollections = collectionInput
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);

    onSaveUserFields?.(notes, tags, parsedCollections);
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 2000);
  };

  const handleCopyJson = () => {
    const exportPayload = {
      title,
      author,
      canonicalUrl,
      duration: durationFormatted,
      publishedAt,
      metadataCapability,
      metadataExpiresAt,
      notes,
      tags,
      collections: collectionInput.split(',').map((c) => c.trim()).filter(Boolean)
    };
    navigator.clipboard?.writeText(JSON.stringify(exportPayload, null, 2));
    setCopiedFeedback(true);
    setTimeout(() => setCopiedFeedback(false), 2000);
  };

  const formattedExpiration = React.useMemo(() => {
    if (!metadataExpiresAt) return null;
    const date = new Date(metadataExpiresAt);
    return isNaN(date.getTime()) ? null : date.toLocaleDateString();
  }, [metadataExpiresAt]);

  return (
    <div
      className="glass-panel"
      style={{
        padding: '1.75rem',
        marginBottom: '2rem',
        borderRadius: 'var(--radius-md)'
      }}
      data-testid="youtube-metadata-card"
    >
      {/* Expiration Banner if Expired */}
      {isExpired && (
        <div
          style={{
            padding: '0.85rem 1.1rem',
            marginBottom: '1.25rem',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(244, 63, 94, 0.12)',
            border: '1px solid rgba(244, 63, 94, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}
          role="alert"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <div>
              <strong style={{ color: 'var(--status-failed)' }}>API Metadata Expired (30-day retention limit)</strong>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Upstream YouTube metadata has reached the 30-day lifecycle. Your notes, tags, and record identity remain preserved.
              </div>
            </div>
          </div>
          {onRefreshMetadata && (
            <button
              type="button"
              onClick={onRefreshMetadata}
              disabled={isRefreshing}
              className="btn btn-primary"
              style={{ fontSize: '0.82rem', padding: '0.4rem 0.85rem' }}
            >
              {isRefreshing ? 'Refreshing...' : '🔄 Refresh Metadata'}
            </button>
          )}
        </div>
      )}

      {/* Header Info */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ flex: '1 1 300px' }}>
          <h3
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: 'var(--text-main)',
              lineHeight: 1.4,
              marginBottom: '0.4rem'
            }}
          >
            {title}
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', fontSize: '0.88rem' }}>
            {authorUrl ? (
              <a
                href={authorUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: 'var(--accent-cyan)',
                  textDecoration: 'none',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.3rem'
                }}
              >
                <span>👤</span> {author} ↗
              </a>
            ) : (
              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                <span>👤</span> {author}
              </span>
            )}

            {durationFormatted && (
              <span
                style={{
                  padding: '0.15rem 0.5rem',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                  fontSize: '0.8rem',
                  fontFamily: 'monospace'
                }}
              >
                ⏱️ {durationFormatted}
              </span>
            )}

            {publishedAt && (
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                📅 {new Date(publishedAt).toLocaleDateString()}
              </span>
            )}

            <span
              style={{
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                background: metadataCapability === 'FULL_METADATA' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                border: '1px solid var(--border-subtle)',
                color: metadataCapability === 'FULL_METADATA' ? 'var(--accent-indigo)' : 'var(--text-secondary)',
                fontSize: '0.75rem',
                fontWeight: 600
              }}
            >
              {metadataCapability === 'FULL_METADATA' ? 'Full Data API Metadata' : 'oEmbed Basic Metadata'}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleCopyJson}
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
            title="Copy metadata JSON to clipboard"
          >
            {copiedFeedback ? '✓ Copied' : '📋 Copy JSON'}
          </button>
          <button
            type="button"
            onClick={() => setShowEditor(!showEditor)}
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
          >
            {showEditor ? 'Hide Notes' : '✏️ Notes & Tags'}
          </button>
        </div>
      </div>

      {/* Description / Metadata Snippet if available */}
      {data.description && (
        <div
          style={{
            padding: '0.85rem 1rem',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.86rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            marginBottom: '1rem',
            maxHeight: '120px',
            overflowY: 'auto'
          }}
        >
          {data.description}
        </div>
      )}

      {/* User Notes & Tags Section */}
      {showEditor && (
        <div
          style={{
            marginTop: '1rem',
            padding: '1.25rem',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-sm)'
          }}
          data-testid="user-notes-editor"
        >
          <h4 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-main)' }}>
            Workspace Personal Notes & Organization
          </h4>

          <div style={{ marginBottom: '0.85rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
              Personal Notes:
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add your study notes, research summary, or timestamps here..."
              rows={3}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                fontSize: '0.88rem',
                resize: 'vertical',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ marginBottom: '0.85rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
              Tags (press Enter to add):
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleAddTag}
                placeholder="e.g. tutorial, research, reference"
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-main)',
                  fontSize: '0.85rem',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="btn btn-secondary"
                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
              >
                Add Tag
              </button>
            </div>

            {tags.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '12px',
                      background: 'rgba(99, 102, 241, 0.15)',
                      border: '1px solid rgba(99, 102, 241, 0.3)',
                      color: 'var(--text-main)',
                      fontSize: '0.78rem'
                    }}
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      style={{
                        background: 'transparent',
                        border: 0,
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: '0.85rem'
                      }}
                      title={`Remove tag #${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>
              Collection / Folder (comma separated):
            </label>
            <input
              type="text"
              value={collectionInput}
              onChange={(e) => setCollectionInput(e.target.value)}
              placeholder="e.g. AI Research, React Tutorials"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-main)',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={handleSaveUserFields}
              className="btn btn-primary"
              style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
            >
              {savedFeedback ? '✓ Notes Saved' : 'Save Notes & Tags'}
            </button>
          </div>
        </div>
      )}

      {/* Footer Info: Retention policy notice */}
      <div
        style={{
          marginTop: '1.25rem',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.76rem',
          color: 'var(--text-muted)',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}
      >
        <span>
          🛡️ Stored locally under YouTube 30-day API retention policy
          {formattedExpiration ? ` (Expires ${formattedExpiration})` : ''}
        </span>
        <a
          href={canonicalUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-cyan)', textDecoration: 'none' }}
        >
          {canonicalUrl} ↗
        </a>
      </div>
    </div>
  );
};
