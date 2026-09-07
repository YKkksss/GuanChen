'use client';

import RequestFeedback from './RequestFeedback';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Conversation } from '@/lib/conversations/types';
import type { ReportDetail, ReportListItem } from '@/lib/reports/types';
import { HEMING_REPORT_DEFINITION } from '@/lib/reports/types';
import { getRelationshipDefinition } from '@/lib/heming/methodology';

export default function HemingReportsWorkspace({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([
      fetch(`/api/conversations/${conversationId}`, { cache: 'no-store', signal: controller.signal }),
      fetch(`/api/conversations/${conversationId}/reports`, { cache: 'no-store', signal: controller.signal }),
    ])
      .then(async ([conversationResponse, reportsResponse]) => {
        const conversationData = await conversationResponse.json().catch(() => ({})) as { conversation?: Conversation; error?: string };
        const reportsData = await reportsResponse.json().catch(() => ({})) as { reports?: ReportListItem[]; error?: string };
        if (!conversationResponse.ok || !conversationData.conversation) throw new Error(conversationData.error || '合盘会话加载失败');
        if (conversationData.conversation.type !== 'heming') throw new Error('这不是合盘会话');
        if (!reportsResponse.ok) throw new Error(reportsData.error || '报告列表加载失败');
        if (controller.signal.aborted) return;
        setConversation(conversationData.conversation);
        setReports(reportsData.reports ?? []);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '合盘报告中心加载失败');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [conversationId, retry]);

  const report = useMemo(
    () => reports.find(item => item.type === 'relationship'),
    [reports],
  );

  async function generate() {
    setGenerating(true);
    setError('');
    try {
      const response = await fetch(`/api/conversations/${conversationId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'relationship' }),
      });
      const data = await response.json().catch(() => ({})) as ReportDetail & { error?: string };
      if (!response.ok || !data.report) throw new Error(data.error || '合盘报告生成失败');
      router.push(`/heming/${conversationId}/reports/${data.report.id}`);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '合盘报告生成失败');
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <main className="mx-auto max-w-5xl p-6"><RequestFeedback loading="正在加载合盘报告中心…" /></main>;
  if (!conversation) return <main className="mx-auto max-w-5xl p-6"><RequestFeedback error={error || '档案读取失败'} onRetry={() => setRetry(value => value + 1)} /></main>;
  const relationship = conversation.relationshipType
    ? getRelationshipDefinition(conversation.relationshipType)
    : null;

  return (
    <main className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6">
      <div className="mb-6">
        <button type="button" onClick={() => router.push(`/heming/${conversationId}`)} className="mb-3 text-xs" style={{ color: 'var(--t-faint)' }}>← 返回合盘工作台</button>
        <h1 className="text-2xl font-semibold" style={{ color: 'var(--t-text)' }}>合盘报告中心</h1>
        <p className="mt-2 text-xs leading-6" style={{ color: 'var(--t-faint)' }}>
          {conversation.title} · {relationship?.label ?? '其他关系'} · 报告保存结构化依据和历史版本，重新生成不会覆盖旧版本。
        </p>
      </div>

      <button type="button" className="min-h-11 text-sm underline" onClick={() => setRetry(value => value + 1)}>刷新报告列表</button>
      {error && <div role="alert" className="mb-5 rounded-lg px-4 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}

      <article className="rounded-xl card-glass p-6 sm:p-8">
        <div className="text-[10px] font-medium tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>双命盘 · 关系专题</div>
        <h2 className="mt-3 text-xl font-semibold" style={{ color: 'var(--t-text)' }}>{HEMING_REPORT_DEFINITION.label}</h2>
        <p className="mt-3 text-[12px] leading-7" style={{ color: 'var(--t-text2)' }}>{HEMING_REPORT_DEFINITION.description}</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          {HEMING_REPORT_DEFINITION.sectionKeys.map(section => (
            <div key={section.key} className="rounded-lg px-3 py-2 text-[10px]" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>【{section.title}】</div>
          ))}
        </div>
        {report?.activeVersion && <div className="mt-5 text-[10px]" style={{ color: 'var(--t-faint)' }}>已保存 v{report.activeVersion.version} · 共 {report.versionCount} 个版本</div>}
        <button
          type="button"
          disabled={generating}
          onClick={() => report?.activeVersion
            ? router.push(`/heming/${conversationId}/reports/${report.id}`)
            : void generate()}
          className="mt-5 rounded-lg px-6 py-3 text-xs font-medium disabled:opacity-40"
          style={{ color: report?.activeVersion ? 'var(--t-gold)' : '#fffaf3', border: report?.activeVersion ? '1px solid var(--t-border-acc)' : 'none', background: report?.activeVersion ? 'var(--ac-bg)' : 'var(--ac)' }}
        >
          {generating ? '正在生成完整报告…' : report?.activeVersion ? '打开已保存报告' : '生成合盘关系报告'}
        </button>
      </article>

      <div className="mt-6 rounded-xl px-4 py-3 text-[10px] leading-6" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>
        报告只引用甲乙双方命盘快照、程序规则结果和明确确认的关系背景。未确认的信息会保留为待观察事项，不生成匹配分数或替双方作出重大决定。
      </div>
    </main>
  );
}

function PageState({ text, error = false }: { text: string; error?: boolean }) {
  return <main className="mx-auto max-w-[1000px] px-4 py-24 text-center text-sm" style={{ color: error ? '#ef4444' : 'var(--t-faint)' }}>{text}</main>;
}
