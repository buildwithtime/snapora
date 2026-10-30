import React from 'react';
import { QueueProvider } from './context/QueueContext.js';
import { ProfileGalleryProvider } from './context/ProfileGalleryContext.js';
import { Header } from './components/Header.js';
import { UrlInputSection } from './components/UrlInputSection.js';
import { ProfileGallery } from './components/profile/ProfileGallery.js';
import { StatsBar } from './components/StatsBar.js';
import { QueueControls } from './components/QueueControls.js';
import { QueueList } from './components/QueueList.js';
import { SecurityBanner } from './components/SecurityBanner.js';

export const App: React.FC = () => {
  return (
    <QueueProvider>
      <ProfileGalleryProvider>
        <div className="container">
          <Header />
          <main>
            <UrlInputSection />
            <ProfileGallery />
            <StatsBar />
            <QueueControls />
            <QueueList />
          </main>
          <SecurityBanner />
        </div>
      </ProfileGalleryProvider>
    </QueueProvider>
  );
};

export default App;
