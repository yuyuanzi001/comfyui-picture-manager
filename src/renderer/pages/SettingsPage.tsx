import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getAPI } from '../lib/ipc';
import { useUIStore } from '../lib/store';
import { showToast } from '../components/shared/Toast';
import { Button } from '../components/shared/Button';
import { Spinner } from '../components/shared/Spinner';

function pxToCardSize(px: number): number {
  if (px <= 128) return 160;
  if (px <= 256) return 240;
  if (px <= 384) return 360;
  return 480;
}

export function SettingsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setThumbDisplay = useUIStore(s => s.setThumbDisplaySize);
  const [thumbSize, setThumbSize] = useState('256');
  const [theme, setTheme] = useState('system');
  const [dataDir, setDataDir] = useState('');
  const [watchDir, setWatchDir] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [changingDir, setChangingDir] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const api = getAPI();
        const [savedTheme, savedThumb, savedDir, savedWatch] = await Promise.all([
          api.app.getSetting('theme'),
          api.app.getSetting('thumbnail_size'),
          api.app.getDataDir(),
          api.app.getSetting('watch_dir'),
        ]);
        setTheme(savedTheme || 'system');
        const size = savedThumb || '256';
        setThumbSize(size);
        setThumbDisplay(pxToCardSize(parseInt(size)));
        setDataDir(savedDir || '');
        setWatchDir(savedWatch || '');
        setLoaded(true);
      } catch (err) {
        console.error('Failed to load settings:', err);
        setLoaded(true);
      }
    })();
  }, [setThumbDisplay]);

  const handleThemeChange = async (value: string) => {
    setTheme(value); applyTheme(value);
    try { await getAPI().app.setSetting('theme', value); showToast('success', 'Theme updated'); }
    catch (err: any) { showToast('error', err.message || 'Save failed'); }
  };

  const handleThumbSizeChange = async (value: string) => {
    setThumbSize(value); setThumbDisplay(pxToCardSize(parseInt(value)));
    try { await getAPI().app.setSetting('thumbnail_size', value); } catch {}
  };

  const handleRebuildThumbs = async () => {
    if (rebuilding) return; setRebuilding(true);
    try {
      const r = await getAPI().images.rebuildThumbs();
      queryClient.clear();
      if (r.total === 0) showToast('info', 'No images');
      else if (r.rebuilt > 0) { showToast('success', 'Rebuilt ' + r.rebuilt + '/' + r.total + ' (' + r.size + 'px)'); setTimeout(() => navigate('/'), 800); }
      else showToast('error', 'Failed ' + r.failed);
    } catch (err: any) { showToast('error', 'Rebuild failed: ' + err.message); }
    finally { setRebuilding(false); }
  };

  const handleBrowseDir = async () => {
    const dir = await getAPI().dialog.openDirectory();
    if (!dir) return;
    setChangingDir(true);
    try {
      const api = getAPI();
      await api.app.setDataDir(dir);
      const actualDir = await api.app.getDataDir();
      setDataDir(actualDir);
      showToast('success', 'Data directory changed. Restart for auto-import watcher.');
      queryClient.invalidateQueries();
      navigate('/');
    } catch (err: any) { showToast('error', 'Change failed: ' + err.message); }
    finally { setChangingDir(false); }
  };

  const handleWatchDir = async () => {
    const dir = await getAPI().dialog.openDirectory();
    if (!dir) return;
    setWatchDir(dir);
    try {
      await getAPI().app.setSetting('watch_dir', dir);
      await getAPI().images.scanImages();
      showToast('success', 'Watch folder set. Images will be auto-imported.');
      queryClient.invalidateQueries();
    } catch (err: any) { showToast('error', 'Failed: ' + err.message); }
  };

  const clearWatchDir = async () => {
    setWatchDir('');
    try { await getAPI().app.setSetting('watch_dir', ''); showToast('success', 'Watch folder removed'); }
    catch {}
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const api = getAPI();
      const result = await api.app.exportData();
      if (result.success) {
        showToast('success', result.message);
      } else {
        showToast('error', result.message);
      }
    } catch (err: any) {
      showToast('error', 'Export failed: ' + (err.message || ''));
    } finally {
      setExporting(false);
    }
  };

  const openDataDir = async () => {
    try {
      const api = getAPI();
      const dir = dataDir || await api.app.getDataDir();
      await api.app.openPath(dir);
    } catch {}
  };

  if (!loaded) {
    return (
      <div className="h-full flex flex-col">
        <h2 className="text-2xl font-bold mb-6">Settings</h2>
        <div className="animate-pulse space-y-4 max-w-xl">
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">Settings</h2>
      <div className="space-y-4 max-w-xl">

        {/* Data directory */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-border">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Data Storage</h3>
          <p className="text-xs text-gray-500 mb-2">
            Database, thumbnails, and imported images are stored here.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 text-xs border border-border rounded-lg bg-surface text-gray-600 dark:text-gray-400 truncate">
              {dataDir || '%APPDATA%\\comfyui-picture-manager (default)'}
            </code>
            <Button variant="secondary" size="sm" onClick={handleBrowseDir} disabled={changingDir}>
              {changingDir ? <Spinner className="w-3.5 h-3.5" /> : 'Change'}
            </Button>
            {dataDir && (
              <Button variant="ghost" size="sm" onClick={openDataDir}>Open</Button>
            )}
          </div>
        </div>

        {/* ComfyUI output watch folder */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-border">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">ComfyUI Output Folder</h3>
          <p className="text-xs text-gray-500 mb-2">
            Set your ComfyUI output directory to auto-import generated images. Place images directly in the data folder root and click Refresh in the Library.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 text-xs border border-border rounded-lg bg-surface text-gray-600 dark:text-gray-400 truncate">
              {watchDir || 'Not configured'}
            </code>
            <Button variant="secondary" size="sm" onClick={handleWatchDir}>
              Browse
            </Button>
            {watchDir && (
              <Button variant="ghost" size="sm" onClick={clearWatchDir}>Clear</Button>
            )}
          </div>
        </div>

        {/* Theme */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-border">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Theme</h3>
          <p className="text-xs text-gray-500 mb-3">Takes effect immediately</p>
          <select value={theme} onChange={e => handleThemeChange(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-surface text-gray-700 dark:text-gray-300 cursor-pointer">
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        {/* Thumbnail */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-border">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Thumbnail Size</h3>
          <p className="text-xs text-gray-500 mb-3">Click "Apply to all" to regenerate all thumbnails</p>
          <div className="flex items-center gap-3">
            <select value={thumbSize} onChange={e => handleThumbSizeChange(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 text-sm bg-surface text-gray-700 dark:text-gray-300 cursor-pointer">
              <option value="128">128px</option>
              <option value="256">256px (default)</option>
              <option value="384">384px</option>
              <option value="512">512px</option>
            </select>
            <Button variant="primary" size="sm" onClick={handleRebuildThumbs} disabled={rebuilding}>
              {rebuilding ? <span className="flex items-center gap-2"><Spinner className="w-3.5 h-3.5" /> Rebuilding...</span> : 'Apply to all'}
            </Button>
          </div>
        </div>

        {/* Export */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-border">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Backup / Export</h3>
          <p className="text-xs text-gray-500 mb-3">
            Export your database, images, and thumbnails to a folder for backup or transfer.
          </p>
          <Button variant="secondary" size="sm" onClick={handleExport} disabled={exporting}>
            {exporting ? <span className="flex items-center gap-2"><Spinner className="w-3.5 h-3.5" /> Exporting...</span> : 'Export Data'}
          </Button>
        </div>

        {/* About */}
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-border">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">About</h3>
          <p className="text-sm text-gray-500">ComfyUI Picture Manager v1.0.3</p>
          <p className="text-sm text-gray-500">Manage your AI-generated images and prompts</p>
        </div>
      </div>
    </div>
  );
}

export function applyTheme(value: string) {
  const root = document.documentElement;
  if (value === 'dark') root.classList.add('dark');
  else if (value === 'light') root.classList.remove('dark');
  else {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) root.classList.add('dark');
    else root.classList.remove('dark');
  }
}
