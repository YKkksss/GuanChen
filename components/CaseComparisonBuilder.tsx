'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type {
  CaseComparison,
  CaseComparisonListItem,
  CaseComparisonMode,
  CaseSearchItem,
  CaseSearchResponse,
  CaseTeachingDetail,
} from '@/lib/cases/types';

export default function CaseComparisonBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<CaseComparisonMode>('chart_to_chart');
  const [cases, setCases] = useState<CaseSearchItem[]>([]);
  const [history, setHistory] = useState<CaseComparisonListItem[]>([]);
  const [leftCaseId, setLeftCaseId] = useState(searchParams.get('left') ?? '');
  const [rightCaseId, setRightCaseId] = useState('');
  const [teaching, setTeaching] = useState<CaseTeachingDetail | null>(null);
  const [leftStageKey, setLeftStageKey] = useState('');
  const [rightStageKey, setRightStageKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/cases/search?limit=100', { cache: 'no-store' }).then(response => response.json()) as Promise<CaseSearchResponse>,
      fetch('/api/case-comparisons?limit=50', { cache: 'no-store' }).then(response => response.json()) as Promise<{ comparisons?: CaseComparisonListItem[] }>,
    ]).then(([caseResult, historyResult]) => {
      setCases(caseResult.cases ?? []);
      setHistory(historyResult.comparisons ?? []);
    }).catch(loadError => setError(loadError instanceof Error ? loadError.message : '对比资料加载失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (mode !== 'daxian_to_daxian' || !leftCaseId) {
      setTeaching(null);
      return;
    }
    const controller = new AbortController();
    fetch(`/api/cases/${leftCaseId}/teaching`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { teaching?: CaseTeachingDetail; error?: string };
        if (!response.ok || !data.teaching) throw new Error(data.error || '大限资料加载失败');
        setTeaching(data.teaching);
        setLeftStageKey(current => current || 'daxian:0');
        setRightStageKey(current => current || 'daxian:1');
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '大限资料加载失败');
      });
    return () => controller.abort();
  }, [leftCaseId, mode]);

  const selectedLeft = useMemo(() => cases.find(item => item.id === leftCaseId), [cases, leftCaseId]);
  const selectedRight = useMemo(() => cases.find(item => item.id === rightCaseId), [cases, rightCaseId]);
  const canSubmit = mode === 'chart_to_chart'
    ? Boolean(leftCaseId && rightCaseId && leftCaseId !== rightCaseId)
    : Boolean(leftCaseId && leftStageKey && rightStageKey && leftStageKey !== rightStageKey);

  async function createComparison() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/case-comparisons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          leftCaseId,
          rightCaseId: mode === 'chart_to_chart' ? rightCaseId : leftCaseId,
          leftStageKey: mode === 'daxian_to_daxian' ? leftStageKey : null,
          rightStageKey: mode === 'daxian_to_daxian' ? rightStageKey : null,
        }),
      });
      const data = await response.json() as { comparison?: CaseComparison; error?: string };
      if (!response.ok || !data.comparison) throw new Error(data.error || '案例对比创建失败');
      router.push(`/cases/compare/${data.comparison.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '案例对比创建失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="case-form mx-auto min-h-screen max-w-[1180px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7">
        <Link href="/cases" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回匿名案例库</Link>
        <div className="mt-5 text-[10px] font-medium tracking-[.28em]" style={{ color: 'var(--t-gold)' }}>DETERMINISTIC COMPARISON</div>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>匿名案例对比台</h1>
        <p className="mt-3 max-w-3xl text-xs leading-7" style={{ color: 'var(--t-text2)' }}>选择两个匿名教学案例，或选择同一案例的两个大限。系统按固定规则列出共同点、差异和资料不足，不生成吉凶结论。</p>
      </header>

      <section className="rounded-2xl card-glass p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <ModeButton active={mode === 'chart_to_chart'} title="两个命盘对比" subtitle="比较命宫、星曜、四化、格局与匿名事件" onClick={() => setMode('chart_to_chart')} />
          <ModeButton active={mode === 'daxian_to_daxian'} title="同案例不同大限" subtitle="比较两个十年阶段的宫位、四化与现实事件" onClick={() => setMode('daxian_to_daxian')} />
        </div>

        {loading ? <div className="py-16 text-center text-xs" style={{ color: 'var(--t-faint)' }}>正在读取可教学案例…</div> : cases.length < 1 ? <EmptyCases /> : (
          <div className="mt-6">
            {mode === 'chart_to_chart' ? (
              <div className="grid gap-4 md:grid-cols-2">
                <CaseSelect label="左侧匿名案例" value={leftCaseId} cases={cases} onChange={setLeftCaseId} />
                <CaseSelect label="右侧匿名案例" value={rightCaseId} cases={cases} onChange={setRightCaseId} />
              </div>
            ) : (
              <div className="space-y-4">
                <CaseSelect label="匿名教学案例" value={leftCaseId} cases={cases} onChange={value => { setLeftCaseId(value); setLeftStageKey(''); setRightStageKey(''); }} />
                <div className="grid gap-4 md:grid-cols-2">
                  <StageSelect label="左侧大限" value={leftStageKey} detail={teaching} onChange={setLeftStageKey} />
                  <StageSelect label="右侧大限" value={rightStageKey} detail={teaching} onChange={setRightStageKey} />
                </div>
              </div>
            )}
            {mode === 'chart_to_chart' && leftCaseId && leftCaseId === rightCaseId && <p className="mt-3 text-[10px] text-amber-500">请选择两个不同案例；同一案例的阶段变化请切换到“大限对比”。</p>}
            {mode === 'daxian_to_daxian' && leftStageKey && leftStageKey === rightStageKey && <p className="mt-3 text-[10px] text-amber-500">左右两侧需要选择不同的大限阶段。</p>}
            {error && <p className="mt-4 rounded-lg p-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.3)' }}>{error}</p>}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px]" style={{ color: 'var(--t-faint)' }}>{mode === 'chart_to_chart' ? `${selectedLeft?.caseCode ?? '左侧未选'} ↔ ${selectedRight?.caseCode ?? '右侧未选'}` : `${selectedLeft?.caseCode ?? '案例未选'} · 两个十年阶段`}</p>
              <button type="button" disabled={!canSubmit || submitting} onClick={createComparison} className="rounded-lg px-5 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-40" style={{ color: '#fff8e8', background: '#9a6210' }}>{submitting ? '正在生成确定性对比…' : '生成并保存对比'}</button>
            </div>
          </div>
        )}
      </section>

      <section className="mt-7">
        <div className="mb-4 flex items-end justify-between"><div><h2 className="text-lg font-semibold" style={{ color: 'var(--t-text)' }}>最近对比</h2><p className="mt-1 text-[10px]" style={{ color: 'var(--t-faint)' }}>仅显示来源案例仍具备教学授权的记录</p></div><span className="text-[10px]" style={{ color: 'var(--t-gold)' }}>{history.length} 条</span></div>
        {!history.length ? <div className="rounded-xl card-glass px-5 py-14 text-center text-xs" style={{ color: 'var(--t-faint)' }}>还没有保存过案例对比。</div> : <div className="grid gap-3 md:grid-cols-2">{history.map(item => <Link key={item.id} href={`/cases/compare/${item.id}`} className="rounded-xl card-glass p-4 transition hover:-translate-y-0.5"><div className="flex items-center justify-between"><span className="font-mono text-[9px]" style={{ color: 'var(--t-gold)' }}>{item.comparisonCode}</span><span className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{item.mode === 'chart_to_chart' ? '命盘对比' : '大限对比'}</span></div><h3 className="mt-3 text-sm font-medium" style={{ color: 'var(--t-text)' }}>{item.title}</h3><p className="mt-2 text-[9px] leading-5" style={{ color: 'var(--t-text2)' }}>{item.leftLabel}<br />{item.rightLabel}</p><div className="mt-3 flex gap-2 text-[9px]"><Count text={`共同 ${item.counts.common}`} color="#22c55e" /><Count text={`差异 ${item.counts.different}`} color="#f59e0b" /><Count text={`不足 ${item.counts.unavailable}`} color="var(--t-faint)" /></div></Link>)}</div>}
      </section>
    </main>
  );
}

function ModeButton({ active, title, subtitle, onClick }: { active: boolean; title: string; subtitle: string; onClick: () => void }) { return <button type="button" onClick={onClick} className="rounded-xl p-4 text-left transition" style={active ? { border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' } : { border: '1px solid var(--t-border)' }}><span className="block text-sm font-medium" style={{ color: active ? 'var(--t-gold)' : 'var(--t-text)' }}>{title}</span><span className="mt-1.5 block text-[9px] leading-5" style={{ color: 'var(--t-faint)' }}>{subtitle}</span></button>; }
function CaseSelect({ label, value, cases, onChange }: { label: string; value: string; cases: CaseSearchItem[]; onChange: (value: string) => void }) { return <label className="text-[10px]" style={{ color: 'var(--t-faint)' }}>{label}<select value={value} onChange={event => onChange(event.target.value)} className="mt-2 w-full rounded-lg px-3 py-3 text-xs outline-none" style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }}><option value="">请选择</option>{cases.map(item => <option key={item.id} value={item.id}>{item.caseCode} · {item.title}</option>)}</select></label>; }
function StageSelect({ label, value, detail, onChange }: { label: string; value: string; detail: CaseTeachingDetail | null; onChange: (value: string) => void }) { return <label className="text-[10px]" style={{ color: 'var(--t-faint)' }}>{label}<select value={value} disabled={!detail} onChange={event => onChange(event.target.value)} className="mt-2 w-full rounded-lg px-3 py-3 text-xs outline-none disabled:opacity-40" style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }}><option value="">请选择</option>{detail?.chartSnapshot.daXians.map((stage, index) => <option key={index} value={`daxian:${index}`}>{stage.startAge}-{stage.endAge}岁 · {stage.palaceName}</option>)}</select></label>; }
function Count({ text, color }: { text: string; color: string }) { return <span className="rounded-full px-2 py-1" style={{ color, border: `1px solid ${color}` }}>{text}</span>; }
function EmptyCases() { return <div className="py-16 text-center"><p className="text-sm" style={{ color: 'var(--t-text)' }}>还没有可用于对比的教学案例</p><Link href="/cases" className="mt-4 inline-block text-xs" style={{ color: 'var(--t-gold)' }}>去完成案例复核与授权 →</Link></div>; }
