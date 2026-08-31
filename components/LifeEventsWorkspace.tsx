'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DownloadSimple, Plus } from '@phosphor-icons/react';
import ConversationHistory from '@/components/ConversationHistory';
import LifeEventForm from '@/components/LifeEventForm';
import LifeEventAnalysisPanel from '@/components/LifeEventAnalysisPanel';
import type { Conversation } from '@/lib/conversations/types';
import type { EventAnalysisSummary } from '@/lib/events/analysis-types';
import {
  LIFE_EVENT_CATEGORIES,
  LIFE_EVENT_CATEGORY_LABELS,
  type EventTransitLink,
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
  const [analysisSummaries, setAnalysisSummaries] = useState<Record<string, EventAnalysisSummary>>({});
  const [openAnalysisEventId, setOpenAnalysisEventId] = useState<string | null>(null);
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
      setAnalysisSummaries(Object.fromEntries(
        ((eventData.analyses ?? []) as EventAnalysisSummary[]).map(item => [item.eventId, item]),
      ));
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
      if (editing) {
        setAnalysisSummaries(current => current[editing.id]
          ? { ...current, [editing.id]: { ...current[editing.id], isStale: true } }
          : current);
      }
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
    if (response.ok) {
      setEvents(current => current.filter(item => item.id !== event.id));
      setAnalysisSummaries(current => {
        const next = { ...current };
        delete next[event.id];
        return next;
      });
      setOpenAnalysisEventId(current => current === event.id ? null : current);
    }
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
              <p className="mt-1 text-[10px]" style={{ color: 'var(--t-faint)' }}>记录真实经历，并按日期精度关联流年、流月与流日结构</p>
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

          <div
            className="mt-4 rounded-xl px-4 py-3 text-[10px] leading-relaxed"
            style={{ border: '1px solid rgba(212,168,67,.22)', color: 'var(--t-text2)', background: 'rgba(212,168,67,.055)' }}
          >
            <span className="font-medium" style={{ color: 'var(--t-gold)' }}>事实边界：</span>
            事件内容以你确认的真实经历为准；运限挂接只表示日期与传统命理时间结构对齐，不证明命理因素造成了现实事件。
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
                            conversationId={conversationId}
                            analysisSummary={analysisSummaries[event.id] ?? null}
                            analysisOpen={openAnalysisEventId === event.id}
                            onEdit={() => openEdit(event)}
                            onDelete={() => removeEvent(event)}
                            onToggleAnalysis={() => setOpenAnalysisEventId(current => current === event.id ? null : event.id)}
                            onAnalysisSummaryChange={summary => setAnalysisSummaries(current => ({ ...current, [event.id]: summary }))}
                            onOpenTransit={link => {
                              const query = link.level === 'year'
                                ? `level=year&year=${link.targetDate}`
                                : link.level === 'month'
                                  ? `level=month&date=${getMonthlyNavigationDate(link, conversation)}`
                                  : `level=day&date=${link.targetDate}`;
                              router.push(`/chart/${conversationId}/timeline?${query}`);
                            }}
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
  conversationId,
  analysisSummary,
  analysisOpen,
  onEdit,
  onDelete,
  onToggleAnalysis,
  onAnalysisSummaryChange,
  onOpenTransit,
}: {
  event: LifeEventWithTransits;
  conversationId: string;
  analysisSummary: EventAnalysisSummary | null;
  analysisOpen: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggleAnalysis: () => void;
  onAnalysisSummaryChange: (summary: EventAnalysisSummary) => void;
  onOpenTransit: (link: EventTransitLink) => void;
}) {
  const color = CATEGORY_COLORS[event.category];
  const visibleLinks = getVisibleTransitLinks(event.transitLinks);
  const hiddenCount = event.transitLinks.length - visibleLinks.length;
  const levelSummary = (['year', 'month', 'day'] as const)
    .map(level => ({ level, count: event.transitLinks.filter(link => link.level === level).length }))
    .filter(item => item.count > 0)
    .map(item => `${TRANSIT_LEVEL_LABELS[item.level]} ${item.count}`)
    .join(' · ');
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
        <div className="flex shrink-0 flex-wrap justify-end gap-2 text-[9px]" style={{ color: 'var(--t-faint)' }}>
          <button type="button" onClick={onToggleAnalysis} style={{ color: analysisSummary?.isStale ? '#f59e0b' : 'var(--t-gold)' }}>
            {formatAnalysisAction(analysisSummary, analysisOpen)}
          </button>
          <button type="button" onClick={onEdit}>编辑</button>
          <button type="button" onClick={onDelete}>删除</button>
        </div>
      </div>

      {event.transitLinks.length > 0 && (
        <div className="mt-3 rounded-lg px-3 py-2.5" style={{ border: '1px solid var(--t-border)', background: 'rgba(212,168,67,.035)' }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[9px]" style={{ color: 'var(--t-gold)' }}>精确运限挂接 · {levelSummary}</span>
            <span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>点击进入对应时间层级</span>
          </div>
          <div className="mt-2 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleLinks.map(link => (
              <button
                key={link.id}
                type="button"
                onClick={() => onOpenTransit(link)}
                className="rounded-md px-2.5 py-2 text-left transition-colors hover:bg-[rgba(212,168,67,.08)]"
                style={{ border: '1px solid var(--t-border)' }}
              >
                <div className="flex items-center justify-between gap-2 text-[9px]">
                  <span style={{ color: 'var(--t-text)' }}>{formatTransitTitle(link)}</span>
                  <span className="shrink-0" style={{ color: 'var(--t-gold)' }}>{RELATIONSHIP_LABELS[link.relationship]} →</span>
                </div>
                <div className="mt-1 line-clamp-2 text-[8px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>
                  {formatTransitDetail(link)}
                </div>
              </button>
            ))}
          </div>
          {hiddenCount > 0 && (
            <div className="mt-2 text-[8px]" style={{ color: 'var(--t-faint)' }}>
              区间覆盖较长，已收起中间 {hiddenCount} 个年度挂接；保留首尾年度与精确边界入口。
            </div>
          )}
        </div>
      )}

      {analysisOpen && (
        <LifeEventAnalysisPanel
          conversationId={conversationId}
          event={event}
          onSummaryChange={onAnalysisSummaryChange}
        />
      )}
    </article>
  );
}

const TRANSIT_LEVEL_LABELS = { year: '流年', month: '流月', day: '流日' } as const;
const RELATIONSHIP_LABELS: Record<EventTransitLink['relationship'], string> = {
  occurs_in: '发生',
  starts_in: '开始',
  continues_in: '持续',
  ends_in: '结束',
};

function formatAnalysisAction(summary: EventAnalysisSummary | null, open: boolean): string {
  if (open) return '收起回溯';
  if (!summary) return '事件回溯';
  if (summary.isStale) return '回溯需更新';
  if (summary.status === 'failed') return '回溯失败';
  return summary.version ? `查看回溯 v${summary.version}` : '事件回溯';
}

function getVisibleTransitLinks(links: EventTransitLink[]): EventTransitLink[] {
  const years = links.filter(link => link.level === 'year');
  const precise = links.filter(link => link.level !== 'year');
  if (years.length <= 6) return [...years, ...precise];
  return [...years.slice(0, 3), ...years.slice(-2), ...precise];
}

function formatTransitTitle(link: EventTransitLink): string {
  if (link.level === 'year') return `${link.targetDate} 流年`;
  if (link.level === 'month') return `农历${link.snapshot.lunarMonth.label}`;
  return `${link.targetDate} 流日`;
}

function formatTransitDetail(link: EventTransitLink): string {
  if (link.level === 'year') {
    return `${link.snapshot.year.ganZhi}年 · 虚岁 ${link.snapshot.nominalAge} · 流年命宫落本命${link.snapshot.flowYear.nativePalaceName}`;
  }
  if (link.level === 'month') {
    return `${link.snapshot.lunarMonth.startDate} 至 ${link.snapshot.lunarMonth.endDate} · 流月命宫落本命${link.snapshot.flowMonth.nativePalaceName}`;
  }
  return `农历${link.snapshot.lunarDay.monthLabel}${link.snapshot.lunarDay.dayLabel} · 流日命宫落本命${link.snapshot.flowDay.nativePalaceName}`;
}

function getMonthlyNavigationDate(
  link: Extract<EventTransitLink, { level: 'month' }>,
  conversation: Conversation | null,
): string {
  const birthInfo = conversation?.birthInfo;
  if (!birthInfo) return link.snapshot.representativeDate;
  const minimumDate = [
    birthInfo.year,
    String(birthInfo.month).padStart(2, '0'),
    String(birthInfo.day).padStart(2, '0'),
  ].join('-');
  const maximumDate = `${Math.min(birthInfo.year + 130, 2200)}-12-31`;
  if (link.snapshot.lunarMonth.startDate < minimumDate) return minimumDate;
  if (link.snapshot.lunarMonth.endDate > maximumDate) return maximumDate;
  return link.snapshot.representativeDate;
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
