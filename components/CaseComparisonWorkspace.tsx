'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type {
  CaseComparison,
  CaseComparisonCategory,
  CaseComparisonDimension,
  CaseComparisonDimensionStatus,
} from '@/lib/cases/types';

const CATEGORY_LABELS: Record<CaseComparisonCategory, string> = {
  core: '基础坐标', ming_structure: '命宫与星曜', sihua: '四化结构',
  pattern: '格局规则', event: '匿名事件', daxian: '大限阶段',
};
const CATEGORY_ORDER: CaseComparisonCategory[] = ['core', 'daxian', 'ming_structure', 'sihua', 'pattern', 'event'];

export default function CaseComparisonWorkspace({ comparisonId }: { comparisonId: string }) {
  const [comparison, setComparison] = useState<CaseComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/case-comparisons/${comparisonId}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { comparison?: CaseComparison; error?: string };
        if (!response.ok || !data.comparison) throw new Error(data.error || '对比记录加载失败');
        setComparison(data.comparison);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '对比记录加载失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [comparisonId]);

  const groups = useMemo(() => {
    if (!comparison) return [];
    return CATEGORY_ORDER.map(category => ({
      category,
      dimensions: comparison.result.dimensions.filter(item => item.category === category),
    })).filter(group => group.dimensions.length);
  }, [comparison]);

  async function archive() {
    if (!comparison) return;
    const response = await fetch(`/api/case-comparisons/${comparison.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: comparison.status === 'active' ? 'archived' : 'active' }),
    });
    const data = await response.json() as { comparison?: CaseComparison; error?: string };
    if (!response.ok || !data.comparison) {
      setError(data.error || '对比记录状态更新失败');
      return;
    }
    setComparison(data.comparison);
  }

  if (loading) return <PageState text="正在读取确定性对比结果…" />;
  if (!comparison) return <PageState text={error || '对比记录不可用'} error />;
  const { result } = comparison;

  return (
    <main className="mx-auto min-h-screen max-w-[1180px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/cases/compare" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回案例对比台</Link>
          <div className="mt-5 font-mono text-[10px] tracking-[.2em]" style={{ color: 'var(--t-gold)' }}>{comparison.comparisonCode} · {comparison.mode === 'chart_to_chart' ? 'CHART COMPARISON' : 'DAXIAN COMPARISON'}</div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>{comparison.title}</h1>
          <p className="mt-3 text-[10px]" style={{ color: 'var(--t-faint)' }}>规则引擎 {comparison.engineVersion} · 保存于本地数据库 · 来源变更时自动刷新</p>
        </div>
        <button type="button" onClick={archive} className="rounded-lg px-4 py-2.5 text-xs" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>{comparison.status === 'active' ? '归档此对比' : '恢复此对比'}</button>
      </header>

      {error && <div className="mb-5 rounded-lg p-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.3)' }}>{error}</div>}

      <section className="grid gap-4 lg:grid-cols-[1fr_260px_1fr]">
        <SideCard side={result.left} label="左侧" />
        <div className="grid grid-cols-3 gap-2 rounded-2xl card-glass p-4 lg:self-stretch">
          <SummaryMetric label="共同" value={result.counts.common} color="#22c55e" />
          <SummaryMetric label="差异" value={result.counts.different} color="#f59e0b" />
          <SummaryMetric label="不足" value={result.counts.unavailable} color="var(--t-faint)" />
        </div>
        <SideCard side={result.right} label="右侧" />
      </section>

      <section className="mt-7 space-y-5">
        {groups.map(group => <article key={group.category} className="rounded-2xl card-glass p-5 sm:p-6"><div className="mb-4 flex items-end justify-between"><div><div className="text-[9px] tracking-[.18em]" style={{ color: 'var(--t-gold)' }}>COMPARISON DIMENSIONS</div><h2 className="mt-1 text-base font-semibold" style={{ color: 'var(--t-text)' }}>{CATEGORY_LABELS[group.category]}</h2></div><span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{group.dimensions.length} 个维度</span></div><div className="space-y-3">{group.dimensions.map(dimension => <DimensionCard key={dimension.id} dimension={dimension} />)}</div></article>)}
      </section>

      <section className="mt-6 rounded-2xl p-5" style={{ border: '1px solid rgba(245,158,11,.3)', background: 'rgba(245,158,11,.06)' }}>
        <h2 className="text-xs font-semibold text-amber-500">对比边界</h2>
        <p className="mt-2 text-[10px] leading-6" style={{ color: 'var(--t-text2)' }}>{result.boundaryNotice}</p>
      </section>
    </main>
  );
}

function SideCard({ side, label }: { side: CaseComparison['result']['left']; label: string }) { return <div className="rounded-2xl p-5" style={{ border: '1px solid var(--t-border-acc)', background: 'linear-gradient(145deg,var(--ac-bg),var(--t-card))' }}><div className="flex items-center justify-between"><span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}</span><span className="font-mono text-[9px]" style={{ color: 'var(--t-gold)' }}>{side.caseCode}</span></div><h2 className="mt-3 text-base font-semibold" style={{ color: 'var(--t-text)' }}>{side.title}</h2>{side.stageLabel && <p className="mt-2 text-[10px]" style={{ color: 'var(--t-gold)' }}>{side.stageLabel}</p>}<Link href={`/cases/${side.caseId}/study`} className="mt-4 inline-block text-[9px]" style={{ color: 'var(--t-faint)' }}>打开教学详情 →</Link></div>; }
function SummaryMetric({ label, value, color }: { label: string; value: number; color: string }) { return <div className="flex flex-col items-center justify-center rounded-xl px-2 py-5 text-center" style={{ background: 'var(--ac-bg)' }}><span className="text-xl font-semibold" style={{ color }}>{value}</span><span className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}</span></div>; }
function DimensionCard({ dimension }: { dimension: CaseComparisonDimension }) { return <details className="group rounded-xl p-4" style={{ border: '1px solid var(--t-border)' }}><summary className="cursor-pointer list-none"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-xs font-medium" style={{ color: 'var(--t-text)' }}>{dimension.title}</h3><StatusBadge status={dimension.status} /></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><ValueBox label="左侧" value={dimension.leftValue} /><ValueBox label="右侧" value={dimension.rightValue} /></div><p className="mt-3 text-[10px] leading-5" style={{ color: 'var(--t-text2)' }}>{dimension.summary}</p><div className="mt-2 text-right text-[9px]" style={{ color: 'var(--t-gold)' }}>展开证据路径</div></summary><div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-2" style={{ borderColor: 'var(--t-border)' }}>{dimension.evidence.map(item => <div key={`${item.side}-${item.path}`} className="rounded-lg p-3" style={{ background: 'var(--ac-bg)' }}><div className="flex justify-between gap-2 text-[8px]" style={{ color: 'var(--t-faint)' }}><span>{item.side === 'left' ? '左侧' : '右侧'} · {sourceLabel(item.source)}</span><span className="font-mono">{item.caseCode}</span></div><div className="mt-2 break-all font-mono text-[8px]" style={{ color: 'var(--t-gold)' }}>{item.path}</div><p className="mt-2 text-[9px] leading-5" style={{ color: 'var(--t-text2)' }}>{item.value || '缺失'}</p></div>)}</div></details>; }
function ValueBox({ label, value }: { label: string; value: string }) { return <div className="rounded-lg p-3" style={{ background: 'var(--ac-bg)' }}><span className="text-[8px]" style={{ color: 'var(--t-faint)' }}>{label}</span><p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-text2)' }}>{value}</p></div>; }
function StatusBadge({ status }: { status: CaseComparisonDimensionStatus }) { const config = status === 'common' ? { label: '共同', color: '#22c55e' } : status === 'different' ? { label: '差异', color: '#f59e0b' } : { label: '资料不足', color: 'var(--t-faint)' }; return <span className="rounded-full px-2.5 py-1 text-[9px]" style={{ color: config.color, border: `1px solid ${config.color}` }}>{config.label}</span>; }
function sourceLabel(source: string) { const labels: Record<string, string> = { anonymous_chart: '匿名命盘', pattern_engine: '格局引擎', confirmed_events: '匿名事件', daxian_snapshot: '大限快照' }; return labels[source] ?? source; }
function PageState({ text, error = false }: { text: string; error?: boolean }) { return <main className="mx-auto min-h-screen max-w-[900px] px-5 py-20"><div className="rounded-xl card-glass px-5 py-20 text-center text-sm" style={{ color: error ? '#ef4444' : 'var(--t-faint)' }}>{text}</div><div className="mt-5 text-center"><Link href="/cases/compare" className="text-xs" style={{ color: 'var(--t-gold)' }}>返回案例对比台</Link></div></main>; }
