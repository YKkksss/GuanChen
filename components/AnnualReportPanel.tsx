'use client';

import type { AnnualTransitReport } from '@/lib/transits/types';

interface AnnualReportPanelProps {
  year: number;
  report: AnnualTransitReport | null;
  loading: boolean;
  error: string;
  onRegenerate: () => void;
}

export default function AnnualReportPanel({
  year,
  report,
  loading,
  error,
  onRegenerate,
}: AnnualReportPanelProps) {
  const hasContent = Boolean(report?.content.trim());
  return (
    <section className="mt-4 overflow-hidden rounded-xl card-glass">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <div>
          <div className="text-[11px] font-medium tracking-wider" style={{ color: 'var(--t-gold)' }}>
            {year} 年度总结报告
          </div>
          <div className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>
            本命与当年运限的综合只读分析 · 自动保存
          </div>
        </div>
        <div className="flex items-center gap-2">
          {report?.completedAt && !loading && (
            <span className="hidden text-[9px] sm:inline" style={{ color: 'var(--t-faint)' }}>
              {new Date(report.completedAt).toLocaleString('zh-CN', { hour12: false })}
            </span>
          )}
          <button
            type="button"
            onClick={onRegenerate}
            disabled={loading}
            className="rounded-lg px-3 py-1.5 text-[10px] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.28)', background: 'rgba(212,168,67,.06)' }}
          >
            {loading && hasContent ? '正在重新生成…' : '重新生成'}
          </button>
        </div>
      </div>

      {loading && !hasContent && (
        <div className="px-5 py-12 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full" style={{ border: '2px solid var(--t-border)', borderTopColor: 'var(--t-gold)' }} />
          <div className="mt-4 text-xs" style={{ color: 'var(--t-text)' }}>正在生成 {year} 年度总结报告</div>
          <div className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>首次生成需要一点时间，完成后会保存到本地</div>
        </div>
      )}

      {error && (
        <div className="mx-4 mt-4 rounded-lg px-3 py-2 text-[10px] text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>
          {error}
        </div>
      )}

      {hasContent && report && (
        <article className="px-5 py-5 sm:px-6 sm:py-6">
          {loading && (
            <div className="mb-4 rounded-lg px-3 py-2 text-[9px]" style={{ color: 'var(--t-gold)', background: 'rgba(212,168,67,.06)' }}>
              正在生成新版本，完成前继续显示上一次保存的报告。
            </div>
          )}
          <ReportContent content={report.content} />
          <div className="mt-6 rounded-lg px-3 py-2 text-[9px] leading-relaxed" style={{ color: 'var(--t-faint)', background: 'rgba(212,168,67,.05)' }}>
            本报告属于传统文化研究与自我观察参考，不替代医疗、投资、法律、婚姻等专业意见。
          </div>
        </article>
      )}

      {!loading && !hasContent && !error && (
        <div className="px-5 py-10 text-center text-xs" style={{ color: 'var(--t-faint)' }}>
          暂无年度报告，系统将自动生成。
        </div>
      )}
    </section>
  );
}

function ReportContent({ content }: { content: string }) {
  return (
    <div className="space-y-2">
      {content.split('\n').map((line, index) => {
        const title = line.trim().match(/^\*\*【(.+?)】\*\*$/);
        if (title) {
          return (
            <h3 key={index} className="pb-1 pt-5 text-[13px] font-semibold first:pt-0" style={{ color: 'var(--t-gold)' }}>
              【{title[1]}】
            </h3>
          );
        }
        if (!line.trim()) return <div key={index} className="h-1" />;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <p key={index} className="text-[11px] leading-7" style={{ color: 'var(--t-text2)' }}>
            {parts.map((part, partIndex) => partIndex % 2
              ? <strong key={partIndex} style={{ color: 'var(--t-text)' }}>{part}</strong>
              : part)}
          </p>
        );
      })}
    </div>
  );
}
