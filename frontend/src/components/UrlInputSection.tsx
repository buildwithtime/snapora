import React, { useState } from 'react';
import { useQueue } from '../context/QueueContext.js';

export const UrlInputSection: React.FC = () => {
  const { addUrls } = useQueue();
  const [inputText, setInputText] = useState('');
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

  const handlePasteSample = () => {
    const sample = [
      'https://www.instagram.com/p/C_sunset_photo/',
      'https://www.instagram.com/reel/D_travel_reel/',
      'https://www.instagram.com/p/E_architecture_multi/'
    ].join('\n');
    setInputText(sample);
  };

  return (
    <section className="glass-panel" style={{ padding: '1.75rem', marginBottom: '2rem' }}>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <label
            htmlFor="url-input"
            style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <span>Add URLs to Queue</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
              (one per line or comma-separated)
            </span>
          </label>
          <button
            type="button"
            onClick={handlePasteSample}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.78rem' }}
          >
            Load Sample URLs
          </button>
        </div>

        <div style={{ position: 'relative' }}>
          <textarea
            id="url-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="https://www.instagram.com/p/Cxyz123/&#10;https://www.instagram.com/reel/Dabc456/&#10;https://www.instagram.com/p/Efg789/"
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
              Supports: /p/ (Posts)
            </span>
            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
              /reel/ (Reels)
            </span>
            <span style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '4px', background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
              /tv/ (IGTV)
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
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
              disabled={!inputText.trim()}
              className="btn btn-primary"
            >
              Add to Queue
            </button>
          </div>
        </div>

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
