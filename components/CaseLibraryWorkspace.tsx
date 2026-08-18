'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CaseListItem, CaseStatus } from '@/lib/cases/types';

const STATUS_OPTIONS: Array<{ value: CaseStatus | 'all'; label: string }> = [
  { value: 'all', label: '全部案例' },
  { value: 'draft', label: '待复核' },
  { value: 'reviewed', label: '已复核' },
  { value: 'archived', label: '已归档' },
];

export default function CaseLibraryWorkspace() {
  const [status, setStatus] = useState<CaseStatus | 'all'>('all');
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const query = status === 'all' ? '' : `?status=${status}`;
    fetch(`/api/cases${query}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { cases?: CaseListItem[]; error?: string };
        if (!response.ok) throw new Error(data.error || '案例列表加载失败');
        setCases(data.cases ?? []);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '案例列表加载失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [status]);

  return (
    <main className="mx-auto min-h-screen max-w-[1180px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/learn" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回学习中心</Link>
          <div className="mt-5 text-[10px] font-medium tracking-[.28em]" style={{ color: 'var(--t-gold)' }}>ANONYMOUS CASE LIBRARY</div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>匿名案例库</h1>
          <p className="mt-3 max-w-2xl text-xs leading-7" style={{ color: 'var(--t-text2)' }}>
            将本地命盘整理为不含姓名、精确生日、地点和聊天正文的教学案例。每条案例都保留脱敏版本、授权范围与操作记录。
          </p>
        </div>
        <Link href="/cases/new" className="rounded-lg px-5 py-3 text-xs" style={{ color: '#fff8e8', background: 'linear-gradient(135deg,#9a6210,#c88020)' }}>
          创建匿名案例
        </Link>
      </header>

      <section className="mb-6 rounded-xl card-glass p-4">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setStatus(option.value)}
              className="rounded-lg px-3.5 py-2 text-[11px] transition"
              style={status === option.value
                ? { color: '#fff8e8', background: '#9a6210' }
                : { color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {loading && <PageState text="正在读取本地案例…" />}
      {error && <PageState text={error} error />}
      {!loading && !error && !cases.length && (
        <section className="rounded-2xl card-glass px-6 py-20 text-center">
          <div className="text-lg font-semibold" style={{ color: 'var(--t-text)' }}>还没有符合条件的案例</div>
          <p className="mx-auto mt-3 max-w-xl text-xs leading-7" style={{ color: 'var(--t-faint)' }}>从一份已保存的单人命盘开始，先查看字段脱敏预览，再明确选择用途并保存。</p>
          <Link href="/cases/new" className="mt-6 inline-block rounded-lg px-5 py-3 text-xs" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>开始创建</Link>
        </section>
      )}

      {!loading && !error && cases.length > 0 && (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cases.map(item => (
            <Link key={item.id} href={`/cases/${item.id}`} className="group rounded-2xl card-glass p-5 transition hover:-translate-y-0.5">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-[10px] tracking-wider" style={{ color: 'var(--t-gold)' }}>{item.caseCode}</span>
                <StatusBadge status={item.status} />
              </div>
              <h2 className="mt-4 text-base font-semibold" style={{ color: 'var(--t-text)' }}>{item.title}</h2>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <Metric label="五行局" value={item.wuxingJuName} />
                <Metric label="已确认事件" value={`${item.eventCount} 条`} />
                <Metric label="可信度" value={confidenceLabel(item.confidence)} />
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {item.activeScopes.map(scope => <ScopeBadge key={scope} scope={scope} />)}
              </div>
              <div className="mt-5 text-right text-[10px]" style={{ color: 'var(--t-faint)' }}>查看案例与授权 →</div>
            </Link>
          ))}
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg px-2 py-3" style={{ background: 'var(--ac-bg)' }}><div className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}</div><div className="mt-1 text-[11px]" style={{ color: 'var(--t-text2)' }}>{value}</div></div>;
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  const label = status === 'reviewed' ? '已复核' : status === 'archived' ? '已归档' : '待复核';
  const color = status === 'reviewed' ? '#22c55e' : status === 'archived' ? 'var(--t-faint)' : '#f59e0b';
  return <span className="rounded-full px-2.5 py-1 text-[9px]" style={{ color, border: `1px solid ${color}` }}>{label}</span>;
}

export function ScopeBadge({ scope }: { scope: string }) {
  const labels: Record<string, string> = { local_only: '仅本地', teaching: '教学使用', anonymous_export: '可匿名导出', public_release: '可公开' };
  return <span className="rounded-full px-2 py-1 text-[9px]" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>{labels[scope] ?? scope}</span>;
}

function confidenceLabel(value: string) {
  return value === 'high' ? '较高' : value === 'low' ? '较低' : '中等';
}

function PageState({ text, error = false }: { text: string; error?: boolean }) {
  return <div className="rounded-xl card-glass px-5 py-20 text-center text-sm" style={{ color: error ? '#ef4444' : 'var(--t-faint)' }}>{text}</div>;
}
