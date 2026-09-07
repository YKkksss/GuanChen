'use client';

import RequestFeedback from './RequestFeedback';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Conversation } from '@/lib/conversations/types';
import type { ReportDetail, ReportListItem, ReportType } from '@/lib/reports/types';
import { REPORT_TYPES, REPORT_TYPE_DEFINITIONS } from '@/lib/reports/types';

export default function ReportsWorkspace({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingType, setGeneratingType] = useState<ReportType | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  const reportsByType = useMemo(
    () => new Map(reports.map(report => [report.type, report])),
    [reports],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([
      fetch(`/api/conversations/${conversationId}`, { cache: 'no-store', signal: controller.signal }),
      fetch(`/api/conversations/${conversationId}/reports`, { cache: 'no-store', signal: controller.signal }),
    ])
      .then(async ([conversationResponse, reportsResponse]) => {
        const conversationData = await conversationResponse.json().catch(() => ({})) as { conversation?: Conversation; error?: string };
        const reportsData = await reportsResponse.json().catch(() => ({})) as { reports?: ReportListItem[]; error?: string };
        if (!conversationResponse.ok || !conversationData.conversation) {
          throw new Error(conversationData.error || '命盘会话加载失败');
        }
        if (!reportsResponse.ok) throw new Error(reportsData.error || '报告列表加载失败');
        if (controller.signal.aborted) return;
        setConversation(conversationData.conversation);
        setReports(reportsData.reports ?? []);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '报告中心加载失败');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [conversationId, retry]);

  const generate = async (type: ReportType) => {
    setGeneratingType(type);
    setError('');
    try {
      const response = await fetch(`/api/conversations/${conversationId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await response.json().catch(() => ({})) as ReportDetail & { error?: string };
      if (!response.ok || !data.report) throw new Error(data.error || '报告生成失败');
      router.push(`/chart/${conversationId}/reports/${data.report.id}`);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '报告生成失败');
    } finally {
      setGeneratingType(null);
    }
  };

  if (loading) {
    return <main className="p-6"><RequestFeedback loading="正在加载报告中心…" /></main>;
  }

  if (error && !conversation) {
    return <main className="p-6"><RequestFeedback error={error} onRetry={() => setRetry(value => value + 1)} /></main>;
  }

  return (
    <main className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => router.push(`/chart/${conversationId}`)}
            className="mb-3 text-xs"
            style={{ color: 'var(--t-faint)' }}
          >
            ← 返回命盘
          </button>
          <h1 className="text-2xl font-semibold" style={{ color: 'var(--t-text)' }}>专题报告中心</h1>
          <p className="mt-2 text-xs leading-6" style={{ color: 'var(--t-faint)' }}>
            {conversation?.title} · 报告会保存命盘依据和历史版本，重新生成不会覆盖旧版本。
          </p>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/chart/${conversationId}/timeline`)}
          className="rounded-lg px-4 py-2 text-xs"
          style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.28)' }}
        >
          查看年度报告 →
        </button>
      </div>

      <button type="button" className="min-h-11 text-sm underline" onClick={() => setRetry(value => value + 1)}>刷新报告列表</button>
      <RequestFeedback error={error} />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {REPORT_TYPES.map(type => {
          const definition = REPORT_TYPE_DEFINITIONS[type];
          const report = reportsByType.get(type);
          const isGenerating = generatingType === type;
          return (
            <article key={type} className="flex min-h-[220px] flex-col rounded-xl card-glass p-5">
              <div className="text-[10px] font-medium tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>
                {type === 'current_daxian' ? '阶段报告' : '本命专题'}
              </div>
              <h2 className="mt-3 text-base font-semibold" style={{ color: 'var(--t-text)' }}>{definition.label}</h2>
              <p className="mt-2 flex-1 text-[11px] leading-6" style={{ color: 'var(--t-text2)' }}>
                {definition.description}
              </p>
              {report?.activeVersion && (
                <div className="mb-3 text-[9px]" style={{ color: 'var(--t-faint)' }}>
                  已保存 v{report.activeVersion.version} · 共 {report.versionCount} 个版本
                </div>
              )}
              <button
                type="button"
                disabled={Boolean(generatingType)}
                onClick={() => report?.activeVersion
                  ? router.push(`/chart/${conversationId}/reports/${report.id}`)
                  : generate(type)}
                className="rounded-lg px-4 py-2.5 text-xs transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  color: report?.activeVersion ? 'var(--t-gold)' : '#fffaf3',
                  border: report?.activeVersion ? '1px solid rgba(212,168,67,.28)' : 'none',
                  background: report?.activeVersion ? 'var(--ac-bg)' : 'var(--ac)',
                }}
              >
                {isGenerating ? '正在生成…' : report?.activeVersion ? '打开报告' : '生成报告'}
              </button>
            </article>
          );
        })}

        <article className="flex min-h-[220px] flex-col rounded-xl card-glass p-5">
          <div className="text-[10px] font-medium tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>运限专题</div>
          <h2 className="mt-3 text-base font-semibold" style={{ color: 'var(--t-text)' }}>年度运势报告</h2>
          <p className="mt-2 flex-1 text-[11px] leading-6" style={{ color: 'var(--t-text2)' }}>
            选择具体年份，结合本命、大限与流年生成完整年度总结。
          </p>
          <button
            type="button"
            onClick={() => router.push(`/chart/${conversationId}/timeline`)}
            className="rounded-lg px-4 py-2.5 text-xs"
            style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.28)', background: 'rgba(212,168,67,.05)' }}
          >
            选择年份
          </button>
        </article>
      </section>

      <div className="mt-6 rounded-xl px-4 py-3 text-[10px] leading-6" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>
        报告只引用命盘快照、程序识别结果和用户明确确认的人生事件。AI 负责组织解释，不负责补算命盘或编造现实经历。
      </div>
    </main>
  );
}

function PageState({ text, error = false }: { text: string; error?: boolean }) {
  return (
    <main className="mx-auto max-w-[1180px] px-4 py-24 text-center text-sm" style={{ color: error ? '#ef4444' : 'var(--t-faint)' }}>
      {text}
    </main>
  );
}
