'use client';

import { ArrowLeft, ArrowSquareOut, Printer, SpinnerGap } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RectificationReportDetail, RectificationReportEvidence } from '@/lib/rectification/report-types';

export default function RectificationReportDetailWorkspace({ sessionId, reportId }: { sessionId: string; reportId: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<RectificationReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async (version?: number) => {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/rectification-reports/${reportId}${version ? `?version=${version}` : ''}`, { cache: 'no-store' });
      const data = await response.json() as RectificationReportDetail & { error?: string };
      if (!response.ok || !data.report) throw new Error(data.error || '校时报告加载失败');
      setDetail(data);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : '校时报告加载失败'); }
    finally { setLoading(false); }
  }, [reportId]);
  useEffect(() => { void load(); }, [load]);

  const evidenceBySection = useMemo(() => {
    const map = new Map<string, RectificationReportEvidence[]>();
    for (const item of detail?.evidence ?? []) map.set(item.sectionKey, [...(map.get(item.sectionKey) ?? []), item]);
    return map;
  }, [detail?.evidence]);

  const regenerate = async () => {
    setBusy('regenerate'); setError('');
    try {
      const response = await fetch(`/api/rectification-reports/${reportId}/regenerate`, { method: 'POST' });
      const data = await response.json() as RectificationReportDetail & { error?: string };
      if (!response.ok || !data.report) throw new Error(data.error || '重新生成失败');
      setDetail(data);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : '重新生成失败'); }
    finally { setBusy(''); }
  };

  const openConversation = async () => {
    setBusy('conversation'); setError('');
    try {
      const response = await fetch(`/api/rectifications/${sessionId}/conversation`, { method: 'POST' });
      const data = await response.json() as { conversationId?: string; error?: string };
      if (!response.ok || !data.conversationId) throw new Error(data.error || '创建工作命盘失败');
      router.push(`/chart/${data.conversationId}`);
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : '创建工作命盘失败'); }
    finally { setBusy(''); }
  };

  if (loading && !detail) return <State text="正在加载校时报告…" />;
  if (!detail) return <State text={error || '校时报告不存在'} error />;
  const content = detail.version?.content;
  return (
    <main className="report-print-area min-h-[100dvh] px-4 py-6" style={{ background: 'var(--bg-0)', color: 'var(--tx-1)' }}>
      <div className="mx-auto max-w-[1000px]">
        <div className="report-controls flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="btn-ghost !px-3 !py-2" onClick={() => router.push(`/rectification/${sessionId}/reports`)}><ArrowLeft size={16} /> 返回报告中心</button>
          <div className="flex flex-wrap items-center gap-2">
            <select value={detail.version?.version ?? ''} onChange={event => void load(Number(event.target.value))} className="rectification-input !w-auto !py-2 text-xs">
              {detail.versions.map(version => <option key={version.id} value={version.version}>v{version.version} · {version.status === 'completed' ? '已完成' : version.status === 'failed' ? '失败' : '生成中'}</option>)}
            </select>
            <button type="button" className="btn-ghost !px-3 !py-2" disabled={!content} onClick={() => window.print()}><Printer size={16} /> 打印 / PDF</button>
            <button type="button" className="btn-ghost !px-3 !py-2" disabled={Boolean(busy)} onClick={() => void regenerate()}>{busy === 'regenerate' ? <SpinnerGap className="animate-spin" size={16} /> : null}重新生成</button>
            <button type="button" className="btn-accent !px-3 !py-2" disabled={Boolean(busy) || !detail.version?.selectionId} onClick={() => void openConversation()}><ArrowSquareOut size={16} /> {busy === 'conversation' ? '正在创建…' : '进入工作命盘'}</button>
          </div>
        </div>
        {error && <div className="report-controls mt-4 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'rgba(168,50,40,.35)', color: 'var(--ji)' }}>{error}。已完成的旧版本不会受影响。</div>}
        <article className="mt-5 overflow-hidden rounded-xl border" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
          <header className="border-b px-6 py-8 text-center" style={{ borderColor: 'var(--bdr)' }}>
            <p className="text-[10px] tracking-[.28em]" style={{ color: 'var(--ac-dim)' }}>紫微斗数 · 出生时辰校时</p>
            <h1 className="mt-4 text-2xl font-semibold">{detail.report.title}</h1>
            <p className="mt-3 text-[10px]" style={{ color: 'var(--tx-3)' }}>报告 v{detail.version?.version ?? '-'} · 评估版本 ID {detail.version?.evaluationId.slice(0, 8) ?? '-'} · 方法 {detail.version?.methodologyVersion ?? '-'}</p>
          </header>
          {!content ? <div className="px-6 py-20 text-center text-sm" style={{ color: detail.version?.status === 'failed' ? 'var(--ji)' : 'var(--tx-3)' }}>{detail.version?.status === 'failed' ? '这个版本生成失败，请查看旧版本或重新生成。' : '报告正在生成。'}</div> : (
            <div className="px-6 py-8 sm:px-10">
              <section className="rounded-xl border p-5" style={{ borderColor: 'rgba(138,112,24,.22)', background: 'rgba(138,112,24,.06)' }}><h2 className="text-xs font-semibold" style={{ color: 'var(--ac-dim)' }}>结论摘要</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7" style={{ color: 'var(--tx-2)' }}>{content.summary}</p></section>
              <div className="mt-8 space-y-9">{content.sections.map(section => {
                const evidence = evidenceBySection.get(section.key) ?? [];
                return <section key={section.key}><div className="flex items-center gap-2"><h2 className="text-base font-semibold">【{section.title}】</h2><span className="rounded-full px-2 py-0.5 text-[9px]" style={{ color: 'var(--ac-dim)', background: 'var(--ac-bg)' }}>{evidence.length ? `${evidence.length} 条依据` : '综合观察'}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-8" style={{ color: 'var(--tx-2)' }}>{section.content}</p>{evidence.length > 0 && <details className="report-evidence mt-4 rounded-lg border px-4 py-3" style={{ borderColor: 'var(--bdr)' }}><summary className="cursor-pointer text-xs" style={{ color: 'var(--ac-dim)' }}>查看本节结构化依据</summary><div className="mt-3 space-y-3">{evidence.map(item => <div key={item.id} className="text-xs leading-6" style={{ color: 'var(--tx-3)' }}><p className="font-medium" style={{ color: 'var(--tx-2)' }}>{item.label}</p><p>{summarizeEvidence(item)}</p></div>)}</div></details>}</section>;
              })}</div>
              {content.actionItems.length > 0 && <section className="mt-10"><h2 className="text-base font-semibold">【执行清单】</h2><ol className="mt-4 space-y-2 text-sm leading-7" style={{ color: 'var(--tx-2)' }}>{content.actionItems.map((item, index) => <li key={index}>{index + 1}. {item}</li>)}</ol></section>}
              {content.openQuestions.length > 0 && <section className="mt-10"><h2 className="text-base font-semibold">【待核实问题】</h2><ul className="mt-4 space-y-2 text-sm leading-7" style={{ color: 'var(--tx-2)' }}>{content.openQuestions.map((item, index) => <li key={index}>· {item}</li>)}</ul></section>}
              <footer className="mt-10 rounded-lg p-4 text-xs leading-6" style={{ color: 'var(--tx-3)', background: 'var(--bg-1)' }}>{content.disclaimer}</footer>
            </div>
          )}
        </article>
      </div>
      <style jsx global>{`@media print { body { background:#fff!important; } body * { visibility:hidden; } .report-print-area,.report-print-area * { visibility:visible; } .report-print-area { position:absolute; inset:0; padding:0!important; } .report-controls { display:none!important; } .report-print-area article { border:0!important; background:#fff!important; } .report-evidence { break-inside:avoid; } }`}</style>
    </main>
  );
}

function summarizeEvidence(item: RectificationReportEvidence): string {
  if (item.kind === 'candidate_summary') return `第 ${String(item.facts.rank)} 位 · 相对证据指数 ${String(item.facts.relativeEvidenceIndex)} · ${String(item.facts.confidence)} 置信度`;
  if (item.kind === 'rule_hit') return `${String(item.facts.ruleId)} · ${String(item.facts.outcome)} · 权重 ${String(item.facts.adjustedWeight)}`;
  if (item.kind === 'confirmed_event') return `${String(item.facts.startDate || '时间未知')} · ${String(item.facts.categoryLabel || '')} · 影响等级 ${String(item.facts.impactLevel)}`;
  if (item.kind === 'selection') return `人工选定 · 第 ${String(item.facts.rank)} 位 · ${String(item.facts.note || '未填写补充说明')}`;
  if (item.kind === 'stability') return `${item.facts.stable ? '稳定' : '尚不稳定'} · 顶部差距 ${String(item.facts.topMarginRatio ?? '无')}`;
  return '评估版本、证据就绪度与候选排序的不可变事实快照。';
}
function State({ text, error = false }: { text: string; error?: boolean }) { return <main className="min-h-[100dvh] px-4 py-24 text-center text-sm" style={{ background: 'var(--bg-0)', color: error ? 'var(--ji)' : 'var(--tx-3)' }}>{text}</main>; }
