'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChatCircleDots, Plus, SidebarSimple } from '@phosphor-icons/react';
import type { ConversationListItem, ConversationType } from '@/lib/conversations/types';

interface ConversationHistoryProps {
  activeConversationId?: string | null;
  collapsed: boolean;
  onToggle: () => void;
  conversationType?: ConversationType;
}

export default function ConversationHistory({
  activeConversationId,
  collapsed,
  onToggle,
  conversationType = 'chart',
}: ConversationHistoryProps) {
  const router = useRouter();
  const basePath = conversationType === 'heming' ? '/heming' : '/chart';
  const historyTitle = conversationType === 'heming' ? '合盘历史' : '历史对话';
  const [items, setItems] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadHistory = useCallback(async () => {
    try {
      setError('');
      const response = await fetch(`/api/conversations?type=${conversationType}&status=active`, { cache: 'no-store' });
      if (!response.ok) throw new Error('历史记录加载失败');
      const data = await response.json() as { conversations?: ConversationListItem[] };
      setItems(data.conversations ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '历史记录加载失败');
    } finally {
      setLoading(false);
    }
  }, [conversationType]);

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
    if (activeConversationId === item.id) router.push(basePath);
    await loadHistory();
  };

  return (
    <aside className={`eastern-history ${collapsed ? 'is-collapsed' : ''}`}>
      <div className="eastern-history-head">
        <div className="eastern-history-title">
          <strong>{historyTitle}</strong>
          <span>本地命档 · 自动保存</span>
        </div>

        <div className="eastern-history-tools">
          <button
            type="button"
            onClick={() => router.push(basePath)}
            title={conversationType === 'heming' ? '新建合盘' : '新建命盘'}
            aria-label={conversationType === 'heming' ? '新建合盘' : '新建命盘'}
            className="eastern-new-chart"
          >
            <Plus size={15} weight="bold" aria-hidden="true" />
            <span>{conversationType === 'heming' ? '新建合盘' : '新建命盘'}</span>
          </button>
          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? '展开历史对话' : '收起历史对话'}
            aria-label={collapsed ? '展开历史对话' : '收起历史对话'}
            aria-expanded={!collapsed}
            className="eastern-history-toggle"
          >
            <SidebarSimple size={17} weight={collapsed ? 'fill' : 'regular'} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="eastern-history-list">
        {loading && <HistoryHint text={collapsed ? '…' : '正在读取历史记录…'} compact={collapsed} />}
        {!loading && error && <HistoryHint text={collapsed ? '!' : error} compact={collapsed} />}
        {!loading && !error && items.length === 0 && (
          <HistoryHint text={collapsed ? '空' : conversationType === 'heming' ? '还没有合盘记录，创建后会自动保存。' : '还没有历史对话，起一张命盘后会自动保存。'} compact={collapsed} />
        )}

        {items.map(item => {
          const active = item.id === activeConversationId;
          return (
            <div
              key={item.id}
              className={`eastern-history-item group ${active ? 'is-active' : ''}`}
            >
              <button
                type="button"
                title={item.title}
                aria-label={`打开会话：${item.title}`}
                onClick={() => router.push(`${basePath}/${item.id}`)}
                className="eastern-history-icon"
              >
                <ChatCircleDots size={18} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
              </button>

              <div className="eastern-history-copy">
              <button
                type="button"
                onClick={() => router.push(`${basePath}/${item.id}`)}
                className="eastern-history-open"
              >
                <div className="eastern-history-item-title">
                  {item.title}
                </div>
                <div className="eastern-history-preview">
                  {item.lastMessagePreview || (conversationType === 'heming' ? '双方命盘已保存' : '等待首次解读')}
                </div>
              </button>
              <div className="eastern-history-meta">
                <span>{formatRelativeTime(item.updatedAt)} · {item.messageCount} 条消息</span>
                <span className="eastern-history-item-actions">
                  <button type="button" onClick={() => renameConversation(item)}>重命名</button>
                  <button type="button" onClick={() => removeConversation(item)}>删除</button>
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
    <div className={`eastern-history-hint ${compact ? 'is-compact' : ''}`}>
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
