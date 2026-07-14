import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAPI } from '../lib/ipc';
import { PromptCard } from '../components/library/PromptCard';
import { EmptyState } from '../components/shared/EmptyState';
import { Spinner } from '../components/shared/Spinner';
import { Button } from '../components/shared/Button';
import { showToast } from '../components/shared/Toast';
import type { PromptListItem, Tag } from '../../shared/types';

const COMMON_RES = ['', '512x512', '512x768', '768x512', '768x768',
  '1024x1024', '1280x720', '1920x1080',
  '1024x1536', '1536x1024', '2048x2048'];

export function LibraryPage() {
  const nav = useNavigate();
  const allPrompts = useRef<PromptListItem[]>([]);
  const allTags = useRef<Tag[]>([]);
  const [displayList, setDisplayList] = useState<PromptListItem[]>([]);
  const [booting, setBooting] = useState(true);

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

  // derived: distinct models & resolutions in data
  const distinctModels = useMemo(() => {
    const s = new Set<string>();
    allPrompts.current.forEach(p => { if (p.model) s.add(p.model); });
    return [...s].sort();
  }, [displayList]); // recalc on reload

  const distinctResolutions = useMemo(() => {
    const s = new Set<string>();
    allPrompts.current.forEach(p => { if (p.width && p.height) s.add(`${p.width}x${p.height}`); });
    return [...s].sort();
  }, [displayList]);

  const loadAll = async () => {
    const api = getAPI();
    const [p, t] = await Promise.all([api.prompts.list({ pageSize: 9999 }), api.tags.all()]);
    allPrompts.current = p.items;
    allTags.current = t;
    setDisplayList(p.items);
    setTags(t);
    applyFilter(searchText, chips, filterRes, filterModel);
    setBooting(false);
  };

  useEffect(() => { loadAll(); }, []);

  // Listen for auto-imported files
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
    setDisplayList(filtered);
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

  // Gather all resolution options
  const resOptions = [...new Set([...COMMON_RES, ...distinctResolutions])];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          图库 <span className="text-sm font-normal text-gray-400">{displayList.length}{allPrompts.current.length ? `/${allPrompts.current.length}` : ''}</span>
        </h2>
        <div className="flex gap-2">
          <button onClick={async () => {
            const r = await getAPI().images.scanImages();
            if (r.imported > 0) showToast('success', `导入了 ${r.imported} 张新图片`);
            else showToast('info', '没有新图片');
            loadAll();
          }} className="p-2 rounded-lg border border-border text-gray-400 hover:text-gray-600 text-sm" title="扫描图片文件夹">↻ 扫描</button>
          <Button onClick={() => nav('/import')} size="sm">+ 导入</Button>
        </div>
      </div>

      {/* Filter row: resolution | model */}
      <div className="flex items-center gap-2 mb-2">
        <select value={filterRes} onChange={e => setFilter('res', e.target.value)}
          className="px-2 py-1.5 text-xs border border-border rounded-lg bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 focus:outline-none focus:border-blue-400">
          <option value="">全部尺寸</option>
          {resOptions.filter(r => r).map(r => <option key={r} value={r}>{r}</option>)}
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
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">✕</button>
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
              <span onClick={e => { e.stopPropagation(); removeChip(i); }} className="ml-1 text-gray-400 hover:text-red-500 text-xs">✕</span>
            </button>
          );
        })}

        {chips.length > 0 && (
          <button onClick={() => setFilter('chips', [])}
            className="shrink-0 px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600">清除</button>)}
      </div>

      {booting ? <div className="flex-1 flex items-center justify-center"><Spinner className="w-8 h-8 text-blue-500" /></div>
        : allPrompts.current.length === 0 ? <div className="flex-1 flex items-center justify-center"><EmptyState title="还没有图片" description="导入 ComfyUI 生成的图片" actionLabel="导入图片" onAction={() => nav('/import')} /></div>
        : displayList.length === 0 ? <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm text-gray-400"><p>无匹配结果</p><button onClick={() => { setFilterRes(''); setFilterModel(''); setSearchText(''); setFilter('chips', []); }} className="text-blue-500 hover:underline text-xs">清除全部筛选</button></div>
        : <div className="flex-1 overflow-auto"><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2.5">{displayList.map(p => <PromptCard key={p.id} prompt={p} onClick={() => nav(`/prompt/${p.id}`)} />)}</div></div>}
    </div>
  );
}
