import React, { useState } from 'react';

export const SecurityBanner: React.FC = () => {
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false);
  const [showAboutDetails, setShowAboutDetails] = useState(false);

  return (
    <footer
      aria-label="Application Footer"
      className="glass-panel"
      style={{
        marginTop: '3.5rem',
        marginBottom: '2rem',
        padding: '1.5rem',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-sm)',
        fontSize: '0.82rem',
        color: 'var(--text-secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem'
      }}
    >
      {/* Top Footer Row: Branding & Quick Links */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          paddingBottom: '1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span style={{ fontSize: '1.2rem' }} aria-hidden="true">⚡</span>
          <div>
            <strong style={{ color: 'var(--text-main)', fontSize: '0.95rem' }}>Snapora Media Queue</strong>
            <span style={{ margin: '0 0.5rem', color: 'var(--text-muted)' }}>·</span>
            <span style={{ color: 'var(--text-secondary)' }}>Clean, private Instagram media queue</span>
          </div>
        </div>

        <nav aria-label="Footer links" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              setShowAboutDetails(!showAboutDetails);
              setShowPrivacyDetails(false);
            }}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.76rem', padding: '0.3rem 0.65rem' }}
            aria-expanded={showAboutDetails}
          >
            {showAboutDetails ? 'Hide About' : 'About'}
          </button>

          <button
            type="button"
            onClick={() => {
              setShowPrivacyDetails(!showPrivacyDetails);
              setShowAboutDetails(false);
            }}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.76rem', padding: '0.3rem 0.65rem' }}
            aria-expanded={showPrivacyDetails}
          >
            {showPrivacyDetails ? 'Hide Privacy' : 'Privacy & Security'}
          </button>

          <a
            href="https://github.com/buildwithtime/snapora"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--accent-cyan)',
              textDecoration: 'none',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.8rem'
            }}
          >
            <span>Open source on GitHub</span>
            <span aria-hidden="true">↗</span>
          </a>

          <a
            href="https://github.com/buildwithtime/snapora/issues"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--text-muted)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.8rem'
            }}
          >
            <span>Report an Issue</span>
            <span aria-hidden="true">↗</span>
          </a>
        </nav>
      </div>

      {/* Expandable About Section */}
      {showAboutDetails && (
        <div
          style={{
            padding: '1rem',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            lineHeight: 1.5
          }}
        >
          <strong style={{ color: 'var(--text-main)', fontSize: '0.85rem' }}>About Snapora</strong>
          <p style={{ margin: 0 }}>
            Snapora is an open-source, client-first media utility engineered for reliability, safety, and transparency.
            It processes supported public Instagram URLs sequentially using an IndexedDB-backed queue state machine,
            allowing users to download individual slides, complete albums, or export ZIP archives without tracking,
            advertisements, or account requirements.
          </p>
        </div>
      )}

      {/* Expandable Privacy & Security Disclosure */}
      {showPrivacyDetails && (
        <div
          style={{
            padding: '1rem',
            background: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            lineHeight: 1.5
          }}
        >
          <strong style={{ color: 'var(--text-main)', fontSize: '0.85rem' }}>Privacy & Security Transparency</strong>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            <li>
              <strong>Zero Credential Collection:</strong> Snapora does not ask for, accept, or store Instagram passwords, session cookies, personal account tokens, or authentication credentials.
            </li>
            <li>
              <strong>Browser-Local Queue & History:</strong> Your download queue, processing history, and user preferences are stored exclusively on your device within browser IndexedDB and localStorage. They are never synced to a remote database and can be cleared at any time.
            </li>
            <li>
              <strong>URLs Transmitted for Media Resolution:</strong> When you fetch media, the requested Instagram URL is transmitted over HTTPS to the Snapora backend service solely to resolve media metadata and stream content on your behalf.
            </li>
            <li>
              <strong>Third-Party Requests to Instagram / Meta:</strong> To retrieve post metadata and media streams, the backend connects directly to Meta's public oEmbed API, Graph API, or official Instagram CDN edge nodes. Snapora does not access private content or bypass platform authentication.
            </li>
            <li>
              <strong>Stateless Backend & SSRF Protection:</strong> The backend maintains no persistent database or user accounts. All outgoing requests undergo strict hostname allowlisting and socket-level DNS filtering to block internal, private, and cloud metadata addresses (SSRF defense).
            </li>
            <li>
              <strong>Ephemeral Media Streaming:</strong> Binary media chunks are streamed transiently through the proxy for magic-byte verification and delivery. No downloaded photos or videos are stored or cached on backend disk storage.
            </li>
            <li>
              <strong>Operational Server Logging:</strong> The Fastify backend records standard transient HTTP connection logs (timestamp, method, path, response status, and IP for rate limiting) strictly for server reliability and abuse prevention. No user identity profiles are constructed.
            </li>
          </ul>
        </div>
      )}

      {/* Compact Static Security Summary */}
      {!showPrivacyDetails && !showAboutDetails && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            fontSize: '0.78rem',
            color: 'var(--text-muted)'
          }}
        >
          <span>🛡️ Client-first architecture · Zero credentials collected · Local IndexedDB persistence · SSRF-protected proxy</span>
          <span>MIT License © Snapora Contributors</span>
        </div>
      )}
    </footer>
  );
};
