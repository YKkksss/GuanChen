'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ArrowClockwise,
  Check,
  PencilSimple,
  Trash,
  X,
} from '@phosphor-icons/react';
import type { ContextRun, MemoryItem } from '@/lib/conversations/types';

interface ContextResponse {
  summary: Record<string, string[]> | null;
  summaryThroughSeq: number;
  summaryVersion: number;
  summaryUpdatedAt: number | null;
  memories: MemoryItem[];
  contextRuns: ContextRun[];
}

interface ContextMemoryPanelProps {
  conversationId: string;
  open: boolean;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<MemoryItem['category'], string> = {
  user_fact: '用户事实',
  confirmed_event: '已确认事件',
  user_preference: '回答偏好',
  correction: '纠正信息',
  open_question: '待解决问题',
  previous_interpretation: '历史解读',
};

export default function ContextMemoryPanel({
  conversationId,
  open,
  onClose,
}: ContextMemoryPanelProps) {
  const [data, setData] = useState<ContextResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/conversations/${conversationId}/context`, {
        cache: 'no-store',
      });
      const payload = await response.json() as ContextResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error || '上下文加载失败');
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '上下文加载失败');
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const saveMemory = async (memoryId: string) => {
    if (!editingContent.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/memories/${memoryId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: editingContent }),
        },
      );
      if (!response.ok) throw new Error('记忆保存失败');
      setEditingId(null);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '记忆保存失败');
    } finally {
      setSaving(false);
    }
  };

  const deleteMemory = async (memory: MemoryItem) => {
    if (!window.confirm(`确定删除这条${CATEGORY_LABELS[memory.category]}吗？原始聊天记录不会删除。`)) return;
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/memories/${memory.id}`,
        { method: 'DELETE' },
      );
      if (!response.ok) throw new Error('记忆删除失败');
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '记忆删除失败');
    }
  };

  const rebuildSummary = async () => {
    if (!window.confirm('确定根据完整聊天历史重建摘要吗？原始消息不会受到影响。')) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/conversations/${conversationId}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rebuild_summary' }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || '摘要重建失败');
      await load();
    } catch (rebuildError) {
      setError(rebuildError instanceof Error ? rebuildError.message : '摘要重建失败');
    } finally {
      setSaving(false);
    }
  };

  const rebuildMemories = async () => {
    if (!window.confirm('确定从完整用户消息中重新提取关键记忆吗？全部提取成功后才会替换现有记忆。')) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/conversations/${conversationId}/context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rebuild_memories' }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || '记忆重建失败');
      await load();
    } catch (rebuildError) {
      setError(rebuildError instanceof Error ? rebuildError.message : '记忆重建失败');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col rounded-xl"
      style={{ background: 'var(--bg-0)', color: 'var(--t-text)' }}
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <div>
          <div className="text-xs font-medium">对话记忆管理</div>
          <div className="mt-0.5 text-[9px]" style={{ color: 'var(--t-faint)' }}>可查看、纠正或删除 AI 后续会使用的信息</div>
        </div>
        <button onClick={onClose} className="rounded-lg p-2" aria-label="关闭记忆管理" style={{ color: 'var(--t-faint)' }}>
          <X size={16} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {loading && !data && <div className="py-10 text-center text-[10px]" style={{ color: 'var(--t-faint)' }}>正在读取记忆…</div>}
        {error && (
          <div className="rounded-lg px-3 py-2 text-[10px]" style={{ color: '#c96b6b', border: '1px solid rgba(201,107,107,.28)' }}>
            {error}
          </div>
        )}

        {data && (
          <>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <h4 className="text-[11px] font-medium">关键记忆</h4>
                  <p className="text-[9px]" style={{ color: 'var(--t-faint)' }}>只保存长期有用的事实、事件、偏好和纠正</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{data.memories.length} 条</span>
                  <button
                    onClick={() => void rebuildMemories()}
                    disabled={saving}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[9px] disabled:opacity-40"
                    style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.25)' }}
                  >
                    <ArrowClockwise size={11} className={saving ? 'animate-spin' : ''} />重建
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {data.memories.length === 0 && (
                  <div className="rounded-lg p-3 text-[10px]" style={{ border: '1px solid var(--t-border)', color: 'var(--t-faint)' }}>
                    暂无关键记忆。对话中明确说明个人事实或经历后，系统会自动提取。
                  </div>
                )}
                {data.memories.map(memory => (
                  <div key={memory.id} className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[9px]" style={{ color: 'var(--t-gold)' }}>{CATEGORY_LABELS[memory.category]}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingId(memory.id);
                            setEditingContent(memory.content);
                          }}
                          className="rounded p-1"
                          title="纠正记忆"
                          style={{ color: 'var(--t-faint)' }}
                        >
                          <PencilSimple size={13} />
                        </button>
                        <button onClick={() => void deleteMemory(memory)} className="rounded p-1" title="删除记忆" style={{ color: '#b96868' }}>
                          <Trash size={13} />
                        </button>
                      </div>
                    </div>
                    {editingId === memory.id ? (
                      <div className="space-y-2">
                        <textarea
                          value={editingContent}
                          onChange={event => setEditingContent(event.target.value)}
                          rows={3}
                          className="w-full resize-none rounded-md px-2 py-1.5 text-[10px] outline-none"
                          style={{ background: 'var(--t-bg)', border: '1px solid var(--t-border)' }}
                        />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} className="px-2 py-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>取消</button>
                          <button
                            onClick={() => void saveMemory(memory.id)}
                            disabled={saving || !editingContent.trim()}
                            className="flex items-center gap-1 rounded-md px-2 py-1 text-[9px] disabled:opacity-40"
                            style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.25)' }}
                          >
                            <Check size={11} />保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>{memory.content}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-[11px] font-medium">滚动摘要</h4>
                  <p className="mt-1 text-[9px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>
                    已整理至第 {data.summaryThroughSeq} 条消息 · 版本 {data.summaryVersion}
                  </p>
                </div>
                <button
                  onClick={() => void rebuildSummary()}
                  disabled={saving}
                  className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[9px] disabled:opacity-40"
                  style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.25)' }}
                >
                  <ArrowClockwise size={11} className={saving ? 'animate-spin' : ''} />重建
                </button>
              </div>
              <p className="mt-2 text-[9px]" style={{ color: 'var(--t-faint)' }}>
                摘要仅用于压缩较早对话，完整原始消息始终保留。
              </p>
            </section>

            {process.env.NODE_ENV === 'development' && (
              <section>
                <h4 className="mb-2 text-[11px] font-medium">上下文调试</h4>
                <div className="space-y-2">
                  {data.contextRuns.slice(0, 8).map(run => (
                    <div key={run.id} className="grid grid-cols-2 gap-1 rounded-lg p-2 text-[9px]" style={{ border: '1px solid var(--t-border)', color: 'var(--t-faint)' }}>
                      <span>{run.provider} / {run.model}</span>
                      <span className="text-right">{run.status}</span>
                      <span>输入估算 {run.estimatedInputTokens} / {run.inputBudget}</span>
                      <span className="text-right">最近 {run.recentMessageCount} 条 · 召回 {run.retrievedMessageIds.length} 条</span>
                    </div>
                  ))}
                  {data.contextRuns.length === 0 && <p className="text-[9px]" style={{ color: 'var(--t-faint)' }}>尚无模型调用记录。</p>}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
