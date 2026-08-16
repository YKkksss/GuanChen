'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDots, FileText } from '@phosphor-icons/react';
import ConversationHistory from '@/components/ConversationHistory';
import HemingChatPanel from '@/components/HemingChatPanel';
import type { Conversation, ConversationMessage } from '@/lib/conversations/types';
import type {
  HemingAnnualOwnerView,
  HemingAnnualTransitSnapshot,
  HemingTransitSnapshotRecord,
} from '@/lib/heming/transit-types';
import type { HemingRuleResult } from '@/lib/heming/types';

export default function HemingTransitWorkspace({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedYear = Number.parseInt(searchParams.get('year') ?? '', 10);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [snapshot, setSnapshot] = useState<HemingAnnualTransitSnapshot | null>(null);
  const [year, setYear] = useState(Number.isInteger(requestedYear) ? requestedYear : new Date().getFullYear());
  const [selectedDimension, setSelectedDimension] = useState('');
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  const [loadingConversation, setLoadingConversation] = useState(true);
  const [loadingTransit, setLoadingTransit] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setHistoryCollapsed(window.localStorage.getItem('ziwei-history-collapsed') === 'true');
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/conversations/${conversationId}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { conversation?: Conversation; messages?: ConversationMessage[]; error?: string };
        if (!response.ok || data.conversation?.type !== 'heming' || !data.conversation.chartSnapshotA || !data.conversation.chartSnapshotB) {
          throw new Error(data.error || '合盘会话加载失败');
        }
        return data;
      })
      .then(data => {
        const nextConversation = data.conversation!;
        setConversation(nextConversation);
        setMessages(data.messages ?? []);
        const min = Math.max(nextConversation.birthInfoA?.year ?? year, nextConversation.birthInfoB?.year ?? year);
        const max = Math.min((nextConversation.birthInfoA?.year ?? min) + 130, (nextConversation.birthInfoB?.year ?? min) + 130, 2200);
        setYear(current => Math.max(min, Math.min(max, current)));
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '合盘会话加载失败');
      })
      .finally(() => setLoadingConversation(false));
    return () => controller.abort();
  }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!conversation) return;
    const controller = new AbortController();
    setLoadingTransit(true);
    setError('');
    fetch(`/api/conversations/${conversationId}/heming-transits?year=${year}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { transit?: HemingTransitSnapshotRecord; error?: string };
        if (!response.ok || !data.transit) throw new Error(data.error || '双人年度运限加载失败');
        return data.transit.snapshot;
      })
      .then(next => {
        setSnapshot(next);
        setSelectedDimension(current => next.dimensions.some(item => item.dimensionId === current) ? current : next.dimensions[0]?.dimensionId ?? '');
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setSnapshot(null);
        setError(loadError instanceof Error ? loadError.message : '双人年度运限加载失败');
      })
      .finally(() => setLoadingTransit(false));
    return () => controller.abort();
  }, [conversation, conversationId, year]);

  const minYear = Math.max(conversation?.birthInfoA?.year ?? year, conversation?.birthInfoB?.year ?? year);
  const maxYear = Math.min((conversation?.birthInfoA?.year ?? minYear) + 130, (conversation?.birthInfoB?.year ?? minYear) + 130, 2200);
  const dimension = snapshot?.dimensions.find(item => item.dimensionId === selectedDimension) ?? snapshot?.dimensions[0];
  const dimensionBaseline = useMemo(() => snapshot?.baselineResults.filter(result => result.dimensionId === selectedDimension) ?? [], [selectedDimension, snapshot]);
  const dimensionStage = useMemo(() => snapshot?.stageResults.filter(result => result.dimensionId === selectedDimension) ?? [], [selectedDimension, snapshot]);

  const toggleHistory = () => {
    setHistoryCollapsed(current => {
      const next = !current;
      window.localStorage.setItem('ziwei-history-collapsed', String(next));
      return next;
    });
  };

  return (
    <main className="mx-auto max-w-[1800px] px-3 py-4 md:px-4">
      <div className={`grid grid-cols-1 items-start gap-4 ${historyCollapsed ? 'xl:grid-cols-[64px_minmax(0,1fr)]' : 'xl:grid-cols-[260px_minmax(0,1fr)]'}`}>
        <ConversationHistory conversationType="heming" activeConversationId={conversationId} collapsed={historyCollapsed} onToggle={toggleHistory} />
        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => router.push(`/heming/${conversationId}`)} className="rounded-lg px-3 py-1.5 text-xs" style={{ border: '1px solid var(--t-border)', color: 'var(--t-text)' }}>← 返回合盘</button>
              <button onClick={() => router.push(`/heming/${conversationId}/reports`)} className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs" style={{ border: '1px solid var(--t-border)', color: 'var(--t-faint)' }}><FileText size={13} />合盘报告</button>
            </div>
            <div className="text-right"><h1 className="text-sm font-medium" style={{ color: 'var(--t-text)' }}>双人年度运限</h1><p className="mt-0.5 text-[9px]" style={{ color: 'var(--t-faint)' }}>本命基线 · 双方大限 · 年度触发</p></div>
          </div>

          {loadingConversation && <PageState text="正在加载双方命盘…" />}
          {!loadingConversation && conversation && (
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,390px)]">
              <div className="min-w-0 space-y-4">
                <section className="rounded-xl card-glass p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div><div className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: 'var(--t-gold)' }}><CalendarDots size={15} />选择分析年份</div><p className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>统一采用当年 7 月 1 日定位双方年度结构</p></div>
                    <div className="flex items-center gap-2">
                      <button aria-label="上一年" disabled={year <= minYear || loadingTransit} onClick={() => setYear(value => Math.max(minYear, value - 1))} className="h-8 w-8 rounded-lg disabled:opacity-30" style={{ border: '1px solid var(--t-border)' }}>←</button>
                      <input aria-label="双人分析年份" type="number" min={minYear} max={maxYear} value={year} onChange={event => { const next = Number.parseInt(event.target.value, 10); if (Number.isInteger(next)) setYear(Math.max(minYear, Math.min(maxYear, next))); }} className="h-8 w-24 rounded-lg bg-transparent px-2 text-center text-sm outline-none" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border)' }} />
                      <button aria-label="下一年" disabled={year >= maxYear || loadingTransit} onClick={() => setYear(value => Math.min(maxYear, value + 1))} className="h-8 w-8 rounded-lg disabled:opacity-30" style={{ border: '1px solid var(--t-border)' }}>→</button>
                    </div>
                  </div>
                  {loadingTransit && <div className="py-12 text-center text-xs" style={{ color: 'var(--t-faint)' }}>正在计算双方年度结构…</div>}
                  {!loadingTransit && error && <div className="mt-4 rounded-lg p-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}
                  {!loadingTransit && snapshot && <div className="mt-4 grid gap-3 md:grid-cols-2"><OwnerYearCard view={snapshot.ownerA} /><OwnerYearCard view={snapshot.ownerB} /></div>}
                </section>

                {snapshot && (
                  <section className="rounded-xl card-glass p-4">
                    <div className="mb-3"><h2 className="text-[12px] font-semibold" style={{ color: 'var(--t-text)' }}>关系主题年度触发</h2><p className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>被激活只代表该主题更值得观察，不表示好坏或必然事件</p></div>
                    <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">{snapshot.dimensions.map(item => <button key={item.dimensionId} onClick={() => setSelectedDimension(item.dimensionId)} className="shrink-0 rounded-full px-3 py-1.5 text-[9px]" style={{ color: item.dimensionId === selectedDimension ? 'var(--t-gold)' : 'var(--t-faint)', border: `1px solid ${item.dimensionId === selectedDimension ? 'rgba(212,168,67,.35)' : 'var(--t-border)'}` }}>{item.label}</button>)}</div>
                    {dimension && <div className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)' }}><div className="mb-2 flex items-center justify-between gap-2"><span className="text-[11px] font-medium" style={{ color: 'var(--t-text)' }}>{dimension.label}</span><ActivationBadge activation={dimension.activation} /></div><p className="text-[10px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>{dimension.observation}</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><ActivationList label={`甲方 · ${snapshot.roles.A}`} items={dimension.ownerAActivations} /><ActivationList label={`乙方 · ${snapshot.roles.B}`} items={dimension.ownerBActivations} /></div></div>}
                  </section>
                )}

                {snapshot && (
                  <section className="rounded-xl card-glass p-4">
                    <h2 className="text-[12px] font-semibold" style={{ color: 'var(--t-text)' }}>分层规则结果</h2>
                    <p className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>本命关系基线保持稳定；阶段结果按 {year} 年双方所在大限重新计算</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-2"><ResultGroup title="本命关系基线" results={dimensionBaseline} empty="当前维度没有命中本命基线规则" /><ResultGroup title={`${year} 年大限阶段`} results={dimensionStage} empty="当前维度没有命中双方同步阶段规则" /></div>
                    <div className="mt-4 space-y-1">{snapshot.warnings.map(warning => <p key={warning} className="text-[9px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>※ {warning}</p>)}</div>
                    <div className="mt-3 rounded-lg px-3 py-2 text-[9px] leading-relaxed" style={{ color: 'var(--t-faint)', background: 'rgba(212,168,67,.06)' }}>{snapshot.disclaimer}</div>
                  </section>
                )}
              </div>
              <aside className="min-w-0 lg:sticky lg:top-4"><HemingChatPanel key={`${conversationId}-${year}`} conversationId={conversationId} initialMessages={messages} relationshipType={conversation.relationshipType ?? 'custom'} transitYear={year} /></aside>
            </div>
          )}
          {!loadingConversation && !conversation && <PageState text={error || '合盘会话加载失败'} error />}
        </section>
      </div>
    </main>
  );
}

function OwnerYearCard({ view }: { view: HemingAnnualOwnerView }) {
  const transit = view.transit;
  return <article className="rounded-xl p-4" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}><div className="text-[10px] font-medium tracking-[.16em]" style={{ color: 'var(--t-gold)' }}>{view.owner === 'A' ? '甲方' : '乙方'} · {view.role}</div><div className="mt-3 grid grid-cols-2 gap-2"><Fact label="流年干支" value={transit.year.ganZhi} /><Fact label="虚岁" value={`${transit.nominalAge} 岁`} /><Fact label="所在大限" value={`${transit.decadal.startAge ?? '?'}-${transit.decadal.endAge ?? '?'} 岁 · ${transit.decadal.nativePalaceName}`} /><Fact label="流年命宫" value={`落本命${transit.flowYear.nativePalaceName}`} /></div><div className="mt-3 flex flex-wrap gap-1.5">{transit.transformations.map(item => <span key={`${item.type}-${item.starName}`} className="rounded-full px-2 py-1 text-[9px]" style={{ color: item.type === '忌' ? '#c56d5c' : 'var(--t-faint)', border: '1px solid var(--t-border)' }}>{item.starName}化{item.type} → {item.natalPalaceName ?? '未定位'}</span>)}</div></article>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}</div><div className="mt-1 text-[10px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>{value}</div></div>;
}

function ActivationBadge({ activation }: { activation: 'both' | 'A' | 'B' | 'none' }) {
  const labels = { both: '双方同时激活', A: '甲方侧激活', B: '乙方侧激活', none: '未直接激活' };
  return <span className="rounded-full px-2 py-0.5 text-[9px]" style={{ color: activation === 'both' ? 'var(--t-gold)' : 'var(--t-faint)', border: '1px solid var(--t-border)' }}>{labels[activation]}</span>;
}

function ActivationList({ label, items }: { label: string; items: Array<{ palace: string; reasons: string[] }> }) {
  return <div className="rounded-lg p-2.5" style={{ background: 'var(--t-card)' }}><div className="mb-1.5 text-[9px]" style={{ color: 'var(--t-gold)' }}>{label}</div>{items.length ? items.map(item => <div key={item.palace} className="text-[9px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>{item.palace}：{item.reasons.join('、')}</div>) : <div className="text-[9px]" style={{ color: 'var(--t-faint)' }}>没有直接命中该维度宫位</div>}</div>;
}

function ResultGroup({ title, results, empty }: { title: string; results: HemingRuleResult[]; empty: string }) {
  return <div><h3 className="mb-2 text-[10px] font-medium" style={{ color: 'var(--t-gold)' }}>{title}</h3><div className="space-y-2">{results.length ? results.map(result => <div key={`${result.phase}-${result.ruleId}`} className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)' }}><div className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{result.ruleId} · {result.confidence} 置信度</div><p className="mt-1.5 text-[10px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>{result.conclusion}</p></div>) : <div className="rounded-lg p-3 text-[9px]" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>{empty}</div>}</div></div>;
}

function PageState({ text, error = false }: { text: string; error?: boolean }) {
  return <div className="rounded-xl card-glass py-24 text-center text-sm" style={{ color: error ? '#ef4444' : 'var(--t-faint)' }}>{text}</div>;
}
