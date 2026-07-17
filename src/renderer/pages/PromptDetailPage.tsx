import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePromptDetail, useUpdatePrompt, useDeletePrompt } from '../hooks/usePrompts';
import { useSetPromptTags } from '../hooks/useTags';
import { Button } from '../components/shared/Button';
import { Spinner } from '../components/shared/Spinner';
import { Modal } from '../components/shared/Modal';
import { TextInput } from '../components/shared/TextInput';
import { showToast } from '../components/shared/Toast';
import { getAPI } from '../lib/ipc';
import type { UpdatePromptDTO } from '../../shared/types';

export function PromptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const promptId = parseInt(id || '0');

  const { data: prompt, isLoading } = usePromptDetail(promptId);
  const updatePrompt = useUpdatePrompt();
  const deletePrompt = useDeletePrompt();
  const setTags = useSetPromptTags();

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<UpdatePromptDTO>({});
  const [deleteModal, setDeleteModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [selectedImage, setSelectedImage] = useState(0);
  const [workflowExpanded, setWorkflowExpanded] = useState(false);
  const [workflowCopied, setWorkflowCopied] = useState(false);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner className="w-8 h-8 text-blue-500" />
      </div>
    );
  }

  if (!prompt) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        未找到该提示词记录
      </div>
    );
  }

  const images = prompt.images || [];
  const currentImage = images[selectedImage];

  const startEditing = () => {
    setEditForm({
      positive: prompt.positive,
      negative: prompt.negative,
      model: prompt.model,
      sampler: prompt.sampler,
      steps: prompt.steps,
      cfg: prompt.cfg,
      seed: prompt.seed,
      width: prompt.width,
      height: prompt.height,
      notes: prompt.notes,
    });
    setEditing(true);
  };

  const handleSave = async () => {
    try {
      await updatePrompt.mutateAsync({ id: promptId, dto: editForm });
      setEditing(false);
      showToast('success', '保存成功');
    } catch (err: any) {
      showToast('error', err.message || '保存失败');
    }
  };

  const handleDelete = async () => {
    await deletePrompt.mutateAsync(promptId);
    showToast('success', '已删除');
    navigate('/');
  };

  const handleAddTag = async (tagName: string) => {
    if (!tagName.trim()) return;

    const { getAPI } = await import('../lib/ipc');
    const api = getAPI();
    const tag = await api.tags.create(tagName.trim());
    const currentTagIds = prompt.tags.map(t => t.id);
    await setTags.mutateAsync({
      promptId,
      tagIds: [...currentTagIds, tag.id],
    });
    setNewTagName('');
  };

  const handleRemoveTag = async (tagId: number) => {
    const currentTagIds = prompt.tags.map(t => t.id).filter(id => id !== tagId);
    await setTags.mutateAsync({ promptId, tagIds: currentTagIds });
  };

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => navigate('/')}
          className="text-blue-500 hover:text-blue-600 text-sm flex items-center gap-1"
        >
          ← 返回图库
        </button>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>取消</Button>
              <Button size="sm" onClick={handleSave}>保存</Button>
            </>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={startEditing}>编辑</Button>
              <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>删除</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Image viewer */}
        <div>
          {currentImage ? (
            <div className="bg-black rounded-xl overflow-hidden">
              <img
                src={currentImage.file_path ? `prompt-image://${currentImage.file_path}` : undefined}
                alt="Generated image"
                className="w-full h-auto max-h-[70vh] object-contain mx-auto"
              />
            </div>
          ) : (
            <div className="aspect-square bg-surface-hover rounded-xl flex items-center justify-center text-gray-400">
              <p>无图片</p>
            </div>
          )}

          {/* Image thumbnails */}
          {images.length > 1 && (
            <div className="flex gap-2 mt-3">
              {images.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => setSelectedImage(idx)}
                  className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors
                    ${idx === selectedImage ? 'border-blue-500' : 'border-transparent'}`}
                >
                  <img
                    src={img.thumb_path ? `prompt-image://${img.thumb_path}` : undefined}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="w-full h-full bg-surface-hover" style={{ display: img.thumb_path ? 'none' : 'block' }} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Metadata & Prompts */}
        <div className="space-y-4 overflow-auto">
          {/* Generation Parameters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-border">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">生成参数</h3>
            {editing ? (
              <div className="grid grid-cols-2 gap-3">
                <TextInput label="Model" value={editForm.model || ''}
                  onChange={e => setEditForm(f => ({ ...f, model: e.target.value }))} />
                <TextInput label="Sampler" value={editForm.sampler || ''}
                  onChange={e => setEditForm(f => ({ ...f, sampler: e.target.value }))} />
                <TextInput label="Steps" type="number" value={editForm.steps || 0}
                  onChange={e => setEditForm(f => ({ ...f, steps: parseInt(e.target.value) }))} />
                <TextInput label="CFG" type="number" step="0.1" value={editForm.cfg || 0}
                  onChange={e => setEditForm(f => ({ ...f, cfg: parseFloat(e.target.value) }))} />
                <TextInput label="Seed" type="number" value={editForm.seed || 0}
                  onChange={e => setEditForm(f => ({ ...f, seed: parseInt(e.target.value) }))} />
                <TextInput label="Width" type="number" value={editForm.width || 0}
                  onChange={e => setEditForm(f => ({ ...f, width: parseInt(e.target.value) }))} />
                <TextInput label="Height" type="number" value={editForm.height || 0}
                  onChange={e => setEditForm(f => ({ ...f, height: parseInt(e.target.value) }))} />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <MetaRow label="Model" value={prompt.model} />
                <MetaRow label="Sampler" value={prompt.sampler} />
                <MetaRow label="Steps" value={prompt.steps} />
                <MetaRow label="CFG" value={prompt.cfg} />
                <MetaRow label="Seed" value={prompt.seed} />
                <MetaRow label="Size" value={`${prompt.width} \u00d7 ${prompt.height}`} />
                <MetaRow label="创建时间" value={formatDate(prompt.created_at)} />
              </div>
            )}
          </div>

          {/* Positive Prompt */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-green-600 dark:text-green-400">正面提示词</h3>
              {!editing && prompt.positive && (
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(prompt.positive);
                    showToast('success', '已复制');
                  }}
                  className="text-xs text-gray-400 hover:text-green-500 transition-colors flex items-center gap-1"
                  title="复制正面提示词"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  复制
                </button>
              )}
            </div>
            {editing ? (
              <textarea
                value={editForm.positive || ''}
                onChange={e => setEditForm(f => ({ ...f, positive: e.target.value }))}
                rows={4}
                className="w-full px-3 py-2 rounded-lg border border-border bg-white dark:bg-gray-900 text-sm resize-y"
              />
            ) : (
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed
                max-h-40 overflow-y-auto">
                {prompt.positive || <span className="text-gray-400 italic">空</span>}
              </p>
            )}
          </div>

          {/* Negative Prompt */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-border">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">负面提示词</h3>
              {!editing && prompt.negative && (
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(prompt.negative);
                    showToast('success', '已复制');
                  }}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1"
                  title="复制负面提示词"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  复制
                </button>
              )}
            </div>
            {editing ? (
              <textarea
                value={editForm.negative || ''}
                onChange={e => setEditForm(f => ({ ...f, negative: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-border bg-white dark:bg-gray-900 text-sm resize-y"
              />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-wrap leading-relaxed
                max-h-24 overflow-y-auto">
                {prompt.negative || <span className="text-gray-400 italic">空</span>}
              </p>
            )}
          </div>

          {/* Tags */}
          <div className="grid gap-4" style={{ gridTemplateColumns: prompt.workflow?.length ? '1fr 1fr' : '1fr' }}>
          {/* Workflow */}
          {prompt.workflow?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-border">
              <button
                onClick={() => setWorkflowExpanded(!workflowExpanded)}
                className="w-full flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-gray-100"
              >
                <span>Workflow</span>
                <svg className={'w-4 h-4 transition-transform ' + (workflowExpanded ? 'rotate-180' : '')}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {workflowExpanded && (
                <div className="mt-3 space-y-3">
                  <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg p-3 max-h-60 overflow-auto whitespace-pre-wrap">
                    {(() => { try { return JSON.stringify(JSON.parse(prompt.workflow), null, 2); } catch { return prompt.workflow; } })()}
                  </pre>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={async () => {
                      await navigator.clipboard.writeText(prompt.workflow);
                      setWorkflowCopied(true);
                      showToast('success', 'Workflow JSON copied');
                      setTimeout(() => setWorkflowCopied(false), 2000);
                    }}>
                      {workflowCopied ? 'Copied' : 'Copy JSON'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={async () => {
                      const api = getAPI();
                      const result = await api.app.saveWorkflowFile(prompt.workflow);
                      if (result.success) showToast('success', 'Workflow saved');
                      else showToast('error', result.message);
                    }}>
                      Save to ComfyUI
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-border">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">标签</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {prompt.tags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => handleRemoveTag(tag.id)}
                  className="tag-chip tag-chip-removable text-xs"
                >
                  {tag.name} x
                </button>
              ))}
              {prompt.tags.length === 0 && (
                <span className="text-sm text-gray-400">暂无标签</span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleAddTag(newTagName);
                  }
                }}
                placeholder="添加标签..."
                className="flex-1 px-3 py-1.5 text-sm border border-border rounded-lg
                  bg-surface dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <Button size="sm" variant="secondary" onClick={() => handleAddTag(newTagName)}>
                添加
              </Button>
          </div>
          </div>
        </div>

          {/* Workflow */}
          {prompt.workflow?.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-border">
              <button
                onClick={() => setWorkflowExpanded(!workflowExpanded)}
                className="w-full flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-gray-100"
              >
                <span>Workflow</span>
                <svg className={`w-4 h-4 transition-transform ${workflowExpanded ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {workflowExpanded && (
                <div className="mt-3 space-y-3">
                  <pre className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 rounded-lg p-3 max-h-60 overflow-auto whitespace-pre-wrap">
                    {(() => { try { return JSON.stringify(JSON.parse(prompt.workflow), null, 2); } catch { return prompt.workflow; } })()}
                  </pre>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={async () => {
                      await navigator.clipboard.writeText(prompt.workflow);
                      setWorkflowCopied(true);
                      showToast('success', 'Workflow JSON copied');
                      setTimeout(() => setWorkflowCopied(false), 2000);
                    }}>
                      {workflowCopied ? 'Copied' : 'Copy JSON'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={async () => {
                      const api = getAPI();
                      const result = await api.app.saveWorkflowFile(prompt.workflow);
                      if (result.success) showToast('success', 'Workflow saved');
                      else showToast('error', result.message);
                    }}>
                      Save to ComfyUI
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="确认删除" size="sm">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          确定要删除这个提示词和关联的图片吗？此操作不可撤销。
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteModal(false)}>取消</Button>
          <Button variant="danger" onClick={handleDelete}>确认删除</Button>
        </div>
      </Modal>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string | number }) {
  const displayValue = value === 0 || value === '' || value === undefined
    ? <span className="text-gray-300 dark:text-gray-600">—</span>
    : String(value);
  return (
    <>
      <span className="text-gray-400 dark:text-gray-500">{label}</span>
      <span className="text-gray-900 dark:text-gray-100 font-mono text-xs">{displayValue}</span>
    </>
  );
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}
