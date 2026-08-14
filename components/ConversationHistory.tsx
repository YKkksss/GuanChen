'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatCircleDots, Plus, SidebarSimple } from '@phosphor-icons/react';
import type { ConversationListItem } from '@/lib/conversations/types';

interface ConversationHistoryProps {
  activeConversationId?: string | null;
  collapsed: boolean;
  onToggle: () => void;
}

export default function ConversationHistory({
  activeConversationId,
  collapsed,
  onToggle,
}: ConversationHistoryProps) {
  const router = useRouter();
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      setError('');
      const response = await fetch('/api/conversations?type=chart&status=active', { cache: 'no-store' });
      if (!response.ok) throw new Error('历史记录加载失败');
      const data = await response.json() as { conversations?: ConversationListItem[] };
      setItems(data.conversations ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '历史记录加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
    const handleUpdated = () => loadHistory();
    window.addEventListener('conversation-updated', handleUpdated);
    return () => window.removeEventListener('conversation-updated', handleUpdated);
  }, [loadHistory]);

  const renameConversation = async (item: ConversationListItem) => {
    const nextTitle = window.prompt('请输入新的会话名称', item.title)?.trim();
    if (!nextTitle || nextTitle === item.title) return;
    const response = await fetch(`/api/conversations/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: nextTitle }),
    });
    if (response.ok) await loadHistory();
  };

  const removeConversation = async (item: ConversationListItem) => {
    if (!window.confirm(`确定删除“${item.title}”吗？完整聊天记录将无法恢复。`)) return;
    const response = await fetch(`/api/conversations/${item.id}`, { method: 'DELETE' });
    if (!response.ok) return;
    if (activeConversationId === item.id) router.push('/chart');
    await loadHistory();
  };

  return (
    <aside className="rounded-xl card-glass overflow-hidden xl:sticky xl:top-4">
      <div
        className={`flex items-center gap-2 p-3 ${collapsed ? 'xl:flex-col' : 'justify-between'}`}
        style={{ borderBottom: '1px solid var(--t-border)' }}
      >
        <div className={`min-w-0 flex-1 ${collapsed ? 'xl:hidden' : ''}`}>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>历史对话</div>
            <div className="text-[10px] mt-1" style={{ color: 'var(--t-faint)' }}>数据仅保存在这台设备</div>
          </div>
        </div>

        <div className={`flex shrink-0 gap-1.5 ${collapsed ? 'xl:flex-col' : ''}`}>
          <button
            type="button"
            onClick={() => router.push('/chart')}
            title="新建命盘"
            aria-label="新建命盘"
            className={`flex h-8 items-center justify-center gap-1 rounded-lg text-[11px] transition-colors active:scale-[0.98] ${collapsed ? 'w-8 xl:px-0' : 'px-2.5'}`}
            style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,0.25)' }}
          >
            <Plus size={15} weight="bold" aria-hidden="true" />
            <span className={collapsed ? 'xl:hidden' : ''}>新建</span>
          </button>
          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? '展开历史对话' : '收起历史对话'}
            aria-label={collapsed ? '展开历史对话' : '收起历史对话'}
            aria-expanded={!collapsed}
            className="hidden h-8 w-8 items-center justify-center rounded-lg transition-colors active:scale-[0.98] xl:flex"
            style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}
          >
            <SidebarSimple size={17} weight={collapsed ? 'fill' : 'regular'} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="max-h-[70vh] space-y-1.5 overflow-y-auto p-2 overscroll-contain xl:max-h-[calc(100dvh-7rem)]">
        {loading && <HistoryHint text={collapsed ? '…' : '正在读取历史记录…'} compact={collapsed} />}
        {!loading && error && <HistoryHint text={collapsed ? '!' : error} compact={collapsed} />}
        {!loading && !error && items.length === 0 && (
          <HistoryHint text={collapsed ? '空' : '还没有历史对话，起一张命盘后会自动保存。'} compact={collapsed} />
        )}

        {items.map(item => {
          const active = item.id === activeConversationId;
          return (
            <div
              key={item.id}
              className="group rounded-lg transition-colors"
              style={{
                background: active ? 'rgba(212,168,67,0.10)' : 'transparent',
                border: `1px solid ${active ? 'rgba(212,168,67,0.24)' : 'transparent'}`,
              }}
            >
              <button
                type="button"
                title={item.title}
                aria-label={`打开会话：${item.title}`}
                onClick={() => router.push(`/chart/${item.id}`)}
                className={`mx-auto my-1 h-9 w-9 items-center justify-center rounded-lg transition-colors active:scale-[0.98] ${collapsed ? 'hidden xl:flex' : 'hidden'}`}
                style={{ color: active ? 'var(--t-gold)' : 'var(--t-faint)' }}
              >
                <ChatCircleDots size={18} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
              </button>

              <div className={collapsed ? 'xl:hidden' : ''}>
              <button
                type="button"
                onClick={() => router.push(`/chart/${item.id}`)}
                className="block w-full text-left px-3 pt-2.5 pb-1"
              >
                <div className="text-[12px] truncate" style={{ color: active ? 'var(--t-gold)' : 'var(--t-text)' }}>
                  {item.title}
                </div>
                <div className="text-[10px] mt-1 truncate" style={{ color: 'var(--t-faint)' }}>
                  {item.lastMessagePreview || '等待首次解读'}
                </div>
              </button>
              <div className="px-3 pb-2 flex items-center justify-between text-[9px]" style={{ color: 'var(--t-faint)' }}>
                <span>{formatRelativeTime(item.updatedAt)} · {item.messageCount} 条消息</span>
                <span className="flex gap-2 opacity-70 group-hover:opacity-100">
                  <button type="button" onClick={() => renameConversation(item)} className="hover:underline">重命名</button>
                  <button type="button" onClick={() => removeConversation(item)} className="hover:underline">删除</button>
                </span>
              </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function HistoryHint({ text, compact }: { text: string; compact?: boolean }) {
  return (
    <div
      className={`text-center text-[10px] leading-relaxed ${compact ? 'xl:px-0 xl:py-5' : 'px-3 py-8'}`}
      style={{ color: 'var(--t-faint)' }}
    >
      {text}
    </div>
  );
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
