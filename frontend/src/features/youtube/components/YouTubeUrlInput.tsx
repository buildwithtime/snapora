import React, { useState, useEffect, useRef } from 'react';
import { universalPlatformRegistry } from '../../../utils/platformDetector.js';

interface YouTubeUrlInputProps {
  onResolve: (url: string) => Promise<void>;
  onCancel: () => void;
  isLoading: boolean;
  activeCanonicalUrl?: string;
}

export const YouTubeUrlInput: React.FC<YouTubeUrlInputProps> = ({
  onResolve,
  onCancel,
  isLoading,
  activeCanonicalUrl
}) => {
  const [inputUrl, setInputUrl] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Validate format live as user types
  useEffect(() => {
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setValidationError(null);
      setDetectedFormat(null);
      return;
    }

    try {
      const detectResult = universalPlatformRegistry.detectPlatform(trimmed);

      if (detectResult.platformId !== 'youtube') {
        setValidationError('Please enter a YouTube link (e.g. youtube.com/watch?v=..., youtu.be/..., /shorts/...)');
        setDetectedFormat(null);
        return;
      }

      if (!detectResult.matched || detectResult.error) {
        setValidationError(detectResult.error || 'Invalid YouTube video URL structure.');
        setDetectedFormat(null);
        return;
      }

      // Valid YouTube URL detected
      setValidationError(null);
      const contentType = detectResult.info?.contentType;
      if (contentType === 'video') {
        if (trimmed.includes('/shorts/')) {
          setDetectedFormat('YouTube Shorts');
        } else if (trimmed.includes('/live/')) {
          setDetectedFormat('YouTube Live Stream');
        } else if (trimmed.includes('/embed/')) {
          setDetectedFormat('YouTube Embed Link');
        } else if (trimmed.includes('youtu.be/')) {
          setDetectedFormat('YouTube Shortened Link (youtu.be)');
        } else {
          setDetectedFormat('Standard YouTube Watch Video');
        }
      } else {
        setDetectedFormat('YouTube Video');
      }
    } catch {
      setValidationError('Please enter a valid URL.');
      setDetectedFormat(null);
    }
  }, [inputUrl]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputUrl.trim();
    if (!trimmed || isLoading) return;

    // Check duplicate
    if (activeCanonicalUrl && trimmed === activeCanonicalUrl) {
      setValidationError('This video is already loaded in the workspace.');
      return;
    }

    // Final detection check
    const detectResult = universalPlatformRegistry.detectPlatform(trimmed);
    if (!detectResult.matched || detectResult.platformId !== 'youtube' || !detectResult.info?.canonicalUrl) {
      setValidationError(detectResult.error || 'Please enter a supported YouTube video URL.');
      return;
    }

    setValidationError(null);
    await onResolve(detectResult.info.canonicalUrl);
  };

  const handlePaste = async () => {
    try {
      if (navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text) {
          setInputUrl(text);
          inputRef.current?.focus();
        }
      }
    } catch {
      // Clipboard read blocked, user can paste via Ctrl+V / Cmd+V
      inputRef.current?.focus();
    }
  };

  const handleClear = () => {
    setInputUrl('');
    setValidationError(null);
    setDetectedFormat(null);
    inputRef.current?.focus();
  };

  return (
    <div
      className="glass-panel"
      style={{
        padding: '1.75rem',
        marginBottom: '2rem',
        borderRadius: 'var(--radius-md)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '1.25rem' }} role="img" aria-label="YouTube">▶️</span>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
            YouTube Video Resolver
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handlePaste}
            disabled={isLoading}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}
            title="Paste from clipboard"
          >
            📋 Paste
          </button>
          {inputUrl && (
            <button
              type="button"
              onClick={handleClear}
              disabled={isLoading}
              className="btn btn-secondary"
              style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem' }}
              title="Clear input"
            >
              ✕ Clear
            </button>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px', position: 'relative' }}>
            <input
              ref={inputRef}
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Paste YouTube URL (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...)"
              disabled={isLoading}
              style={{
                width: '100%',
                padding: '0.8rem 1rem',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-input)',
                border: `1px solid ${validationError ? 'var(--status-failed)' : detectedFormat ? 'var(--status-ready)' : 'var(--border-subtle)'}`,
                color: 'var(--text-main)',
                fontSize: '0.95rem',
                outline: 'none',
                transition: 'var(--transition)'
              }}
              aria-label="YouTube video URL"
              aria-invalid={Boolean(validationError)}
            />
          </div>

          {isLoading ? (
            <button
              type="button"
              onClick={onCancel}
              className="btn btn-secondary"
              style={{
                background: 'rgba(244, 63, 94, 0.15)',
                borderColor: 'var(--status-failed)',
                color: 'var(--status-failed)'
              }}
            >
              🛑 Cancel
            </button>
          ) : (
            <button
              type="submit"
              disabled={!inputUrl.trim() || Boolean(validationError)}
              className="btn btn-primary"
              style={{ minWidth: '140px' }}
            >
              Resolve Video
            </button>
          )}
        </div>

        {/* Live Format / Validation Feedback */}
        {validationError && (
          <div
            style={{
              fontSize: '0.84rem',
              color: 'var(--status-failed)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
            role="alert"
          >
            <span>⚠️</span> {validationError}
          </div>
        )}

        {detectedFormat && !validationError && (
          <div
            style={{
              fontSize: '0.82rem',
              color: 'var(--status-ready)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <span>✓</span> Detected: <strong>{detectedFormat}</strong>
          </div>
        )}

        {/* Supported Format Helper Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Supported:</span>
          {['watch?v=', 'youtu.be/', '/shorts/', '/live/', '/embed/'].map((format) => (
            <span
              key={format}
              style={{
                fontSize: '0.72rem',
                padding: '0.15rem 0.45rem',
                borderRadius: '4px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontFamily: 'monospace'
              }}
            >
              {format}
            </span>
          ))}
          <span
            style={{
              fontSize: '0.72rem',
              padding: '0.15rem 0.45rem',
              borderRadius: '4px',
              background: 'rgba(244, 63, 94, 0.08)',
              border: '1px solid rgba(244, 63, 94, 0.2)',
              color: 'var(--status-failed)'
            }}
          >
            Playlists/Channels Unsupported
          </span>
        </div>
      </form>
    </div>
  );
};
