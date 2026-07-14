import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { getAPI } from '../lib/ipc';
import { Button } from '../components/shared/Button';
import { Spinner } from '../components/shared/Spinner';
import { showToast } from '../components/shared/Toast';

export function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragCounter = useRef(0);

  // Prevent browser from treating drops as "open file"
  useEffect(() => {
    const preventDefaults = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // These MUST be prevented globally for drops to work
    document.addEventListener('dragover', preventDefaults, false);
    document.addEventListener('drop', preventDefaults, false);

    return () => {
      document.removeEventListener('dragover', preventDefaults, false);
      document.removeEventListener('drop', preventDefaults, false);
    };
  }, []);

  // Import files helper
  const doImport = useCallback(async (filePaths: string[]) => {
    setImporting(true);
    setDragOver(false);
    try {
      const result = await getAPI().images.import(filePaths, true);

      if (result.errors.length > 0) {
        for (const err of result.errors) {
          showToast('error', `${err.fileName}: ${err.error}`);
        }
      }

      if (result.importedCount > 0) {
        showToast('success', `成功导入 ${result.importedCount} 张图片！`);
        // Invalidate all queries so library re-fetches fresh data
        queryClient.invalidateQueries({ queryKey: ['prompts'] });
        queryClient.invalidateQueries({ queryKey: ['tags'] });
        navigate('/');
      } else if (result.errors.length === 0) {
        showToast('info', '未导入任何图片');
      }
    } catch (err: any) {
      console.error('Import error:', err);
      showToast('error', '导入失败: ' + (err.message || '未知错误'));
    } finally {
      setImporting(false);
    }
  }, [navigate]);

  // Click to open file dialog
  const handleClickImport = useCallback(async () => {
    const filePaths = await getAPI().dialog.openImages();
    if (filePaths.length === 0) return;
    await doImport(filePaths);
  }, [doImport]);

  // Drop event
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    dragCounter.current = 0;

    const files = Array.from(e.dataTransfer.files);
    const filePaths: string[] = [];

    for (const file of files) {
      try {
        // Use Electron's webUtils.getPathForFile (exposed via preload)
        const realPath = getAPI().getPathForFile(file);
        if (realPath) {
          filePaths.push(realPath);
        }
      } catch {
        // Fallback: try File.path (deprecated but might work)
        const f = file as File & { path?: string };
        if (f.path) {
          filePaths.push(f.path);
        }
      }
    }

    if (filePaths.length === 0) {
      showToast('error', '无法获取文件路径，请点击"选择图片文件"按钮导入');
      return;
    }

    doImport(filePaths);
  }, [doImport]);

  // Track drag enter/leave for visual feedback
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  }, []);

  if (importing) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <Spinner className="w-12 h-12 text-blue-500 mb-4" />
        <p className="text-lg text-gray-500 dark:text-gray-400">正在导入...</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
          正在解析 PNG 参数、复制图片、生成缩略图
        </p>
      </div>
    );
  }

  return (
    <div
      className="h-full flex flex-col"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragEnter}
      onDrop={handleDrop}
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 titlebar-no-drag">
        导入图片
      </h2>

      {/* Full-page drop zone */}
      <div
        className={`flex-1 flex flex-col items-center justify-center rounded-2xl border-2 transition-all duration-200
          ${dragOver
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 border-solid shadow-lg'
            : 'border-dashed border-gray-300 dark:border-gray-600 bg-surface-hover/40'
          }`}
        onClick={handleClickImport}
      >
        <svg className={`w-20 h-20 mb-4 transition-colors ${dragOver ? 'text-blue-400' : 'text-gray-300 dark:text-gray-600'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.8}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>

        {dragOver ? (
          <>
            <p className="text-xl text-blue-500 font-medium mb-2">释放鼠标以导入</p>
            <p className="text-sm text-blue-400">图片将被自动解析并保存</p>
          </>
        ) : (
          <>
            <p className="text-xl text-gray-500 dark:text-gray-400 mb-2">
              拖拽图片到此处 或 点击选择
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-8 max-w-md text-center">
              支持 PNG / JPG / WebP 格式<br />
              ComfyUI PNG 会自动解析内嵌的 workflow 参数
            </p>
            <Button size="lg">
              选择图片文件
            </Button>
          </>
        )}
      </div>

      {/* Usage tip */}
      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl border border-blue-100 dark:border-blue-800">
        <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-300 mb-2">
          💡 使用提示
        </h3>
        <ul className="text-xs text-blue-600 dark:text-blue-400 space-y-1 leading-relaxed">
          <li>• 从文件资源管理器拖拽 PNG/JPG 图片到上方区域即可导入</li>
          <li>• ComfyUI 生成的 PNG 会自动提取 Model、Sampler、Steps、CFG、Seed、提示词</li>
          <li>• 导入后可以在图库中搜索、添加标签、编辑参数</li>
        </ul>
      </div>
    </div>
  );
}
