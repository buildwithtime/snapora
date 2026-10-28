import React from 'react';

export const SecurityBanner: React.FC = () => {
  return (
    <footer
      className="glass-panel"
      style={{
        marginTop: '3rem',
        padding: '1.25rem 1.5rem',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        fontSize: '0.8rem',
        color: 'var(--text-muted)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
        <span>🛡️ Security & Privacy Architecture</span>
      </div>
      <p>
        • <strong>Zero Credential Storage:</strong> Snapora does not ask for, accept, or store Instagram login credentials, session cookies, or user tokens.
      </p>
      <p>
        • <strong>Client-Side Persistence:</strong> Your queue history and state remain locally stored in your browser using IndexedDB. No persistent user records are created on the server.
      </p>
      <p>
        • <strong>SSRF-Safe Upstream Proxy:</strong> All upstream requests are verified against a strict domain allowlist, enforce HTTPS, and disallow internal IP addresses.
      </p>
    </footer>
  );
};
