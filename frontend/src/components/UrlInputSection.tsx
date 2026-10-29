import React, { useState } from 'react';
import { useQueue } from '../context/QueueContext.js';

export const UrlInputSection: React.FC = () => {
  const { addUrls, userAccessToken, setUserAccessToken } = useQueue();
  const [inputText, setInputText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'warn' | 'error' } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const result = addUrls(inputText);

    if (result.addedCount > 0) {
      const parts = [`Added ${result.addedCount} URL${result.addedCount > 1 ? 's' : ''} to queue`];
      if (result.duplicateCount > 0) {
        parts.push(`(${result.duplicateCount} duplicate${result.duplicateCount > 1 ? 's' : ''} skipped)`);
      }
      if (result.invalidCount > 0) {
        parts.push(`(${result.invalidCount} invalid skipped)`);
      }
      setFeedback({ message: parts.join(' '), type: 'success' });
      setInputText('');
    } else if (result.duplicateCount > 0) {
      setFeedback({
        message: `All ${result.duplicateCount} URL${result.duplicateCount > 1 ? 's' : ''} are already in queue`,
        type: 'warn'
      });
    } else if (result.invalidCount > 0) {
      setFeedback({
        message: 'No valid Instagram URLs recognized. Expected format: instagram.com/p/... or /reel/...',
        type: 'error'
      });
    }

    setTimeout(() => {
      setFeedback(null);
    }, 4000);
  };

  const detectedCount = inputText.trim()
    ? inputText.trim().split(/(?:\r?\n|,|\s)+/).filter(Boolean).length
    : 0;

  return (
    <section className="glass-panel" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '0.85rem' }}>
          <label
            htmlFor="url-input"
            style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}
          >
            <span>Instagram URLs</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
              (paste one or multiple links: posts, reels, carousels — one per line)
            </span>
          </label>
        </div>

        <div style={{ position: 'relative' }}>
          <textarea
            id="url-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="https://www.instagram.com/p/DfBnbDEGJSx/?utm_source=ig_web_copy_link&rpxt=...&#10;https://www.instagram.com/reel/Dabc456/&#10;https://www.instagram.com/p/Efg789/"
            rows={3}
            style={{
              width: '100%',
              background: 'var(--bg-input)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              padding: '0.9rem',
              color: 'var(--text-main)',
              fontSize: '0.88rem',
              fontFamily: 'monospace',
              resize: 'vertical',
              outline: 'none',
              transition: 'var(--transition)'
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--border-focus)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--border-subtle)')}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
              Supports: /p/ (Posts & Carousels)
            </span>
            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
              /reel/ (Reels)
            </span>
            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}>
              Multi-link queue
            </span>
            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
              Tracking params stripped
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              type="button"
              onClick={() => setShowSettings(!showSettings)}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.78rem' }}
              title="Configure Meta Graph API User Access Token"
            >
              ⚙️ {showSettings ? 'Hide Token' : 'Meta Token'}
            </button>
            {inputText && (
              <button
                type="button"
                onClick={() => setInputText('')}
                className="btn btn-secondary btn-sm"
              >
                Clear
              </button>
            )}
            <button
              type="submit"
              id="fetch-media-btn"
              disabled={!inputText.trim()}
              className="btn btn-primary"
              style={{ fontWeight: 600, padding: '0.55rem 1.25rem' }}
            >
              ⚡ Fetch Media {detectedCount > 1 ? `(${detectedCount} URLs)` : ''}
            </button>
            <button
              type="submit"
              id="add-to-queue-btn"
              disabled={!inputText.trim()}
              className="btn btn-secondary"
              style={{ fontWeight: 500, padding: '0.55rem 1rem' }}
            >
              Add to Queue
            </button>
          </div>
        </div>

        {showSettings && (
          <div
            style={{
              marginTop: '1rem',
              padding: '1rem',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            <label
              htmlFor="user-access-token"
              style={{
                display: 'block',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: 'var(--text-main)',
                marginBottom: '0.4rem'
              }}
            >
              🔑 Meta Graph API User Access Token (Optional)
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                id="user-access-token"
                type="password"
                value={userAccessToken}
                onChange={(e) => setUserAccessToken(e.target.value)}
                placeholder="EAAB... (Graph API token with instagram_basic scope)"
                style={{
                  flex: 1,
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.5rem 0.75rem',
                  color: 'var(--text-main)',
                  fontSize: '0.82rem',
                  fontFamily: 'monospace'
                }}
              />
              {userAccessToken && (
                <button
                  type="button"
                  onClick={() => setUserAccessToken('')}
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.75rem' }}
                >
                  Clear Token
                </button>
              )}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
              Used to resolve authorized media from connected professional accounts via Meta Graph API v21.0.
            </div>
          </div>
        )}

        {feedback && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.7rem 1rem',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              fontWeight: 500,
              background:
                feedback.type === 'success'
                  ? 'rgba(16, 185, 129, 0.12)'
                  : feedback.type === 'warn'
                  ? 'rgba(245, 158, 11, 0.12)'
                  : 'rgba(244, 63, 94, 0.12)',
              color:
                feedback.type === 'success'
                  ? '#34d399'
                  : feedback.type === 'warn'
                  ? '#fbbf24'
                  : '#fb7185',
              border: `1px solid ${
                feedback.type === 'success'
                  ? 'rgba(16, 185, 129, 0.3)'
                  : feedback.type === 'warn'
                  ? 'rgba(245, 158, 11, 0.3)'
                  : 'rgba(244, 63, 94, 0.3)'
              }`
            }}
          >
            {feedback.message}
          </div>
        )}
      </form>
    </section>
  );
};
