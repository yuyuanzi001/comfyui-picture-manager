import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getAPI } from '../lib/ipc';
import { useUIStore } from '../lib/store';
import { showToast } from '../components/shared/Toast';
import { Button } from '../components/shared/Button';
import { Spinner } from '../components/shared/Spinner';

// Map thumbnail pixel size → CSS card display size
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
  const [loaded, setLoaded] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const api = getAPI();
        const [savedTheme, savedThumb] = await Promise.all([
          api.app.getSetting('theme'),
          api.app.getSetting('thumbnail_size'),
        ]);
        setTheme(savedTheme || 'system');
        const size = savedThumb || '256';
        setThumbSize(size);
        setThumbDisplay(pxToCardSize(parseInt(size)));
        setLoaded(true);
      } catch (err) {
        console.error('Failed to load settings:', err);
        setLoaded(true);
      }
    }
    load();
  }, [setThumbDisplay]);

  const handleThumbSizeChange = async (value: string) => {
    setThumbSize(value);
    setThumbDisplay(pxToCardSize(parseInt(value)));
    try {
      await getAPI().app.setSetting('thumbnail_size', value);
    } catch (err) {
      console.error('Failed to save thumbnail size:', err);
    }
  };

  const handleThemeChange = async (value: string) => {
    setTheme(value);
    applyTheme(value);
    try {
      await getAPI().app.setSetting('theme', value);
      showToast('success', '主题已更新');
    } catch (err: any) {
      showToast('error', err.message || '保存失败');
    }
  };

  const handleRebuildThumbs = async () => {
    if (rebuilding) return;
    setRebuilding(true);
    try {
      const result = await getAPI().images.rebuildThumbs();

      // Clear all cached queries so library re-fetches fresh thumbnails
      queryClient.clear();

      if (result.total === 0) {
        showToast('info', '没有图片，请先导入图片再试');
      } else if (result.rebuilt > 0) {
        showToast('success', `已重建 ${result.rebuilt}/${result.total} 张 (${result.size}px)`);
        // Auto-navigate to library so thumbnails reload
        setTimeout(() => navigate('/'), 800);
      } else {
        showToast('error', `重建失败：${result.failed} 张出错`);
      }
    } catch (err: any) {
      showToast('error', '重建失败: ' + (err.message || '未知错误'));
    } finally {
      setRebuilding(false);
    }
  };

  if (!loaded) {
    return (
      <div className="h-full flex flex-col">
        <h2 className="text-2xl font-bold mb-6">设置</h2>
        <div className="animate-pulse space-y-4 max-w-xl">
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">设置</h2>
      <div className="space-y-4 max-w-xl">

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-border">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">主题</h3>
          <p className="text-xs text-gray-500 mb-3">切换后立即生效</p>
          <select
            value={theme}
            onChange={e => handleThemeChange(e.target.value)}
            className="border border-border rounded-lg px-3 py-2 text-sm bg-surface
                       text-gray-700 dark:text-gray-300 cursor-pointer"
          >
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-border">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">缩略图大小</h3>
          <p className="text-xs text-gray-500 mb-3">
            修改后点击「应用到全部」即可重新生成所有缩略图
          </p>
          <div className="flex items-center gap-3">
            <select
              value={thumbSize}
              onChange={e => handleThumbSizeChange(e.target.value)}
              className="border border-border rounded-lg px-3 py-2 text-sm bg-surface
                         text-gray-700 dark:text-gray-300 cursor-pointer"
            >
              <option value="128">128px</option>
              <option value="256">256px（默认）</option>
              <option value="384">384px</option>
              <option value="512">512px</option>
            </select>
            <Button
              variant="primary"
              size="sm"
              onClick={handleRebuildThumbs}
              disabled={rebuilding}
            >
              {rebuilding ? (
                <span className="flex items-center gap-2"><Spinner className="w-3.5 h-3.5" /> 重建中...</span>
              ) : '应用到全部'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/')}
            >
              去图库查看
            </Button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-border">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">关于</h3>
          <p className="text-sm text-gray-500">ComfyUI Picture Manager v1.0.0</p>
          <p className="text-sm text-gray-500">存储和管理你的 AI 生成图片与提示词</p>
          <p className="text-sm text-gray-500 mt-1">
            数据位置：<code className="text-xs bg-surface-hover px-1 rounded">%APPDATA%/comfyui-picture-manager/</code>
          </p>
        </div>
      </div>
    </div>
  );
}

export function applyTheme(value: string) {
  const root = document.documentElement;
  if (value === 'dark') {
    root.classList.add('dark');
  } else if (value === 'light') {
    root.classList.remove('dark');
  } else {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }
}
