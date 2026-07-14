import React, { useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { LibraryPage } from './pages/LibraryPage';
import { PromptDetailPage } from './pages/PromptDetailPage';
import { ImportPage } from './pages/ImportPage';
import { SettingsPage, applyTheme } from './pages/SettingsPage';
import { ToastContainer } from './components/shared/Toast';
import { getAPI } from './lib/ipc';

export default function App() {
  // Apply saved theme on startup
  useEffect(() => {
    async function initTheme() {
      try {
        const theme = await getAPI().app.getSetting('theme');
        applyTheme(theme || 'system');
      } catch {
        // electronAPI might not be available during dev, use system default
        applyTheme('system');
      }
    }
    initTheme();
  }, []);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = async () => {
      try {
        const theme = await getAPI().app.getSetting('theme');
        if (!theme || theme === 'system') {
          applyTheme('system');
        }
      } catch {}
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <HashRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<LibraryPage />} />
          <Route path="/prompt/:id" element={<PromptDetailPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </AppShell>
      <ToastContainer />
    </HashRouter>
  );
}
