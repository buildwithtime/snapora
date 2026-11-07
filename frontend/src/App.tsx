import React, { useState, useEffect } from 'react';
import { QueueProvider } from './context/QueueContext.js';
import { ProfileGalleryProvider } from './context/ProfileGalleryContext.js';
import { Header } from './components/Header.js';
import { UrlInputSection } from './components/UrlInputSection.js';
import { ProfileGallery } from './components/profile/ProfileGallery.js';
import { StatsBar } from './components/StatsBar.js';
import { QueueControls } from './components/QueueControls.js';
import { QueueList } from './components/QueueList.js';
import { SecurityBanner } from './components/SecurityBanner.js';
import { YouTubeWorkspace } from './features/youtube/YouTubeWorkspace.js';

export type WorkspaceTab = 'instagram' | 'youtube';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#youtube') {
      return 'youtube';
    }
    return 'instagram';
  });

  useEffect(() => {
    const handleHashChange = () => {
      if (window.location.hash === '#youtube') {
        setActiveTab('youtube');
      } else {
        setActiveTab('instagram');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const switchTab = (tab: WorkspaceTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.location.hash = tab;
    }
  };

  return (
    <QueueProvider>
      <ProfileGalleryProvider>
        <div className="container">
          <Header />

          {/* Navigation Workspace Switcher */}
          <nav
            style={{
              display: 'flex',
              gap: '0.6rem',
              marginBottom: '2rem',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '0.75rem',
              alignItems: 'center'
            }}
            role="tablist"
            aria-label="Workspace Selection"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'instagram'}
              onClick={() => switchTab('instagram')}
              className={`btn ${activeTab === 'instagram' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                borderRadius: '20px',
                fontSize: '0.86rem',
                padding: '0.45rem 1.1rem'
              }}
              data-testid="tab-instagram"
            >
              📸 Instagram Queue
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'youtube'}
              onClick={() => switchTab('youtube')}
              className={`btn ${activeTab === 'youtube' ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                borderRadius: '20px',
                fontSize: '0.86rem',
                padding: '0.45rem 1.1rem'
              }}
              data-testid="tab-youtube"
            >
              ▶️ YouTube Workspace
            </button>
          </nav>

          <main>
            {activeTab === 'instagram' ? (
              <>
                <UrlInputSection onSwitchToYouTube={() => switchTab('youtube')} />
                <ProfileGallery />
                <StatsBar />
                <QueueControls />
                <QueueList />
              </>
            ) : (
              <YouTubeWorkspace />
            )}
          </main>
          <SecurityBanner />
        </div>
      </ProfileGalleryProvider>
    </QueueProvider>
  );
};

export default App;
