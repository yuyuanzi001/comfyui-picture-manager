import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePromptList } from '../hooks/usePrompts';
import { useTags } from '../hooks/useTags';
import { PromptCard } from '../components/library/PromptCard';
import { EmptyState } from '../components/shared/EmptyState';
import { Spinner } from '../components/shared/Spinner';
import { Button } from '../components/shared/Button';
import type { PromptListItem } from '../../shared/types';

const PAGE_SIZE = 24;

export function LibraryPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [activeTagIds, setActiveTagIds] = useState<number[]>([]);
  const [sort, setSort] = useState<'created_at' | 'updated_at'>('created_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');

  const { data, isLoading } = usePromptList({
    page,
    pageSize: PAGE_SIZE,
    sort,
    order,
    tagIds: activeTagIds.length > 0 ? activeTagIds : undefined,
  });

  const { data: tags } = useTags();

  const toggleTag = (tagId: number) => {
    setActiveTagIds(prev =>
      prev.includes(tagId)
        ? prev.filter(id => id !== tagId)
        : [...prev, tagId]
    );
    setPage(1);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner className="w-8 h-8 text-blue-500" />
      </div>
    );
  }

  const prompts = data?.items || [];
  const totalPages = data?.totalPages || 0;
  const total = data?.total || 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          图库 {total > 0 && <span className="text-lg font-normal text-gray-400 ml-2">{total} 张</span>}
        </h2>
        <div className="flex items-center gap-3">
          <select
            value={`${sort}-${order}`}
            onChange={e => {
              const [s, o] = e.target.value.split('-') as [typeof sort, typeof order];
              setSort(s);
              setOrder(o);
            }}
            className="border border-border rounded-lg px-3 py-1.5 text-sm bg-surface text-gray-700 dark:text-gray-300"
          >
            <option value="created_at-desc">最新</option>
            <option value="created_at-asc">最早</option>
            <option value="updated_at-desc">最近更新</option>
          </select>
          <Button onClick={() => navigate('/import')} size="sm">
            + 导入
          </Button>
        </div>
      </div>

      {/* Active tag filters */}
      {activeTagIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs text-gray-400">筛选:</span>
          {activeTagIds.map(tagId => {
            const tag = tags?.find(t => t.id === tagId);
            return (
              <button
                key={tagId}
                onClick={() => toggleTag(tagId)}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs
                           bg-blue-100 text-blue-700 dark:bg-blue-800 dark:text-blue-200
                           hover:bg-red-100 hover:text-red-700"
              >
                {tag?.name || `#${tagId}`}
                <span className="ml-0.5">×</span>
              </button>
            );
          })}
          <button
            onClick={() => setActiveTagIds([])}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            清除全部
          </button>
        </div>
      )}

      {/* Content */}
      {prompts.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <EmptyState
            title="还没有提示词"
            description="导入你的第一张 ComfyUI 生成的图片，参数会自动解析"
            actionLabel="导入图片"
            onAction={() => navigate('/import')}
          />
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {prompts.map(prompt => (
                <PromptCard
                  key={prompt.id}
                  prompt={prompt}
                  onClick={() => navigate(`/prompt/${prompt.id}`)}
                />
              ))}
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                ← 上一页
              </Button>
              <span className="text-sm text-gray-500">
                {page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                下一页 →
              </Button>
            </div>
          )}
        </>
      )}

      {/* Side tags (show on left of page or as a filter section) */}
      {tags && tags.length > 0 && prompts.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-400 mb-2 mt-4">标签</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map(tag => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs
                  transition-colors ${activeTagIds.includes(tag.id)
                    ? 'bg-blue-500 text-white'
                    : 'bg-surface-hover text-gray-600 dark:text-gray-400 hover:bg-blue-100 dark:hover:bg-blue-900'
                  }`}
              >
                {tag.name}
                <span className="opacity-50">{tag.prompt_count}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
