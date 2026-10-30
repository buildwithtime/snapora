import React, { useState, useEffect, useRef } from 'react';
import { useQueue } from '../context/QueueContext.js';
import { getRecentDownloads, clearRecentDownloads, RecentDownloadItem } from '../utils/recentHistory.js';

export const UrlInputSection: React.FC = () => {
  const { addUrls, userAccessToken, setUserAccessToken, state } = useQueue();
  const [inputText, setInputText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [recentList, setRecentList] = useState<RecentDownloadItem[]>([]);
  const [feedback, setFeedback] = useState<{ message: string; type: 'success' | 'warn' | 'error' } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand textarea naturally as lines are added
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.max(64, scrollHeight)}px`;
    }
  }, [inputText]);

  // Sync recent items from local storage whenever jobs change or on mount
  useEffect(() => {
    setRecentList(getRecentDownloads());
  }, [state.jobs]);

  const handleAddAnotherLink = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart ?? inputText.length;
    const end = textarea.selectionEnd ?? inputText.length;

    // Insert a new blank line at cursor / selection position
    const before = inputText.substring(0, start);
    const after = inputText.substring(end);
    const newText = `${before}\n${after}`;
    const newCursorPos = start + 1;

    setInputText(newText);

    // Keep focus and position cursor onto the new line
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
      }
    });
  };

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
    }, 4500);
  };

  const handlePasteRecent = (url: string) => {
    setInputText((prev) => (prev ? `${prev.trim()}\n${url}` : url));
  };

  const handleClearHistory = () => {
    clearRecentDownloads();
    setRecentList([]);
    setShowRecent(false);
  };

  const detectedCount = inputText.trim()
    ? inputText.trim().split(/(?:\r?\n|,|\s)+/).filter(Boolean).length
    : 0;

  return (
    <section aria-label="URL Input" className="glass-panel" style={{ padding: '2rem 1.75rem', marginBottom: '2rem' }}>
      <form onSubmit={handleSubmit}>
        {/* Clean, consumer-friendly header */}
        <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h2
              style={{
                fontSize: '1.45rem',
                fontWeight: 800,
                color: 'var(--text-main)',
                letterSpacing: '-0.02em',
                marginBottom: '0.35rem'
              }}
            >
              Instagram Media Downloader
            </h2>
            <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', margin: 0 }}>
              Paste your Instagram link below to get photos and videos.
            </p>
          </div>

          {recentList.length > 0 && (
            <button
              type="button"
              onClick={() => setShowRecent(!showRecent)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-cyan)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                fontWeight: 600,
                padding: '0.25rem 0.5rem',
                borderRadius: '6px'
              }}
              aria-expanded={showRecent}
            >
              🕒 {showRecent ? 'Hide Recent Links' : `Recent Links (${recentList.length})`}
            </button>
          )}
        </div>

        {/* Expandable Recent Links Tray */}
        {showRecent && recentList.length > 0 && (
          <div
            style={{
              marginBottom: '1.25rem',
              padding: '0.9rem 1rem',
              background: 'rgba(255, 255, 255, 0.02)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Recent Links (Stored locally in your browser)
              </span>
              <button
                type="button"
                onClick={handleClearHistory}
                className="btn btn-outline-danger btn-sm"
                style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem' }}
              >
                Clear History
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', maxHeight: '130px', overflowY: 'auto' }}>
              {recentList.map((item) => (
                <button
                  key={item.id || item.shortcode}
                  type="button"
                  onClick={() => handlePasteRecent(item.url)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    padding: '0.35rem 0.65rem',
                    color: 'var(--text-main)',
                    fontSize: '0.76rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    transition: 'var(--transition)'
                  }}
                  title={`Click to paste ${item.url}`}
                >
                  <span>+</span>
                  <span>{item.shortcode}</span>
                  {item.author && <span style={{ color: 'var(--text-muted)' }}>@{item.author}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Single Visual Container for the URL input and the subtle Add Another Link action */}
        <div
          className="url-input-container"
          style={{
            position: 'relative',
            background: 'var(--bg-input)',
            border: `1px solid ${isFocused ? 'var(--border-focus)' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-sm)',
            padding: '0.85rem 1rem 0.65rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
            transition: 'var(--transition)'
          }}
        >
          <textarea
            ref={textareaRef}
            id="url-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Paste your Instagram link here..."
            rows={2}
            aria-label="Instagram link to download"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: 'var(--text-main)',
              fontSize: '0.92rem',
              fontFamily: 'inherit',
              resize: 'none',
              outline: 'none',
              lineHeight: 1.55,
              minHeight: '52px',
              maxHeight: '360px',
              overflowY: 'auto'
            }}
          />

          {/* Subtle "+ Add another link" action inside the same container positioned below entered text */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-start',
              borderTop: '1px solid rgba(255, 255, 255, 0.04)',
              paddingTop: '0.45rem'
            }}
          >
            <button
              type="button"
              id="add-another-link-btn"
              onClick={handleAddAnotherLink}
              style={{
                background: 'none',
                border: 'none',
                padding: '0.15rem 0.35rem',
                color: 'var(--text-muted)',
                fontSize: '0.8rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontWeight: 500,
                borderRadius: '4px',
                transition: 'var(--transition)'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-cyan)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              title="Insert a new line for another link"
            >
              <span style={{ fontSize: '0.95rem', fontWeight: 600, lineHeight: 1 }}>+</span>
              <span>Add another link</span>
            </button>
          </div>
        </div>

        {/* Primary Action Row with clear spacing */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.75rem' }}>
          {inputText && (
            <button
              type="button"
              onClick={() => setInputText('')}
              className="btn btn-secondary"
              style={{ fontSize: '0.85rem', padding: '0.65rem 1rem' }}
            >
              Clear
            </button>
          )}

          <button
            type="submit"
            id="fetch-media-btn"
            disabled={!inputText.trim()}
            className="btn btn-primary"
            style={{
              fontWeight: 700,
              padding: '0.65rem 1.65rem',
              fontSize: '0.94rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span>Fetch Media</span>
            {detectedCount > 1 && (
              <span
                style={{
                  fontSize: '0.75rem',
                  background: 'rgba(255, 255, 255, 0.22)',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '10px'
                }}
              >
                {detectedCount} links
              </span>
            )}
          </button>
        </div>

        {/* Subtle Advanced Options Link (Meta Token) */}
        <div style={{ marginTop: '0.85rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '0.74rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem'
            }}
            aria-expanded={showAdvanced}
          >
            <span>⚙️ {showAdvanced ? 'Hide Advanced Options' : 'Advanced: Meta Graph API Token (Optional)'}</span>
          </button>
        </div>

        {showAdvanced && (
          <div
            style={{
              marginTop: '0.75rem',
              padding: '0.9rem',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            <label
              htmlFor="user-access-token"
              style={{
                display: 'block',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: 'var(--text-main)',
                marginBottom: '0.4rem'
              }}
            >
              🔑 Optional Meta Graph API User Token
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input
                id="user-access-token"
                type="password"
                value={userAccessToken}
                onChange={(e) => setUserAccessToken(e.target.value)}
                placeholder="EAAB... (optional developer token for connected professional accounts)"
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
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
              Used to resolve authorized media from connected professional accounts via Meta Graph API v21.0.
            </div>
          </div>
        )}

        {/* Feedback message banner */}
        {feedback && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: '1.25rem',
              padding: '0.75rem 1rem',
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
