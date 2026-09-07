'use client';

import { ArrowsLeftRight, SpinnerGap, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReportVersionComparison } from '@/lib/report-comparisons/types';
import type { ReportExportKind } from '@/lib/report-exports/types';
import { REPORT_GENERATION_REASON_LABELS } from '@/lib/reports/types';

interface ComparableVersionOption {
  version: number;
  status: 'generating' | 'completed' | 'failed';
}

export default function ReportVersionComparePanel({
  sourceKind,
  reportId,
  versions,
  currentVersion,
}: {
  sourceKind: ReportExportKind;
  reportId: string;
  versions: ComparableVersionOption[];
  currentVersion?: number | null;
}) {
  const completedVersions = useMemo(
    () => versions
      .filter(item => item.status === 'completed')
      .map(item => item.version)
      .sort((left, right) => left - right),
    [versions],
  );
  const [open, setOpen] = useState(false);
  const [baseVersion, setBaseVersion] = useState(0);
  const [targetVersion, setTargetVersion] = useState(0);
  const [comparison, setComparison] = useState<ReportVersionComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    if (completedVersions.length < 2) return;
    const preferredTarget = currentVersion && completedVersions.includes(currentVersion)
      ? currentVersion
      : completedVersions.at(-1)!;
    const targetIndex = completedVersions.indexOf(preferredTarget);
    const preferredBase = completedVersions[targetIndex - 1]
      ?? completedVersions.find(item => item !== preferredTarget)
      ?? completedVersions[0];
    setBaseVersion(preferredBase);
    setTargetVersion(preferredTarget);
  }, [completedVersions, currentVersion]);

  const loadComparison = useCallback(async () => {
    pending.current?.abort();
    if (!baseVersion || !targetVersion || baseVersion === targetVersion) { setComparison(null); setLoading(false); return; }
    const controller = new AbortController(); pending.current = controller;
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        sourceKind,
        reportId,
        baseVersion: String(baseVersion),
        targetVersion: String(targetVersion),
      });
      const response = await fetch(`/api/report-comparisons?${query}`, { cache: 'no-store', signal: controller.signal });
      const data = await response.json().catch(() => ({})) as ReportVersionComparison & { error?: string };
      if (!response.ok || !data.summary) throw new Error(data.error || '报告版本对比失败');
      if (!controller.signal.aborted) setComparison(data);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setComparison(null);
      setError(loadError instanceof Error ? loadError.message : '报告版本对比失败');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [baseVersion, reportId, sourceKind, targetVersion]);

  useEffect(() => {
    if (open) void loadComparison();
    return () => pending.current?.abort();
  }, [loadComparison, open]);

  if (completedVersions.length < 2) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        className="report-controls inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs"
        style={{ color: 'var(--t-text, var(--tx-2))', border: '1px solid var(--t-border, var(--bdr))' }}
      >
        <ArrowsLeftRight size={15} /> 版本对比
      </button>

      {open && (
        <section
          className="report-controls my-5 overflow-hidden rounded-xl border"
          style={{ borderColor: 'var(--t-border, var(--bdr))', background: 'var(--t-bg2, var(--bg-card))' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--t-border, var(--bdr))' }}>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text, var(--tx-1))' }}>报告版本差异</h2>
              <p className="mt-1 text-[10px]" style={{ color: 'var(--t-faint, var(--tx-3))' }}>左侧为基准版本，右侧为目标版本；事实依据与文字表达分开判断。</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <VersionSelect label="基准" value={baseVersion} versions={completedVersions} onChange={setBaseVersion} />
              <span className="text-xs" style={{ color: 'var(--t-faint, var(--tx-3))' }}>→</span>
              <VersionSelect label="目标" value={targetVersion} versions={completedVersions} onChange={setTargetVersion} />
              <button type="button" aria-label="关闭版本对比" onClick={() => setOpen(false)} className="rounded-lg p-2" style={{ color: 'var(--t-faint, var(--tx-3))' }}><X size={16} /></button>
            </div>
          </div>

          {baseVersion === targetVersion && <StateText text="请选择两个不同的已完成版本。" error />}
          {loading && <StateText text="正在计算结构化差异…" loading />}
          {!loading && error && <StateText text={error} error />}
          {!loading && !error && comparison && baseVersion !== targetVersion && <ComparisonBody comparison={comparison} />}
        </section>
      )}
    </>
  );
}

function VersionSelect({
  label,
  value,
  versions,
  onChange,
}: {
  label: string;
  value: number;
  versions: number[];
  onChange: (version: number) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--t-faint, var(--tx-3))' }}>
      {label}
      <select
        value={value}
        onChange={event => onChange(Number(event.target.value))}
        className="rounded-lg px-2 py-1.5 text-xs"
        style={{ color: 'var(--t-text, var(--tx-1))', background: 'var(--t-bg, var(--bg-1))', border: '1px solid var(--t-border, var(--bdr))' }}
      >
        {versions.map(version => <option key={version} value={version}>v{version}</option>)}
      </select>
    </label>
  );
}

function ComparisonBody({ comparison }: { comparison: ReportVersionComparison }) {
  const changedMetadata = comparison.metadata.filter(item => item.changed);
  const changedSections = comparison.sections.filter(item => item.kind !== 'unchanged');
  const changedEvidence = comparison.evidence.filter(item => item.kind !== 'unchanged');
  return (
    <div className="space-y-6 px-4 py-5 sm:px-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="总体判断" value={classificationLabel(comparison.summary.classification)} highlight />
        <Metric label="变化章节" value={`${comparison.summary.changedSections} 节`} />
        <Metric label="依据变化" value={`${comparison.summary.evidenceChangedSections} 节`} />
        <Metric label="元数据变化" value={`${comparison.summary.changedMetadata} 项`} />
      </div>

      <div className="rounded-lg px-4 py-3 text-[11px] leading-6" style={{ color: 'var(--t-text2, var(--tx-2))', background: 'rgba(212,168,67,.06)' }}>
        v{comparison.base.version}：{REPORT_GENERATION_REASON_LABELS[comparison.base.generationReason]}　→　
        v{comparison.target.version}：{REPORT_GENERATION_REASON_LABELS[comparison.target.generationReason]}
      </div>

      {changedMetadata.length > 0 && (
        <CompareSection title="生成元数据变化">
          <div className="grid gap-2 sm:grid-cols-2">
            {changedMetadata.map(item => (
              <div key={item.key} className="rounded-lg border px-3 py-2 text-[10px] leading-5" style={{ borderColor: 'var(--t-border, var(--bdr))' }}>
                <div style={{ color: 'var(--t-gold, var(--ac-dim))' }}>{item.label}</div>
                <div className="mt-1 break-all" style={{ color: 'var(--t-faint, var(--tx-3))' }}>{item.before} → {item.after}</div>
              </div>
            ))}
          </div>
        </CompareSection>
      )}

      {comparison.summaryText.changed && (
        <CompareSection title="核心摘要变化">
          <SideBySide before={comparison.summaryText.before} after={comparison.summaryText.after} />
        </CompareSection>
      )}

      <CompareSection title={`章节变化（${changedSections.length}）`}>
        {changedSections.length === 0
          ? <EmptyText text="章节文字与引用依据均无变化。" />
          : <div className="space-y-4">{changedSections.map(section => (
            <div key={section.key} className="rounded-lg border p-3" style={{ borderColor: 'var(--t-border, var(--bdr))' }}>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-semibold" style={{ color: 'var(--t-text, var(--tx-1))' }}>【{section.title}】</h4>
                <DifferenceBadge kind={section.kind} />
              </div>
              <div className="mt-3"><SideBySide before={section.before ?? '—'} after={section.after ?? '—'} /></div>
            </div>
          ))}</div>}
      </CompareSection>

      <CompareSection title={`结构化依据变化（${changedEvidence.length}）`}>
        {changedEvidence.length === 0
          ? <EmptyText text="两个版本引用的结构化事实一致；变化属于表达或生成配置。" />
          : <div className="space-y-2">{changedEvidence.map(item => (
            <details key={item.identity} className="rounded-lg border px-3 py-2" style={{ borderColor: 'var(--t-border, var(--bdr))' }}>
              <summary className="cursor-pointer text-[11px]" style={{ color: 'var(--t-text2, var(--tx-2))' }}>
                <span style={{ color: evidenceColor(item.kind) }}>[{evidenceKindLabel(item.kind)}]</span> {item.label}
              </summary>
              <div className="mt-3"><SideBySide before={factsPreview(item.beforeFacts)} after={factsPreview(item.afterFacts)} /></div>
            </details>
          ))}</div>}
      </CompareSection>

      <ListDifferences title="行动建议" differences={comparison.actionItems} />
      <ListDifferences title="待观察事项" differences={comparison.openQuestions} />
    </div>
  );
}

function CompareSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-3 text-xs font-semibold" style={{ color: 'var(--t-gold, var(--ac-dim))' }}>{title}</h3>{children}</section>;
}

function SideBySide({ before, after }: { before: string; after: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <VersionText label="基准版本" content={before} />
      <VersionText label="目标版本" content={after} />
    </div>
  );
}

function VersionText({ label, content }: { label: string; content: string }) {
  return <div className="rounded-lg px-3 py-3" style={{ background: 'var(--t-bg, var(--bg-1))' }}><div className="text-[9px]" style={{ color: 'var(--t-faint, var(--tx-3))' }}>{label}</div><p className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-6" style={{ color: 'var(--t-text2, var(--tx-2))' }}>{content}</p></div>;
}

function ListDifferences({ title, differences }: { title: string; differences: ReportVersionComparison['actionItems'] }) {
  if (!differences.added.length && !differences.removed.length) return null;
  return (
    <CompareSection title={`${title}变化`}>
      <div className="grid gap-3 md:grid-cols-2">
        <ChangeList label="移除" items={differences.removed} color="#ef4444" />
        <ChangeList label="新增" items={differences.added} color="#22c55e" />
      </div>
    </CompareSection>
  );
}

function ChangeList({ label, items, color }: { label: string; items: string[]; color: string }) {
  return <div className="rounded-lg px-3 py-3" style={{ background: 'var(--t-bg, var(--bg-1))' }}><div className="text-[9px]" style={{ color }}>{label}</div>{items.length ? <ul className="mt-2 space-y-1 text-[11px] leading-6" style={{ color: 'var(--t-text2, var(--tx-2))' }}>{items.map((item, index) => <li key={index}>· {item}</li>)}</ul> : <EmptyText text="无" />}</div>;
}

function Metric({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className="rounded-lg border px-3 py-3" style={{ borderColor: 'var(--t-border, var(--bdr))' }}><div className="text-[9px]" style={{ color: 'var(--t-faint, var(--tx-3))' }}>{label}</div><div className="mt-1 text-xs font-semibold" style={{ color: highlight ? 'var(--t-gold, var(--ac-dim))' : 'var(--t-text, var(--tx-1))' }}>{value}</div></div>;
}

function DifferenceBadge({ kind }: { kind: ReportVersionComparison['sections'][number]['kind'] }) {
  const label = kind === 'expression_changed' ? '仅表达变化'
    : kind === 'evidence_changed' ? '仅依据变化'
      : kind === 'evidence_and_expression_changed' ? '依据与表达均变化'
        : kind === 'added' ? '新增章节'
          : kind === 'removed' ? '移除章节'
            : '未变化';
  return <span className="rounded-full px-2 py-0.5 text-[9px]" style={{ color: kind.includes('evidence') ? '#f59e0b' : 'var(--t-faint, var(--tx-3))', background: 'rgba(212,168,67,.08)' }}>{label}</span>;
}

function StateText({ text, loading = false, error = false }: { text: string; loading?: boolean; error?: boolean }) {
  return <div className="flex items-center justify-center gap-2 px-4 py-12 text-xs" style={{ color: error ? '#ef4444' : 'var(--t-faint, var(--tx-3))' }}>{loading && <SpinnerGap className="animate-spin" size={16} />}{text}</div>;
}

function EmptyText({ text }: { text: string }) {
  return <p className="text-[10px] leading-6" style={{ color: 'var(--t-faint, var(--tx-3))' }}>{text}</p>;
}

function classificationLabel(value: ReportVersionComparison['summary']['classification']): string {
  if (value === 'evidence_changed') return '事实依据发生变化';
  if (value === 'expression_only') return '仅文字表达变化';
  if (value === 'generation_metadata_only') return '仅生成配置变化';
  return '内容与依据一致';
}

function evidenceKindLabel(kind: ReportVersionComparison['evidence'][number]['kind']): string {
  return kind === 'added' ? '新增' : kind === 'removed' ? '移除' : kind === 'changed' ? '事实变化' : '未变化';
}

function evidenceColor(kind: ReportVersionComparison['evidence'][number]['kind']): string {
  return kind === 'added' ? '#22c55e' : kind === 'removed' ? '#ef4444' : kind === 'changed' ? '#f59e0b' : 'var(--t-faint, var(--tx-3))';
}

function factsPreview(value: Record<string, unknown> | null): string {
  if (!value) return '—';
  const text = JSON.stringify(value, null, 2);
  return text.length > 1_500 ? `${text.slice(0, 1_500)}\n…已省略其余字段` : text;
}
