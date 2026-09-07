'use client';

import RequestFeedback from './RequestFeedback';
import { ArrowLeft, FileText, Scales, ShieldCheck } from '@phosphor-icons/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { RectificationEvaluationState, RectificationSessionDetail } from '@/lib/rectification/types';
import type { RectificationReportDetail, RectificationReportListItem } from '@/lib/rectification/report-types';

export default function RectificationReportsWorkspace({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [session, setSession] = useState<RectificationSessionDetail | null>(null);
  const [evaluation, setEvaluation] = useState<RectificationEvaluationState>({ evaluation: null, isCurrent: false });
  const [reports, setReports] = useState<RectificationReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([
      fetch(`/api/rectifications/${sessionId}`, { cache: 'no-store', signal: controller.signal }),
      fetch(`/api/rectifications/${sessionId}/evaluation`, { cache: 'no-store', signal: controller.signal }),
      fetch(`/api/rectifications/${sessionId}/reports`, { cache: 'no-store', signal: controller.signal }),
    ]).then(async ([sessionResponse, evaluationResponse, reportsResponse]) => {
      const sessionData = await sessionResponse.json() as { session?: RectificationSessionDetail; error?: string };
      const evaluationData = await evaluationResponse.json() as RectificationEvaluationState & { error?: string };
      const reportsData = await reportsResponse.json() as { reports?: RectificationReportListItem[]; error?: string };
      if (!sessionResponse.ok || !sessionData.session) throw new Error(sessionData.error || '校时会话加载失败');
      if (!evaluationResponse.ok) throw new Error(evaluationData.error || '评估状态加载失败');
      if (!reportsResponse.ok) throw new Error(reportsData.error || '报告列表加载失败');
      if (controller.signal.aborted) return;
      setSession(sessionData.session);
      setEvaluation({ evaluation: evaluationData.evaluation, isCurrent: evaluationData.isCurrent });
      setReports(reportsData.reports ?? []);
    }).catch(loadError => {
      if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
      setError(loadError instanceof Error ? loadError.message : '报告中心加载失败');
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sessionId, retry]);

  const report = reports[0];
  const generate = async () => {
    setGenerating(true); setError('');
    try {
      const response = await fetch(`/api/rectifications/${sessionId}/reports`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      const data = await response.json() as RectificationReportDetail & { error?: string };
      if (!response.ok || !data.report) throw new Error(data.error || '校时报告生成失败');
      router.push(`/rectification/${sessionId}/reports/${data.report.id}`);
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : '校时报告生成失败');
    } finally { setGenerating(false); }
  };

  if (loading) return <main className="mx-auto max-w-5xl p-6"><RequestFeedback loading="正在加载校时报告中心…" /></main>;
  if (!session) return <main className="mx-auto max-w-5xl p-6"><RequestFeedback error={error || '档案读取失败'} onRetry={() => setRetry(value => value + 1)} /></main>;
  const ready = Boolean(evaluation.evaluation && evaluation.isCurrent);

  return (
    <main className="min-h-[100dvh] px-4 py-6" style={{ background: 'var(--bg-0)', color: 'var(--tx-1)' }}>
      <div className="mx-auto max-w-[1100px]">
        <button type="button" className="btn-ghost !px-3 !py-2" onClick={() => router.push(`/rectification/${sessionId}`)}>
          <ArrowLeft size={16} /> 返回校时工作台
        </button>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] tracking-[.24em]" style={{ color: 'var(--ac-dim)' }}>M5 · 出生时辰校时</p>
            <h1 className="mt-2 text-2xl font-semibold">校时结论报告</h1>
            <p className="mt-2 text-sm" style={{ color: 'var(--tx-3)' }}>{session.title} · 报告会保留评估版本、证据引用和历史版本。</p>
          </div>
          <span className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: ready ? 'rgba(45,122,74,.3)' : 'rgba(168,50,40,.3)', color: ready ? 'var(--lu)' : 'var(--ji)' }}>
            {ready ? `评估 V${evaluation.evaluation?.version} 可生成` : evaluation.evaluation ? '证据已变化' : '尚未评估'}
          </span>
        </div>

        <button type="button" className="min-h-11 text-sm underline" onClick={() => setRetry(value => value + 1)}>刷新报告列表</button>
      {error && <div role="alert" className="mt-5 rounded-lg border px-4 py-3 text-sm" style={{ borderColor: 'rgba(168,50,40,.35)', color: 'var(--ji)' }}>{error}</div>}

        <section className="mt-7 grid gap-4 md:grid-cols-[1.6fr_1fr]">
          <article className="flex min-h-72 flex-col rounded-xl border p-6" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}>
            <FileText size={28} style={{ color: 'var(--ac)' }} />
            <h2 className="mt-4 text-lg font-semibold">出生时辰校时结论报告</h2>
            <p className="mt-3 flex-1 text-sm leading-7" style={{ color: 'var(--tx-2)' }}>
              汇总规则排序、人工选定、主要区分证据、冲突证据、稳定性检验与后续核实建议。AI 只组织解释，不得改动程序得出的排名、指数或置信度。
            </p>
            {report?.activeVersion && <p className="mb-3 text-xs" style={{ color: 'var(--tx-3)' }}>当前 v{report.activeVersion.version} · 共 {report.versionCount} 个版本 · 绑定评估 V{evaluation.evaluation?.version ?? '-'}</p>}
            <button type="button" className={report?.activeVersion ? 'btn-ghost' : 'btn-accent'} disabled={generating || (!ready && !report?.activeVersion)} onClick={() => report?.activeVersion ? router.push(`/rectification/${sessionId}/reports/${report.id}`) : void generate()}>
              {generating ? '正在生成…' : report?.activeVersion ? '打开已保存报告' : '生成结论报告'}
            </button>
          </article>
          <div className="space-y-4">
            <Info icon={<Scales size={20} />} title="确定性评估优先" text="候选分数、排序和稳定性由规则引擎完成，报告生成模型没有改写这些字段的权限。" />
            <Info icon={<ShieldCheck size={20} />} title="完整审计链" text="每个报告版本固定绑定当时的评估与人工选定记录；证据变化后必须先重新评估。" />
          </div>
        </section>
      </div>
    </main>
  );
}

function Info({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <article className="rounded-xl border p-5" style={{ borderColor: 'var(--bdr)', background: 'var(--bg-card)' }}><div style={{ color: 'var(--ac)' }}>{icon}</div><h3 className="mt-3 text-sm font-semibold">{title}</h3><p className="mt-2 text-xs leading-6" style={{ color: 'var(--tx-3)' }}>{text}</p></article>;
}
function State({ text, error = false }: { text: string; error?: boolean }) {
  return <main className="min-h-[100dvh] px-4 py-24 text-center text-sm" style={{ background: 'var(--bg-0)', color: error ? 'var(--ji)' : 'var(--tx-3)' }}>{text}</main>;
}
