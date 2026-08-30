'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DownloadSimple, Plus } from '@phosphor-icons/react';
import ConversationHistory from '@/components/ConversationHistory';
import LifeEventForm from '@/components/LifeEventForm';
import type { Conversation } from '@/lib/conversations/types';
import {
  LIFE_EVENT_CATEGORIES,
  LIFE_EVENT_CATEGORY_LABELS,
  type LifeEventCategory,
  type LifeEventWithTransits,
} from '@/lib/events/types';

const CATEGORY_COLORS: Record<LifeEventCategory, string> = {
  education: '#60a5fa',
  career: '#8b5cf6',
  finance: '#10b981',
  relationship: '#ec4899',
  children: '#f59e0b',
  relocation: '#06b6d4',
  family: '#f97316',
  health: '#ef4444',
  achievement: '#d4a843',
  custom: '#94a3b8',
};

export default function LifeEventsWorkspace({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [events, setEvents] = useState<LifeEventWithTransits[]>([]);
  const [category, setCategory] = useState<LifeEventCategory | 'all'>('all');
  const [editing, setEditing] = useState<LifeEventWithTransits | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setHistoryCollapsed(window.localStorage.getItem('ziwei-history-collapsed') === 'true');
    Promise.all([
      fetch(`/api/conversations/${conversationId}`, { cache: 'no-store' }).then(response => response.json()),
      fetch(`/api/conversations/${conversationId}/events`, { cache: 'no-store' }).then(response => response.json()),
    ]).then(([conversationData, eventData]) => {
      if (!conversationData.conversation?.chartSnapshot) throw new Error(conversationData.error || '命盘加载失败');
      setConversation(conversationData.conversation);
      setEvents(eventData.events ?? []);
    }).catch(loadError => setError(loadError instanceof Error ? loadError.message : '人生事件加载失败'))
      .finally(() => setLoading(false));
  }, [conversationId]);

  const filteredEvents = useMemo(() => (
    category === 'all' ? events : events.filter(event => event.category === category)
  ), [category, events]);
  const groupedEvents = useMemo(() => {
    const groups = new Map<string, LifeEventWithTransits[]>();
    filteredEvents.forEach(event => {
      const year = event.startDate ? event.startDate.slice(0, 4) : '日期不详';
      const items = groups.get(year) ?? [];
      items.push(event);
      groups.set(year, items);
    });
    return Array.from(groups.entries());
  }, [filteredEvents]);

  const toggleHistory = () => {
    setHistoryCollapsed(current => {
      const next = !current;
      window.localStorage.setItem('ziwei-history-collapsed', String(next));
      return next;
    });
  };

  const openCreate = () => {
    setEditing(null);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (event: LifeEventWithTransits) => {
    setEditing(event);
    setFormError('');
    setFormOpen(true);
  };

  const saveEvent = async (input: Record<string, unknown>) => {
    setSaving(true);
    setFormError('');
    try {
      const url = editing
        ? `/api/conversations/${conversationId}/events/${editing.id}`
        : `/api/conversations/${conversationId}/events`;
      const response = await fetch(url, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await response.json() as { event?: LifeEventWithTransits; error?: string };
      if (!response.ok || !data.event) throw new Error(data.error || '事件保存失败');
      setEvents(current => editing
        ? current.map(item => item.id === data.event!.id ? data.event! : item)
        : [...current, data.event!].sort(compareEvents));
      setFormOpen(false);
      setEditing(null);
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : '事件保存失败');
    } finally {
      setSaving(false);
    }
  };

  const removeEvent = async (event: LifeEventWithTransits) => {
    if (!window.confirm(`确定删除“${event.title}”吗？该操作无法恢复。`)) return;
    const response = await fetch(`/api/conversations/${conversationId}/events/${event.id}`, { method: 'DELETE' });
    if (response.ok) setEvents(current => current.filter(item => item.id !== event.id));
  };

  const birthYear = conversation?.birthInfo?.year ?? new Date().getFullYear();

  return (
    <main className="mx-auto max-w-[1800px] px-3 py-4 md:px-4">
      <div className={`grid grid-cols-1 items-start gap-4 ${historyCollapsed ? 'xl:grid-cols-[64px_minmax(0,1fr)]' : 'xl:grid-cols-[260px_minmax(0,1fr)]'}`}>
        <ConversationHistory activeConversationId={conversationId} collapsed={historyCollapsed} onToggle={toggleHistory} />
        <section className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <button type="button" onClick={() => router.push(`/chart/${conversationId}`)} className="text-[10px]" style={{ color: 'var(--t-faint)' }}>← 返回命盘</button>
              <h1 className="mt-2 text-xl font-semibold" style={{ color: 'var(--t-text)' }}>人生事件时间轴</h1>
              <p className="mt-1 text-[10px]" style={{ color: 'var(--t-faint)' }}>记录真实经历，并自动关联当年的大限与流年结构</p>
            </div>
            <div className="flex gap-2">
              <a
                href={`/api/conversations/${conversationId}/events?format=json`}
                download
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px]"
                style={{ border: '1px solid var(--t-border)', color: 'var(--t-faint)' }}
              >
                <DownloadSimple size={14} />导出 JSON
              </a>
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px]"
                style={{ border: '1px solid rgba(212,168,67,.30)', color: 'var(--t-gold)', background: 'rgba(212,168,67,.08)' }}
              >
                <Plus size={14} weight="bold" />新增事件
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1">
            <FilterButton active={category === 'all'} onClick={() => setCategory('all')}>全部 {events.length}</FilterButton>
            {LIFE_EVENT_CATEGORIES.map(item => {
              const count = events.filter(event => event.category === item).length;
              if (!count) return null;
              return <FilterButton key={item} active={category === item} onClick={() => setCategory(item)}>{LIFE_EVENT_CATEGORY_LABELS[item]} {count}</FilterButton>;
            })}
          </div>

          {loading && <div className="mt-4 rounded-xl card-glass py-24 text-center text-sm" style={{ color: 'var(--t-faint)' }}>正在读取人生事件…</div>}
          {!loading && error && <div className="mt-4 rounded-xl card-glass py-20 text-center text-sm text-red-500">{error}</div>}

          {!loading && !error && (
            <div className={`mt-4 grid items-start gap-4 ${formOpen ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''}`}>
              <div className="min-w-0 rounded-xl card-glass p-4 sm:p-5">
                {groupedEvents.length === 0 && (
                  <div className="py-24 text-center">
                    <div className="text-3xl opacity-20">◇</div>
                    <div className="mt-3 text-xs" style={{ color: 'var(--t-text)' }}>还没有符合条件的人生事件</div>
                    <button type="button" onClick={openCreate} className="mt-3 text-[10px]" style={{ color: 'var(--t-gold)' }}>记录第一件人生大事</button>
                  </div>
                )}

                <div className="relative space-y-8 before:absolute before:bottom-4 before:left-[30px] before:top-4 before:w-px before:bg-[var(--t-border)]">
                  {groupedEvents.map(([year, items]) => (
                    <section key={year} className="relative grid grid-cols-[62px_minmax(0,1fr)] gap-3">
                      <div className="relative z-10 pt-1 text-right">
                        <div className="text-sm font-semibold" style={{ color: year === '日期不详' ? 'var(--t-faint)' : 'var(--t-gold)' }}>{year}</div>
                        {year !== '日期不详' && <div className="mt-0.5 text-[9px]" style={{ color: 'var(--t-faint)' }}>虚岁 {Number(year) - birthYear + 1}</div>}
                      </div>
                      <div className="space-y-2.5">
                        {items.map(event => (
                          <EventCard
                            key={event.id}
                            event={event}
                            onEdit={() => openEdit(event)}
                            onDelete={() => removeEvent(event)}
                            onOpenTransit={targetYear => router.push(`/chart/${conversationId}/timeline?year=${targetYear}`)}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>

              {formOpen && (
                <LifeEventForm
                  event={editing}
                  birthYear={birthYear}
                  saving={saving}
                  error={formError}
                  onCancel={() => { setFormOpen(false); setEditing(null); setFormError(''); }}
                  onSave={saveEvent}
                />
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function EventCard({
  event,
  onEdit,
  onDelete,
  onOpenTransit,
}: {
  event: LifeEventWithTransits;
  onEdit: () => void;
  onDelete: () => void;
  onOpenTransit: (year: string) => void;
}) {
  const color = CATEGORY_COLORS[event.category];
  const firstTransit = event.transitLinks[0];
  return (
    <article className="rounded-xl p-3.5" style={{ border: `1px solid ${color}30`, background: 'var(--t-card)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-[9px]" style={{ color, background: `${color}12`, border: `1px solid ${color}30` }}>
              {event.category === 'custom' ? event.customCategory : LIFE_EVENT_CATEGORY_LABELS[event.category]}
            </span>
            <span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{formatEventDate(event)}</span>
            <span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>影响 {event.impactLevel}/5</span>
            <span className="text-[9px]" style={{ color: event.source === 'conversation_extracted' ? 'var(--t-gold)' : 'var(--t-faint)' }}>
              {event.source === 'conversation_extracted' ? '来自聊天确认' : '手动记录'}
            </span>
          </div>
          <h3 className="mt-2 text-[12px] font-medium" style={{ color: 'var(--t-text)' }}>{event.title}</h3>
          {event.description && <p className="mt-1.5 whitespace-pre-wrap text-[10px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>{event.description}</p>}
        </div>
        <div className="flex shrink-0 gap-2 text-[9px]" style={{ color: 'var(--t-faint)' }}>
          <button type="button" onClick={onEdit}>编辑</button>
          <button type="button" onClick={onDelete}>删除</button>
        </div>
      </div>

      {firstTransit && (
        <button
          type="button"
          onClick={() => onOpenTransit(firstTransit.targetDate)}
          className="mt-3 block w-full rounded-lg px-3 py-2 text-left"
          style={{ border: '1px solid var(--t-border)', background: 'rgba(212,168,67,.035)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[9px]" style={{ color: 'var(--t-gold)' }}>
              {event.transitLinks.length > 1 ? `已关联 ${event.transitLinks.length} 个年度快照` : `${firstTransit.targetDate} 年运限关联`}
            </span>
            <span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>查看年度分析 →</span>
          </div>
          <div className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>
            {firstTransit.snapshot.year.ganZhi}年 · 虚岁 {firstTransit.snapshot.nominalAge} · 流年命宫落本命{firstTransit.snapshot.flowYear.nativePalaceName}
          </div>
        </button>
      )}
    </article>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="shrink-0 rounded-full px-3 py-1.5 text-[9px]" style={{ color: active ? 'var(--t-gold)' : 'var(--t-faint)', border: `1px solid ${active ? 'rgba(212,168,67,.30)' : 'var(--t-border)'}`, background: active ? 'rgba(212,168,67,.08)' : 'transparent' }}>{children}</button>;
}

function formatEventDate(event: LifeEventWithTransits): string {
  if (event.datePrecision === 'unknown') return '日期不详';
  if (event.datePrecision === 'range') return `${event.startDate} 至 ${event.endDate}`;
  return event.startDate;
}

function compareEvents(a: LifeEventWithTransits, b: LifeEventWithTransits): number {
  if (!a.startDate) return 1;
  if (!b.startDate) return -1;
  return a.startDate.localeCompare(b.startDate) || a.createdAt - b.createdAt;
}
