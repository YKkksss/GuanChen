'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  EventAnalysisDetail,
  EventAnalysisEvidence,
  EventAnalysisSummary,
} from '@/lib/events/analysis-types';
import type { LifeEventWithTransits } from '@/lib/events/types';
import { REPORT_GENERATION_REASON_LABELS } from '@/lib/reports/types';

interface LifeEventAnalysisPanelProps {
  conversationId: string;
  event: LifeEventWithTransits;
  onSummaryChange: (summary: EventAnalysisSummary) => void;
}

export default function LifeEventAnalysisPanel({
  conversationId,
  event,
  onSummaryChange,
}: LifeEventAnalysisPanelProps) {
  const [detail, setDetail] = useState<EventAnalysisDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (version?: number) => {
    setLoading(true);
    setError('');
    try {
      const query = version ? `?version=${version}` : '';
      const response = await fetch(
        `/api/conversations/${conversationId}/events/${event.id}/analysis${query}`,
        { cache: 'no-store' },
      );
      const data = await response.json() as { detail?: EventAnalysisDetail | null; error?: string };
      if (!response.ok) throw new Error(data.error || '事件回溯分析读取失败');
      setDetail(data.detail ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '事件回溯分析读取失败');
    } finally {
      setLoading(false);
    }
  }, [conversationId, event.id]);

  useEffect(() => { void load(); }, [load]);

  const generate = async (regenerate: boolean) => {
    setGenerating(true);
    setError('');
    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/events/${event.id}/analysis`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ regenerate }),
        },
      );
      const data = await response.json() as { detail?: EventAnalysisDetail; error?: string };
      if (!response.ok || !data.detail) throw new Error(data.error || '事件回溯分析生成失败');
      setDetail(data.detail);
      onSummaryChange(toSummary(data.detail));
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '事件回溯分析生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const version = detail?.version ?? null;
  const content = version?.content ?? null;
  const evidenceByKey = useMemo(() => new Map(
    (detail?.evidence ?? []).map(item => [item.evidenceKey, item]),
  ), [detail?.evidence]);
  const uniqueEvidence = useMemo(() => Array.from(new Map(
    (detail?.evidence ?? []).map(item => [item.evidenceKey, item]),
  ).values()), [detail?.evidence]);
  const transitEvidence = uniqueEvidence.filter(item => item.source === 'rule_engine');

  return (
    <section
      className="mt-3 overflow-hidden rounded-lg"
      style={{ border: '1px solid rgba(212,168,67,.24)', background: 'var(--t-bg2)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <div>
          <div className="text-[10px] font-medium" style={{ color: 'var(--t-gold)' }}>事件专项回溯</div>
          <div className="mt-0.5 text-[8px]" style={{ color: 'var(--t-faint)' }}>事实、时间结构、解释与待验证项分层保存</div>
        </div>
        <div className="flex items-center gap-2">
          {detail && detail.versions.length > 1 && version && (
            <select
              value={version.version}
              onChange={change => void load(Number(change.target.value))}
              disabled={loading || generating}
              aria-label="回溯分析版本"
              className="rounded-md px-2 py-1 text-[9px] disabled:opacity-40"
              style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }}
            >
              {detail.versions.map(item => (
                <option key={item.id} value={item.version}>v{item.version} · {formatStatus(item.status)}</option>
              ))}
            </select>
          )}
          {version?.status === 'completed' && (
            <button
              type="button"
              onClick={() => void generate(true)}
              disabled={generating}
              className="rounded-md px-2.5 py-1 text-[9px] disabled:opacity-40"
              style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.28)' }}
            >
              {generating ? '正在重新生成…' : '重新生成'}
            </button>
          )}
        </div>
      </div>

      {loading && !detail && (
        <div className="px-4 py-8 text-center text-[10px]" style={{ color: 'var(--t-faint)' }}>正在读取已保存的回溯分析…</div>
      )}

      {error && (
        <div className="mx-3 mt-3 rounded-md px-3 py-2 text-[9px] text-red-500" style={{ border: '1px solid rgba(239,68,68,.24)' }}>
          {error}
        </div>
      )}

      {!loading && !detail && (
        <div className="px-4 py-7 text-center">
          <div className="text-[10px]" style={{ color: 'var(--t-text)' }}>还没有为这件事生成专项回溯</div>
          <p className="mx-auto mt-1 max-w-xl text-[9px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>
            系统会使用你确认的事件原文和已计算的运限快照，生成一份可缓存、可回看的分析，不会把时间重合写成现实因果。
          </p>
          <button
            type="button"
            onClick={() => void generate(false)}
            disabled={generating}
            className="mt-3 rounded-md px-3 py-1.5 text-[9px] disabled:opacity-40"
            style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.30)', background: 'rgba(212,168,67,.07)' }}
          >
            {generating ? '正在生成回溯分析…' : '生成事件回溯分析'}
          </button>
        </div>
      )}

      {detail?.isStale && (
        <div className="mx-3 mt-3 rounded-md px-3 py-2 text-[9px] leading-relaxed" style={{ color: '#f59e0b', border: '1px solid rgba(245,158,11,.24)', background: 'rgba(245,158,11,.06)' }}>
          事件内容或运限依据已经变化。当前仍展示历史版本，请点击“重新生成”建立基于最新事实的新版本。
        </div>
      )}

      {generating && content && (
        <div className="mx-3 mt-3 rounded-md px-3 py-2 text-[9px]" style={{ color: 'var(--t-gold)', background: 'rgba(212,168,67,.06)' }}>
          正在生成新版本，完成前继续保留当前报告。
        </div>
      )}

      {content && version && (
        <article className="space-y-4 px-3 py-3.5">
          <div className="rounded-md p-3" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[9px] font-medium" style={{ color: 'var(--t-gold)' }}>用户确认的原始事件</span>
              <span className="text-[8px]" style={{ color: 'var(--t-faint)' }}>{formatEventDate(event)} · 影响 {event.impactLevel}/5</span>
            </div>
            <div className="mt-1.5 text-[11px] font-medium" style={{ color: 'var(--t-text)' }}>{event.title}</div>
            {event.description && <p className="mt-1 text-[9px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>{event.description}</p>}
          </div>

          <div>
            <div className="text-[12px] font-medium" style={{ color: 'var(--t-text)' }}>{content.title}</div>
            <div className="mt-1 text-[8px]" style={{ color: 'var(--t-faint)' }}>
              v{version.version} · {REPORT_GENERATION_REASON_LABELS[version.generationReason]} · {formatCompletedAt(version.completedAt)}
            </div>
            <p className="mt-2 text-[10px] leading-6" style={{ color: 'var(--t-text2)' }}>{content.summary}</p>
          </div>

          {transitEvidence.length > 0 && (
            <div className="rounded-md p-3" style={{ border: '1px solid var(--t-border)', background: 'rgba(212,168,67,.035)' }}>
              <div className="text-[9px] font-medium" style={{ color: 'var(--t-gold)' }}>程序运限证据</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {transitEvidence.map(item => (
                  <span key={item.evidenceKey} className="rounded-full px-2 py-1 text-[8px]" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>
                    {item.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2 lg:grid-cols-2">
            {content.sections.map(section => (
              <section key={section.key} className="rounded-md p-3" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[10px] font-medium" style={{ color: 'var(--t-gold)' }}>{section.title}</h4>
                  <span className="text-[8px]" style={{ color: 'var(--t-faint)' }}>{section.basis === 'evidence' ? '证据层' : '解释层'}</span>
                </div>
                <RichText text={section.content} />
                {section.evidenceIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {section.evidenceIds.map(id => (
                      <span key={id} className="rounded px-1.5 py-0.5 text-[7px]" style={{ color: 'var(--t-faint)', background: 'var(--t-bg2)' }}>
                        {evidenceByKey.get(id)?.label ?? id}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          {(content.actionItems.length > 0 || content.openQuestions.length > 0) && (
            <div className="grid gap-2 lg:grid-cols-2">
              <ListCard title="现实复盘建议" items={content.actionItems} />
              <ListCard title="仍需自己核对" items={content.openQuestions} />
            </div>
          )}

          <div className="rounded-md px-3 py-2 text-[8px] leading-relaxed" style={{ color: 'var(--t-faint)', background: 'rgba(212,168,67,.04)' }}>
            {content.disclaimer}
          </div>
        </article>
      )}

      {!loading && detail && !content && !generating && (
        <div className="px-4 py-6 text-center text-[9px]" style={{ color: 'var(--t-faint)' }}>
          {version?.status === 'failed' ? '该版本生成失败，可点击下方按钮重新尝试。' : '回溯分析仍在生成中。'}
          <div>
            <button type="button" onClick={() => void generate(true)} className="mt-2 text-[9px]" style={{ color: 'var(--t-gold)' }}>重新尝试</button>
          </div>
        </div>
      )}
    </section>
  );
}

function RichText({ text }: { text: string }) {
  return <div className="mt-2 space-y-1">{text.split('\n').filter(Boolean).map((line, index) => <p key={index} className="text-[9px] leading-5" style={{ color: 'var(--t-text2)' }}>{line}</p>)}</div>;
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-md p-3" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
      <h4 className="text-[10px] font-medium" style={{ color: 'var(--t-gold)' }}>{title}</h4>
      {items.length > 0
        ? <ul className="mt-2 space-y-1">{items.map((item, index) => <li key={index} className="text-[9px] leading-5" style={{ color: 'var(--t-text2)' }}>{index + 1}. {item}</li>)}</ul>
        : <div className="mt-2 text-[8px]" style={{ color: 'var(--t-faint)' }}>本版本暂无内容</div>}
    </section>
  );
}

function toSummary(detail: EventAnalysisDetail): EventAnalysisSummary {
  return {
    analysisId: detail.analysis.id,
    eventId: detail.analysis.eventId,
    activeVersionId: detail.analysis.activeVersionId,
    version: detail.version?.version ?? null,
    versionCount: detail.versions.length,
    status: detail.version?.status ?? null,
    generationReason: detail.version?.generationReason ?? null,
    completedAt: detail.version?.completedAt ?? null,
    updatedAt: detail.analysis.updatedAt,
    isStale: detail.isStale,
  };
}

function formatStatus(status: string): string {
  if (status === 'completed') return '已完成';
  if (status === 'failed') return '失败';
  return '生成中';
}

function formatCompletedAt(value: number | null): string {
  return value
    ? new Date(value).toLocaleString('zh-CN', { hour12: false })
    : '尚未完成';
}

function formatEventDate(event: LifeEventWithTransits): string {
  if (event.datePrecision === 'unknown') return '日期不详';
  if (event.datePrecision === 'range') return `${event.startDate} 至 ${event.endDate}`;
  return event.startDate;
}
