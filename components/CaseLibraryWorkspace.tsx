'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { CaseListItem, CaseSearchItem, CaseSearchOptions, CaseSearchResponse, CaseStatus } from '@/lib/cases/types';

type LibraryView = 'teaching' | 'manage';
const EMPTY_OPTIONS: CaseSearchOptions = { mingBranches: [], majorStars: [], sihua: [], patterns: [], wuxingJu: [], eventCategories: [] };
const STATUS_OPTIONS: Array<{ value: CaseStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部案例' }, { value: 'draft', label: '待复核' },
  { value: 'reviewed', label: '已复核' }, { value: 'archived', label: '已归档' },
];
interface SearchFilters { q: string; mingBranch: string; majorStar: string; sihua: string; pattern: string; wuxingJu: string; eventCategory: string }
const EMPTY_FILTERS: SearchFilters = { q: '', mingBranch: '', majorStar: '', sihua: '', pattern: '', wuxingJu: '', eventCategory: '' };

export default function CaseLibraryWorkspace() {
  const [view, setView] = useState<LibraryView>('teaching');
  const [status, setStatus] = useState<CaseStatus | 'all'>('all');
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS);
  const [searchResult, setSearchResult] = useState<CaseSearchResponse>({ cases: [], total: 0, options: EMPTY_OPTIONS, indexVersion: 1 });
  const [managedCases, setManagedCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeFilterCount = useMemo(() => Object.values(filters).filter(value => value.trim()).length, [filters]);

  useEffect(() => {
    if (view !== 'teaching') return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => { if (value.trim()) params.set(key, value.trim()); });
      fetch(`/api/cases/search?${params.toString()}`, { cache: 'no-store', signal: controller.signal })
        .then(async response => {
          const data = await response.json().catch(() => ({})) as CaseSearchResponse & { error?: string };
          if (!response.ok) throw new Error(data.error || '教学案例检索失败');
          setSearchResult(data);
        })
        .catch(loadError => {
          if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
          setError(loadError instanceof Error ? loadError.message : '教学案例检索失败');
        })
        .finally(() => setLoading(false));
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [filters, view]);

  useEffect(() => {
    if (view !== 'manage') return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const query = status === 'all' ? '' : `?status=${status}`;
    fetch(`/api/cases${query}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { cases?: CaseListItem[]; error?: string };
        if (!response.ok) throw new Error(data.error || '案例列表加载失败');
        setManagedCases(data.cases ?? []);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '案例列表加载失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [status, view]);

  const items = view === 'teaching' ? searchResult.cases : managedCases;
  return (
    <main className="case-form mx-auto min-h-screen max-w-[1220px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/learn" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回学习中心</Link>
          <div className="mt-5 text-[10px] font-medium tracking-[.28em]" style={{ color: 'var(--t-gold)' }}>ANONYMOUS CASE LIBRARY</div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>匿名案例库</h1>
          <p className="mt-3 max-w-3xl text-xs leading-7" style={{ color: 'var(--t-text2)' }}>用匿名命盘练习结构识别和证据回看。教学检索只展示已复核且仍有教学授权的案例；本地管理视图用于处理草稿、授权和归档。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/cases/compare" className="rounded-lg px-5 py-3 text-xs" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>命盘对比</Link>
          <Link href="/cases/new" className="rounded-lg px-5 py-3 text-xs" style={{ color: '#fffaf3', background: 'var(--ac)' }}>创建匿名案例</Link>
        </div>
      </header>

      <section className="mb-5 flex rounded-xl p-1" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
        <ViewButton active={view === 'teaching'} onClick={() => setView('teaching')} title="教学检索" subtitle="仅已复核且已授权" />
        <ViewButton active={view === 'manage'} onClick={() => setView('manage')} title="本地案例管理" subtitle="包含草稿与归档" />
      </section>

      {view === 'teaching' ? (
        <SearchPanel filters={filters} options={searchResult.options} activeCount={activeFilterCount} onChange={(key, value) => setFilters(current => ({ ...current, [key]: value }))} onReset={() => setFilters(EMPTY_FILTERS)} />
      ) : (
        <section className="mb-6 rounded-xl card-glass p-4"><div className="flex flex-wrap gap-2">{STATUS_OPTIONS.map(option => <button key={option.value} type="button" onClick={() => setStatus(option.value)} className="rounded-lg px-3.5 py-2 text-[11px] transition" style={status === option.value ? { color: '#fffaf3', background: 'var(--ac)' } : { color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>{option.label}</button>)}</div></section>
      )}

      {error && <PageState text={error} error />}
      {loading && !error && <PageState text={view === 'teaching' ? '正在检索匿名教学案例…' : '正在读取本地案例…'} />}
      {!loading && !error && !items.length && (
        <section className="rounded-2xl card-glass px-6 py-20 text-center">
          <div className="text-lg font-semibold" style={{ color: 'var(--t-text)' }}>{view === 'teaching' ? '没有匹配的教学案例' : '还没有符合条件的本地案例'}</div>
          <p className="mx-auto mt-3 max-w-xl text-xs leading-7" style={{ color: 'var(--t-faint)' }}>{view === 'teaching' ? '可以清空筛选条件，或先在本地案例管理中完成复核并启用教学授权。' : '从一份已保存的单人命盘开始，先查看字段脱敏预览，再明确选择用途并保存。'}</p>
          {view === 'teaching' && activeFilterCount > 0 ? <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="mt-6 rounded-lg px-5 py-3 text-xs" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>清空筛选</button> : <Link href="/cases/new" className="mt-6 inline-block rounded-lg px-5 py-3 text-xs" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>创建匿名案例</Link>}
        </section>
      )}

      {!loading && !error && items.length > 0 && (
        <><div className="mb-4 flex items-center justify-between text-[10px]" style={{ color: 'var(--t-faint)' }}><span>{view === 'teaching' ? `找到 ${searchResult.total} 个可教学案例` : `显示 ${managedCases.length} 个本地案例`}</span>{view === 'teaching' && <span>结构索引 v{searchResult.indexVersion}</span>}</div><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map(item => view === 'teaching' ? <TeachingCaseCard key={item.id} item={item as CaseSearchItem} /> : <ManagedCaseCard key={item.id} item={item} />)}</section></>
      )}
    </main>
  );
}

function SearchPanel({ filters, options, activeCount, onChange, onReset }: { filters: SearchFilters; options: CaseSearchOptions; activeCount: number; onChange: (key: keyof SearchFilters, value: string) => void; onReset: () => void }) {
  return <section className="mb-6 rounded-2xl card-glass p-4 sm:p-5"><div className="flex flex-col gap-3 sm:flex-row"><input value={filters.q} onChange={event => onChange('q', event.target.value)} placeholder="搜索案例编号、匿名标题、主星或格局" className="min-w-0 flex-1 rounded-lg px-3 py-3 text-xs outline-none" style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }} />{activeCount > 0 && <button type="button" onClick={onReset} className="rounded-lg px-4 py-3 text-[10px]" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>清空 {activeCount} 项筛选</button>}</div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"><FilterSelect label="命宫" value={filters.mingBranch} options={options.mingBranches} onChange={value => onChange('mingBranch', value)} /><FilterSelect label="命宫主星" value={filters.majorStar} options={options.majorStars} onChange={value => onChange('majorStar', value)} /><FilterSelect label="四化" value={filters.sihua} options={options.sihua} onChange={value => onChange('sihua', value)} /><FilterSelect label="格局" value={filters.pattern} options={options.patterns} onChange={value => onChange('pattern', value)} /><FilterSelect label="五行局" value={filters.wuxingJu} options={options.wuxingJu} onChange={value => onChange('wuxingJu', value)} /><FilterSelect label="事件类型" value={filters.eventCategory} options={options.eventCategories} onChange={value => onChange('eventCategory', value)} /></div></section>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: CaseSearchOptions['patterns']; onChange: (value: string) => void }) { return <label className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}<select value={value} onChange={event => onChange(event.target.value)} className="mt-1.5 w-full rounded-lg px-2.5 py-2.5 text-[10px] outline-none" style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }}><option value="">不限</option>{options.map(option => <option key={option.value} value={option.value}>{option.label}（{option.count}）</option>)}</select></label>; }
function TeachingCaseCard({ item }: { item: CaseSearchItem }) { return <Link href={`/cases/${item.id}/study`} className="group rounded-2xl p-5 transition hover:-translate-y-0.5" style={{ border: '1px solid var(--t-border-acc)', background: 'linear-gradient(145deg,var(--ac-bg),var(--t-card))' }}><div className="flex items-center justify-between gap-3"><span className="font-mono text-[10px] tracking-wider" style={{ color: 'var(--t-gold)' }}>{item.caseCode}</span><span className="rounded-full px-2.5 py-1 text-[9px] text-emerald-500" style={{ border: '1px solid rgba(34,197,94,.35)' }}>可教学</span></div><h2 className="mt-4 text-base font-semibold" style={{ color: 'var(--t-text)' }}>{item.title}</h2><div className="mt-4 flex flex-wrap gap-1.5">{item.mingMajorStars.map(star => <Tag key={star} text={star} accent />)}{item.patterns.slice(0, 3).map(pattern => <Tag key={pattern} text={pattern} />)}{!item.mingMajorStars.length && <Tag text="命宫空宫" />}</div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><Metric label="命宫" value={`${branchLabel(item.mingBranch)}宫`} /><Metric label="五行局" value={item.wuxingJuName} /><Metric label="匿名事件" value={`${item.eventCount} 条`} /></div>{item.matchReasons.length > 0 && <div className="mt-4 rounded-lg p-3 text-[9px] leading-5" style={{ color: 'var(--t-text2)', background: 'var(--t-card)' }}>匹配依据：{item.matchReasons.join('；')}</div>}<div className="mt-5 text-right text-[10px]" style={{ color: 'var(--t-gold)' }}>进入教学详情 →</div></Link>; }
function ManagedCaseCard({ item }: { item: CaseListItem }) { return <Link href={`/cases/${item.id}`} className="group rounded-2xl card-glass p-5 transition hover:-translate-y-0.5"><div className="flex items-center justify-between gap-3"><span className="font-mono text-[10px] tracking-wider" style={{ color: 'var(--t-gold)' }}>{item.caseCode}</span><StatusBadge status={item.status} /></div><h2 className="mt-4 text-base font-semibold" style={{ color: 'var(--t-text)' }}>{item.title}</h2><div className="mt-4 grid grid-cols-3 gap-2 text-center"><Metric label="五行局" value={item.wuxingJuName} /><Metric label="已确认事件" value={`${item.eventCount} 条`} /><Metric label="可信度" value={confidenceLabel(item.confidence)} /></div><div className="mt-4 flex flex-wrap gap-1.5">{item.activeScopes.map(scope => <ScopeBadge key={scope} scope={scope} />)}</div><div className="mt-5 text-right text-[10px]" style={{ color: 'var(--t-faint)' }}>查看案例与授权 →</div></Link>; }
function ViewButton({ active, onClick, title, subtitle }: { active: boolean; onClick: () => void; title: string; subtitle: string }) { return <button type="button" onClick={onClick} className="flex-1 rounded-lg px-4 py-3 text-left transition" style={active ? { color: '#fffaf3', background: 'var(--ac)' } : { color: 'var(--t-text2)' }}><span className="block text-xs font-medium">{title}</span><span className="mt-1 block text-[9px] opacity-70">{subtitle}</span></button>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-lg px-2 py-3" style={{ background: 'var(--ac-bg)' }}><div className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}</div><div className="mt-1 text-[11px]" style={{ color: 'var(--t-text2)' }}>{value}</div></div>; }
function Tag({ text, accent = false }: { text: string; accent?: boolean }) { return <span className="rounded-full px-2.5 py-1 text-[9px]" style={{ color: accent ? 'var(--t-gold)' : 'var(--t-text2)', border: `1px solid ${accent ? 'var(--t-border-acc)' : 'var(--t-border)'}` }}>{text}</span>; }
export function StatusBadge({ status }: { status: CaseStatus }) { const label = status === 'reviewed' ? '已复核' : status === 'archived' ? '已归档' : '待复核'; const color = status === 'reviewed' ? '#22c55e' : status === 'archived' ? 'var(--t-faint)' : '#f59e0b'; return <span className="rounded-full px-2.5 py-1 text-[9px]" style={{ color, border: `1px solid ${color}` }}>{label}</span>; }
export function ScopeBadge({ scope }: { scope: string }) { const labels: Record<string, string> = { local_only: '仅本地', teaching: '教学使用', anonymous_export: '可匿名导出', public_release: '可公开' }; return <span className="rounded-full px-2 py-1 text-[9px]" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>{labels[scope] ?? scope}</span>; }
function confidenceLabel(value: string) { return value === 'high' ? '较高' : value === 'low' ? '较低' : '中等'; }
function branchLabel(value: number) { return ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'][value] ?? '未知'; }
function PageState({ text, error = false }: { text: string; error?: boolean }) { return <div className="rounded-xl card-glass px-5 py-20 text-center text-sm" style={{ color: error ? '#ef4444' : 'var(--t-faint)' }}>{text}</div>; }
