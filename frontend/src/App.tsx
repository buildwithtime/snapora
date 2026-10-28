import React from 'react';
import { QueueProvider } from './context/QueueContext.js';
import { Header } from './components/Header.js';
import { UrlInputSection } from './components/UrlInputSection.js';
import { StatsBar } from './components/StatsBar.js';
import { QueueControls } from './components/QueueControls.js';
import { QueueList } from './components/QueueList.js';
import { SecurityBanner } from './components/SecurityBanner.js';

export const App: React.FC = () => {
  return (
    <QueueProvider>
      <main className="container">
        <Header />
        <StatsBar />
        <UrlInputSection />
        <QueueControls />
        <QueueList />
        <SecurityBanner />
      </main>
    </QueueProvider>
  );
};

export default App;
