'use client';

import { describeReportEvidence, evidenceSourceLabel, reportScopeLines } from '@/lib/reports/evidence-presentation';
import RequestFeedback from './RequestFeedback';
import { useReportResource } from '@/lib/ui/use-report-resource';
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { REPORT_GENERATION_REASON_LABELS, type ReportDetail, type ReportEvidence } from '@/lib/reports/types';
import ReportPdfExportButton from '@/components/ReportPdfExportButton';
import ReportVersionComparePanel from '@/components/ReportVersionComparePanel';
import ReportReviewPanel from '@/components/ReportReviewPanel';
import type { ReportUserRevision } from '@/lib/report-revisions/types';

export default function ReportDetailWorkspace({
  conversationId,
  reportId,
  conversationType = 'chart',
}: {
  conversationId: string;
  reportId: string;
  conversationType?: 'chart' | 'heming';
}) {
  const router = useRouter();
  const { detail, loading, error, regenerating, processing, stalled, load, retry, regenerate } = useReportResource<ReportDetail>(`/api/reports/${reportId}`);
  const [userRevision, setUserRevision] = useState<ReportUserRevision | null>(null);
  const handleRevisionChange = useCallback((revision: ReportUserRevision | null) => setUserRevision(revision), []);

  const evidenceBySection = useMemo(() => {
    const map = new Map<string, ReportEvidence[]>();
    for (const evidence of detail?.evidence ?? []) {
      const current = map.get(evidence.sectionKey) ?? [];
      current.push(evidence);
      map.set(evidence.sectionKey, current);
    }
    return map;
  }, [detail?.evidence]);

  if (loading && !detail) {
    return <main className="mx-auto max-w-[1000px] px-4 py-24 text-center text-sm" style={{ color: 'var(--t-faint)' }}><RequestFeedback loading="正在加载报告…" /></main>;
  }
  if (!detail) {
    return <main className="mx-auto max-w-[1000px] px-4 py-24 text-center text-sm text-red-500"><RequestFeedback error={error || '报告不存在'} onRetry={retry} /></main>;
  }

  const originalContent = detail.version?.content;
  const content = userRevision && userRevision.sourceVersionId === detail.version?.id
    && userRevision.editedContent?.format === 'structured'
    ? userRevision.editedContent.content
    : originalContent;
  return (
    <main className="report-print-area mx-auto max-w-[1000px] px-4 py-6 sm:px-6">
      <div className="report-controls mb-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push(conversationType === 'heming'
            ? `/heming/${conversationId}/reports`
            : `/chart/${conversationId}/reports`)}
          className="text-xs"
          style={{ color: 'var(--t-faint)' }}
        >
          ← 返回{conversationType === 'heming' ? '合盘' : '专题'}报告中心
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="报告版本"
            disabled={regenerating}
            value={detail.version?.version ?? ''}
            onChange={event => void load(Number(event.target.value))}
            className="rounded-lg px-3 py-2 text-xs"
            style={{ color: 'var(--t-text)', background: 'var(--t-bg2)', border: '1px solid var(--t-border)' }}
          >
            {detail.versions.map(version => (
              <option key={version.id} value={version.version}>
                v{version.version} · {version.status === 'completed' ? '已完成' : version.status === 'failed' ? '生成失败' : '生成中'}
              </option>
            ))}
          </select>
          {detail.version?.status === 'completed' && content && (
            <ReportPdfExportButton
              sourceKind={conversationType === 'heming' ? 'heming' : 'topic'}
              reportId={reportId}
              version={detail.version.version}
            />
          )}
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!content}
            className="rounded-lg px-3 py-2 text-xs disabled:opacity-40"
            style={{ color: 'var(--t-text)', border: '1px solid var(--t-border)' }}
          >
            打印 / 另存为 PDF
          </button>
          <button
            type="button"
            onClick={regenerate}
            disabled={regenerating}
            className="rounded-lg px-3 py-2 text-xs disabled:opacity-40"
            style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.28)', background: 'rgba(212,168,67,.05)' }}
          >
            {regenerating ? '正在生成新版本…' : '重新生成'}
          </button>
        </div>
      </div>

      <RequestFeedback loading={loading ? '正在更新报告…' : undefined} />
      {(regenerating || processing) && <p role="status" className="my-3 text-sm">{stalled ? '本次生成等待较久，可能已中断。可重新生成，旧版本会保留。' : '报告正在生成，页面会自动更新。刷新后可从报告中心继续查看。'}</p>}
      <button type="button" className="min-h-11 text-sm underline" disabled={loading} onClick={retry}>刷新报告状态</button>
      <ReportVersionComparePanel
        sourceKind={conversationType === 'heming' ? 'heming' : 'topic'}
        reportId={reportId}
        versions={detail.versions}
        currentVersion={detail.version?.version}
      />

      {detail.version?.status === 'completed' && originalContent && (
        <ReportReviewPanel
          sourceKind={conversationType === 'heming' ? 'heming' : 'topic'}
          reportId={reportId}
          version={detail.version.version}
          originalContent={{ format: 'structured', content: originalContent }}
          onRevisionChange={handleRevisionChange}
        />
      )}

      {error && (
        <div className="report-controls mb-4 rounded-lg px-4 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>
          {error}。旧版本仍然保留，可从版本列表继续查看。
        </div>
      )}

      <article className="overflow-hidden rounded-xl card-glass">
        <header className="px-6 py-8 text-center sm:px-10" style={{ borderBottom: '1px solid var(--t-border)' }}>
          <div className="text-[10px] tracking-[.28em]" style={{ color: 'var(--t-gold)' }}>观辰 · {conversationType === 'heming' ? '合盘关系报告' : '专题报告'}</div>
          <h1 className="mt-4 text-2xl font-semibold" style={{ color: 'var(--t-text)' }}>{detail.report.title}</h1>
          <div className="mt-3 text-[10px]" style={{ color: 'var(--t-faint)' }}>
            版本 v{detail.version?.version ?? '-'} · {detail.version?.completedAt
              ? new Date(detail.version.completedAt).toLocaleString('zh-CN', { hour12: false })
              : '尚未完成'} · 引擎 {detail.version?.engineVersion ?? '-'}
          </div>
          {detail.version && (
            <div className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>
              {REPORT_GENERATION_REASON_LABELS[detail.version.generationReason]} · 模板 {detail.version.promptVersion} · {detail.version.provider}/{detail.version.model}
            </div>
          )}
        </header>

        {!content && (
          <div className="px-6 py-20 text-center text-sm" style={{ color: detail.version?.status === 'failed' ? '#ef4444' : 'var(--t-faint)' }}>
            {detail.version?.status === 'failed' ? '这个版本生成失败，请切换旧版本或重新生成。' : '报告正在生成。'}
          </div>
        )}

        {content && (
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            {conversationType === 'chart' && (
              <section aria-label="本版分析范围" className="mb-6 rounded-lg border p-4 text-xs leading-6" style={{ borderColor: 'var(--t-border)', color: 'var(--t-text2)' }}>
                <h2 className="mb-2 text-sm font-semibold" style={{ color: 'var(--t-text)' }}>本版分析范围</h2>
                {reportScopeLines(detail.evidence).map((line, index) => <p key={index}>{line}</p>)}
              </section>
            )}
            {content !== originalContent && <p className="mb-3 text-xs leading-6" style={{ color: 'var(--t-text2)' }}>当前显示人工修订内容，引用依据仍来自原始报告版本，请重新核对修订后的判断是否与依据对应。</p>}
            <p className="mb-4 text-xs leading-6" style={{ color: 'var(--t-text2)' }}>引用依据是核对入口，不代表结论已经得到验证。请区分命盘事实、程序规则和用户确认记录；综合观察属于解释与推断。</p>
            <section className="rounded-xl px-5 py-5" style={{ background: 'rgba(212,168,67,.055)', border: '1px solid rgba(212,168,67,.15)' }}>
              <h2 className="text-xs font-semibold tracking-wider" style={{ color: 'var(--t-gold)' }}>核心结论摘要</h2>
              <p className="mt-3 whitespace-pre-wrap text-[12px] leading-7" style={{ color: 'var(--t-text2)' }}>{content.summary}</p>
            </section>

            <div className="mt-8 space-y-9">
              {content.sections.map(section => {
                const sectionEvidence = evidenceBySection.get(section.key) ?? [];
                return (
                  <section key={section.key}>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[15px] font-semibold" style={{ color: 'var(--t-text)' }}>【{section.title}】</h2>
                      <span className="rounded-full px-2 py-0.5 text-[9px]" style={{ color: section.basis === 'evidence' ? 'var(--t-gold)' : 'var(--t-faint)', background: 'rgba(212,168,67,.07)' }}>
                        {section.basis === 'evidence'
                          ? (sectionEvidence.length ? `${sectionEvidence.length} 条引用依据` : '引用明细缺失')
                          : '综合观察'}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-[12px] leading-8" style={{ color: 'var(--t-text2)' }}>{section.content}</p>
                    {section.basis === 'evidence' && sectionEvidence.length === 0 && (
                      <p className="mt-3 text-xs leading-6" style={{ color: 'var(--t-text2)' }}>此章节标记为有依据，但此版本未保存对应明细，暂时无法核对引用。</p>
                    )}
                    {sectionEvidence.length > 0 && (
                      <details className="report-evidence mt-4 rounded-lg px-4 py-3" style={{ border: '1px solid var(--t-border)' }}>
                        <summary className="cursor-pointer text-[10px]" style={{ color: 'var(--t-gold)' }}>查看本节引用依据</summary>
                        <div className="mt-3 space-y-3">
                          {sectionEvidence.map(evidence => (
                            <div key={evidence.id} className="text-xs leading-6" style={{ color: 'var(--t-text2)' }}>
                              <div style={{ color: 'var(--t-text)' }}>{evidenceSourceLabel(evidence.source)} · {evidence.label}</div>
                              <div className="mt-1 whitespace-pre-wrap break-words">{describeReportEvidence(evidence)}</div>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </section>
                );
              })}
            </div>

            {content.actionItems.length > 0 && (
              <section className="mt-10">
                <h2 className="text-[15px] font-semibold" style={{ color: 'var(--t-text)' }}>【行动建议】</h2>
                <ol className="mt-4 space-y-3">
                  {content.actionItems.map((item, index) => (
                    <li key={index} className="flex gap-3 text-[12px] leading-7" style={{ color: 'var(--t-text2)' }}>
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px]" style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.25)' }}>{index + 1}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {content.openQuestions.length > 0 && (
              <section className="mt-10">
                <h2 className="text-[15px] font-semibold" style={{ color: 'var(--t-text)' }}>【待观察事项】</h2>
                <ul className="mt-4 space-y-2 text-[12px] leading-7" style={{ color: 'var(--t-text2)' }}>
                  {content.openQuestions.map((item, index) => <li key={index}>· {item}</li>)}
                </ul>
              </section>
            )}

            <footer className="mt-10 rounded-lg px-4 py-3 text-[10px] leading-6" style={{ color: 'var(--t-faint)', background: 'rgba(212,168,67,.04)' }}>
              {content.disclaimer}
            </footer>
          </div>
        )}
      </article>

      <style jsx global>{`
        @media print {
          body { background: #fff !important; }
          body * { visibility: hidden; }
          .report-print-area, .report-print-area * { visibility: visible; }
          .report-print-area { position: absolute; inset: 0; max-width: none !important; padding: 0 !important; color: #111 !important; }
          .report-controls { display: none !important; }
          .report-print-area article { border: 0 !important; box-shadow: none !important; background: #fff !important; }
          .report-evidence { break-inside: avoid; }
        }
      `}</style>
    </main>
  );
}
