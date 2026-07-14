import React from 'react';

export function SettingsPage() {
  return (
    <div className="h-full flex flex-col">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">设置</h2>
      <div className="space-y-4 max-w-xl">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-border">
          <h3 className="font-medium mb-2">缩略图大小</h3>
          <select className="border border-border rounded px-3 py-1.5 text-sm bg-surface">
            <option value="128">128px</option>
            <option value="256">256px (默认)</option>
            <option value="384">384px</option>
          </select>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-border">
          <h3 className="font-medium mb-2">主题</h3>
          <select className="border border-border rounded px-3 py-1.5 text-sm bg-surface">
            <option value="system">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-border">
          <h3 className="font-medium mb-2">关于</h3>
          <p className="text-sm text-gray-500">ComfyUI Prompt Manager v1.0.0</p>
          <p className="text-sm text-gray-500">存储和管理你的 AI 生成图片与提示词</p>
        </div>
      </div>
    </div>
  );
}
