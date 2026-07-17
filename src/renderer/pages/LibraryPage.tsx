import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAPI } from '../lib/ipc';
import { PromptCard } from '../components/library/PromptCard';
import { EmptyState } from '../components/shared/EmptyState';
import { Spinner } from '../components/shared/Spinner';
import { Button } from '../components/shared/Button';
import { showToast } from '../components/shared/Toast';
import { Modal } from '../components/shared/Modal';
import { TextInput } from '../components/shared/TextInput';
import type { PromptListItem, Tag } from '../../shared/types';

const PAGE_SIZE = 48;

export function LibraryPage() {
  const nav = useNavigate();
  const allPrompts = useRef<PromptListItem[]>([]);
  const allTags = useRef<Tag[]>([]);
  const [displayList, setDisplayList] = useState<PromptListItem[]>([]);
  const [booting, setBooting] = useState(true);

  // Batch selection
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; prompt: PromptListItem } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectMode, setSelectMode] = useState(false);

  // filters
  const [filterRes, setFilterRes] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [searchText, setSearchText] = useState('');
  const [chips, setChips] = useState<string[]>([]);

  // + input
  const [showAdd, setShowAdd] = useState(false);
  const [chipText, setChipText] = useState('');
  const addRef = useRef<HTMLInputElement>(null);
  const [renameIdx, setRenameIdx] = useState<number | null>(null);
  const [renameText, setRenameText] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  // Batch tag modal
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [batchTagName, setBatchTagName] = useState('');

  const distinctModels = useMemo(() => {
    const s = new Set<string>();
    allPrompts.current.forEach(p => { if (p.model) s.add(p.model); });
    return [...s].sort();
  }, [displayList]);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); };
  }, [contextMenu]);

  const loadAll = async () => {
    const api = getAPI();
    const [p, t] = await Promise.all([api.prompts.list({ pageSize: 9999 }), api.tags.all()]);
    allPrompts.current = p.items;
    allTags.current = t;
    setDisplayList(p.items.slice(0, PAGE_SIZE));
    setTags(t);
    setSelectedIds(new Set());
    setBooting(false);
  };

  useEffect(() => { loadAll(); }, []);

  useEffect(() => {
    const handler = () => {
      console.log('[Library] files-changed, reloading');
      loadAll();
    };
    try {
      const api = getAPI();
      const unsub = api.onFilesChanged(handler);
      return () => unsub();
    } catch {}
  }, []);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIds(new Set(displayList.map(p => p.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    setSelectMode(false);
  };

  const batchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`确认删除 ${selectedIds.size} 条记录？此操作不可撤销。`)) return;
    try {
      await getAPI().prompts.batchDelete([...selectedIds]);
      showToast('success', `已删除 ${selectedIds.size} 条`);
      await loadAll();
    } catch (err: any) {
      showToast('error', '批量删除失败: ' + (err.message || ''));
    }
  };

  const openTagModal = () => {
    if (selectedIds.size === 0) return;
    setBatchTagName('');
    setTagModalOpen(true);
  };

  const batchTag = async () => {
    if (!batchTagName.trim()) return;
    setTagModalOpen(false);
    try {
      const api = getAPI();
      const tag = await api.tags.create(batchTagName.trim());
      for (const promptId of selectedIds) {
        const promptTags = await api.tags.getForPrompt(promptId);
        const ids = promptTags.map(t => t.id);
        if (!ids.includes(tag.id)) ids.push(tag.id);
        await api.tags.setForPrompt(promptId, ids);
      }
      showToast('success', `已为 ${selectedIds.size} 条记录添加标签 "${batchTagName.trim()}"`);
      await loadAll();
    } catch (err: any) {
      showToast('error', '批量打标签失败: ' + (err.message || ''));
    }
    setBatchTagName('');
  };

  // Right-click context menu actions
  const getCM = () => contextMenu?.prompt;
  const cmCopyPositive = async () => {
    const p = getCM(); if (!p) return;
    await navigator.clipboard.writeText(p.positive);
    showToast('success', '已复制正面提示词');
    setContextMenu(null);
  };
  const cmCopyNegative = async () => {
    const p = getCM(); if (!p) return;
    await navigator.clipboard.writeText(p.negative);
    showToast('success', '已复制负面提示词');
    setContextMenu(null);
  };
  const cmOpenFolder = async () => {
    const p = getCM(); if (!p || !p.primary_file_path) return;
    try {
      const images = await getAPI().images.getForPrompt(p.id);
      if (images.length > 0) { await getAPI().images.openFolder(images[0].id); }
    } catch {}
    setContextMenu(null);
  };
  const cmDelete = async () => {
    const p = getCM(); if (!p) return;
    if (!window.confirm('确认删除？此操作不可撤销。')) return;
    try {
      await getAPI().prompts.delete(p.id);
      showToast('success', '已删除');
      await loadAll();
    } catch (err: any) {
      showToast('error', '删除失败: ' + (err.message || ''));
    }
    setContextMenu(null);
  };

  const applyFilter = (kw: string, cs: string[], res: string, mdl: string) => {
    const q = kw.trim().toLowerCase();
    const filtered = allPrompts.current.filter(p => {
      if (res) {
        const [rw, rh] = res.split('x').map(Number);
        if (p.width !== rw || p.height !== rh) return false;
      }
      if (mdl) {
        if (p.model !== mdl) return false;
      }
      if (q) {
        const hay = (p.positive + ' ' + p.negative + ' ' + p.model + ' ' + p.sampler).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (cs.length) {
        const hay = (p.positive + ' ' + p.negative + ' ' + p.model + ' ' + p.sampler).toLowerCase();
        if (!cs.every(c => hay.includes(c.toLowerCase()))) return false;
      }
      return true;
    });
    setDisplayList(filtered.slice(0, PAGE_SIZE));
    setSelectedIds(new Set());
  };

  const setFilter = (which: 'res' | 'model' | 'search' | 'chips', val: any) => {
    if (which === 'res') { setFilterRes(val); applyFilter(searchText, chips, val, filterModel); }
    else if (which === 'model') { setFilterModel(val); applyFilter(searchText, chips, filterRes, val); }
    else if (which === 'search') { setSearchText(val); applyFilter(val, chips, filterRes, filterModel); }
    else if (which === 'chips') { setChips(val); applyFilter(searchText, val, filterRes, filterModel); }
  };

  const addChip = (text: string) => {
    const val = text.trim();
    if (!val || chips.includes(val)) { setChipText(''); setShowAdd(false); return; }
    const next = [...chips, val];
    setFilter('chips', next);
    setChipText(''); setShowAdd(false);
  };

  const removeChip = (idx: number) => {
    const next = chips.filter((_, i) => i !== idx);
    setFilter('chips', next);
  };

  const startRename = (idx: number) => { setRenameIdx(idx); setRenameText(chips[idx]); setTimeout(() => document.getElementById('chip-rename')?.focus(), 50); };
  const commitRename = () => {
    if (renameIdx === null || !renameText.trim()) { setRenameIdx(null); return; }
    const next = chips.map((c, i) => i === renameIdx ? renameText.trim() : c);
    setFilter('chips', next);
    setRenameIdx(null);
  };

  const sugg = chipText.trim()
    ? tags.filter(t => t.name.toLowerCase().includes(chipText.toLowerCase()) && !chips.includes(t.name)).slice(0, 6)
    : [];

  // Resolutions ranked by frequency, split at 5% threshold
  const resolutionGroups = useMemo(() => {
    const total = allPrompts.current.length;
    const count: Record<string, number> = {};
    allPrompts.current.forEach(p => {
      if (p.width && p.height) {
        const key = `${p.width}x${p.height}`;
        count[key] = (count[key] || 0) + 1;
      }
    });
    const sorted = Object.entries(count)
      .sort((a, b) => b[1] - a[1])
      .map(([res, n]) => ({ res, count: n, pct: n / total }));
    const primary = sorted.filter(r => r.pct > 0.05);
    const other = sorted.filter(r => r.pct <= 0.05);
    return { primary, other };
  }, [displayList]);
  const filteredCount = displayList.length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          图库 <span className="text-sm font-normal text-gray-400">{filteredCount}{allPrompts.current.length ? `/${allPrompts.current.length}` : ''}</span>
        </h2>
        <div className="flex gap-2">
          {selectMode && (
            <>
              <Button variant="ghost" size="sm" onClick={selectAll}>全选</Button>
              <Button variant="ghost" size="sm" onClick={clearSelection}>取消</Button>
              <Button variant="danger" size="sm" onClick={batchDelete} disabled={selectedIds.size === 0}>
                删除 ({selectedIds.size})
              </Button>
              <Button variant="secondary" size="sm" onClick={openTagModal} disabled={selectedIds.size === 0}>
                标签 ({selectedIds.size})
              </Button>
            </>
          )}
          <button onClick={async (e) => {
            e.stopPropagation();
            setBooting(true);
            try {
              const api = getAPI();
              const r = await api.images.scanImages();
              const parts: string[] = [];
              if (r.cleaned) parts.push('清理' + r.cleaned + '条');
              if (r.imported) parts.push('导入' + r.imported + '张');
              if (r.fixedThumbs) parts.push('修复' + r.fixedThumbs + '缩略图');
              showToast('success', parts.length ? parts.join(' ') : '无变化');
            } catch (err: any) {
              showToast('error', '刷新失败: ' + (err.message || ''));
            }
            await loadAll();
          }} className="p-2 rounded-lg border border-border text-gray-400 hover:text-gray-600 text-sm" title="刷新图库">刷新</button>
          <Button onClick={() => { setSelectMode(true); }} variant="secondary" size="sm">选择</Button>
          <Button onClick={() => nav('/import')} size="sm">+ 导入</Button>
        </div>
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-2 mb-2">
        <select value={filterRes} onChange={e => setFilter('res', e.target.value)}
          className="px-2 py-1.5 text-xs border border-border rounded-lg bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:outline-none focus:border-blue-400">
          <option value="">全部尺寸</option>
          {resolutionGroups.primary.map(r => (
            <option key={r.res} value={r.res}>{r.res} ({r.count})</option>
          ))}
          {resolutionGroups.other.length > 0 && (
            <optgroup label="其他 (&lt;5%)">
              {resolutionGroups.other.map(r => (
                <option key={r.res} value={r.res}>{r.res} ({r.count})</option>
              ))}
            </optgroup>
          )}
        </select>
        <select value={filterModel} onChange={e => setFilter('model', e.target.value)}
          className="px-2 py-1.5 text-xs border border-border rounded-lg bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:outline-none focus:border-blue-400 max-w-[200px] truncate">
          <option value="">全部底模</option>
          {distinctModels.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {(filterRes || filterModel) && (
          <button onClick={() => { setFilterRes(''); setFilterModel(''); applyFilter(searchText, chips, '', ''); }}
            className="text-xs text-gray-400 hover:text-gray-600 shrink-0">清除筛选</button>
        )}
      </div>

      {/* Search row */}
      <div className="flex items-center gap-1 mb-2 overflow-x-auto flex-nowrap pb-1">
        <input value={searchText}
          onChange={e => setFilter('search', e.target.value)}
          placeholder="搜索..."
          className="w-44 shrink-0 px-2 py-1.5 text-sm border-2 border-blue-200 rounded-lg
                     bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                     placeholder-gray-400 focus:outline-none focus:border-blue-400" />

        {!showAdd && (
          <button onClick={() => { setShowAdd(true); setChipText(''); setTimeout(() => addRef.current?.focus(), 50); }}
            className="shrink-0 px-2 py-1.5 rounded-lg border border-border bg-white dark:bg-gray-800
                       text-sm text-gray-400 hover:text-blue-500 font-medium">+</button>
        )}

        {showAdd && (
          <div className="relative shrink-0">
            <input ref={addRef} value={chipText} onChange={e => setChipText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addChip(chipText); if (e.key === 'Escape') { setShowAdd(false); setChipText(''); } }}
              placeholder="关键词..."
              className="w-28 px-2 py-1.5 text-sm border-2 border-blue-400 rounded-lg
                         bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none" />
            <button onClick={() => { setShowAdd(false); setChipText(''); }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">x</button>
            {sugg.length > 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 bg-white dark:bg-gray-800 border border-border rounded-lg shadow-lg w-40 overflow-hidden">
                {sugg.map(t => <button key={t.id}
                  onMouseDown={() => { setChipText(t.name); addChip(t.name); }}
                  className="w-full text-left px-2 py-1 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-700 dark:text-gray-300">
                  {t.name} <span className="text-gray-400">{t.prompt_count}</span></button>)}
              </div>)}
          </div>
        )}

        {chips.map((c, i) => {
          if (renameIdx === i) {
            return <input key={i} id="chip-rename" value={renameText} onChange={e => setRenameText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenameIdx(null); }}
              onBlur={commitRename}
              className="w-24 shrink-0 px-2 py-1.5 text-sm border-2 border-blue-400 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none" />;
          }
          return (
            <button key={i} onClick={() => startRename(i)}
              className="shrink-0 px-2 py-1.5 rounded-lg text-sm border border-blue-200 bg-blue-50 dark:bg-blue-900/20 text-blue-600 hover:border-red-300">
              {c}
              <span onClick={e => { e.stopPropagation(); removeChip(i); }} className="ml-1 text-gray-400 hover:text-red-500 text-xs">x</span>
            </button>
          );
        })}

        {chips.length > 0 && (
          <button onClick={() => setFilter('chips', [])}
            className="shrink-0 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600">清除</button>)}
      </div>

      {/* Content */}
      {booting ? (
        <div className="flex-1 flex items-center justify-center"><Spinner className="w-8 h-8 text-blue-500" /></div>
      ) : allPrompts.current.length === 0 ? (
        <div className="flex-1 flex items-center justify-center"><EmptyState title="还没有图片" description="导入 ComfyUI 生成的图片" actionLabel="导入图片" onAction={() => nav('/import')} /></div>
      ) : filteredCount === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-gray-400"><p>无匹配结果</p><button onClick={() => { setFilterRes(''); setFilterModel(''); setSearchText(''); setFilter('chips', []); }} className="text-blue-500 hover:underline text-xs">清除全部筛选</button></div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">
            {displayList.map(p => (
              <div key={p.id} className="relative" onContextMenu={(e) => {
                if (selectMode) return;
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, prompt: p });
              }}>
                {selectMode && (
                  <div
                    className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center cursor-pointer
                      ${selectedIds.has(p.id) ? 'bg-blue-500 border-blue-500' : 'bg-white/80 border-gray-400'}`}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(p.id); }}
                  >
                    {selectedIds.has(p.id) && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                )}
                <PromptCard
                  prompt={p}
                  onClick={() => {
                    if (selectMode) { toggleSelect(p.id); }
                    else nav(`/prompt/${p.id}`);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Batch tag modal */}
      <Modal open={tagModalOpen} onClose={() => setTagModalOpen(false)} title="批量添加标签" size="sm">
        <p className="text-xs text-gray-500 mb-3">
          为选中的 {selectedIds.size} 条记录添加标签
        </p>
        <input
          value={batchTagName}
          onChange={e => setBatchTagName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') batchTag(); if (e.key === 'Escape') setTagModalOpen(false); }}
          placeholder="输入标签名..."
          autoFocus
          className="w-full px-3 py-2 text-sm border border-border rounded-lg
            bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100
            focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
        />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setTagModalOpen(false)}>取消</Button>
          <Button onClick={batchTag} disabled={!batchTagName.trim()}>确认</Button>
        </div>
      </Modal>
      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 border border-border rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <MenuBtn onClick={() => { nav(`/prompt/${contextMenu.prompt.id}`); setContextMenu(null); }}>
            查看详情
          </MenuBtn>
          {contextMenu.prompt.positive && (
            <MenuBtn onClick={cmCopyPositive}>复制正面提示词</MenuBtn>
          )}
          {contextMenu.prompt.negative && (
            <MenuBtn onClick={cmCopyNegative}>复制负面提示词</MenuBtn>
          )}
          <MenuBtn onClick={cmOpenFolder}>打开文件位置</MenuBtn>
          <div className="border-t border-border my-1" />
          <MenuBtn onClick={cmDelete} danger>删除</MenuBtn>
        </div>
      )}
    </div>
  );
}

function MenuBtn({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-sm transition-colors
        ${danger
          ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/20'}`}
    >
      {children}
    </button>
  );
}
