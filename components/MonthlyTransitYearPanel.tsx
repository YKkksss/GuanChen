'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  MonthlyTransitYearItem,
  MonthlyTransitYearOverview,
  TransitTransform,
} from '@/lib/transits/types';
import { BRANCHES } from '@/lib/ziwei/constants';

interface MonthlyTransitYearPanelProps {
  conversationId: string;
  lunarYear: number | null;
  activeTargetDate: string | null;
  onDateChange: (date: string) => void;
}

const TRANSFORM_TYPES = ['禄', '权', '科', '忌'] as const;
const TRANSFORM_COLORS: Record<string, string> = {
  禄: '#10b981',
  权: '#3b82f6',
  科: '#d4a843',
  忌: '#ef4444',
};

export default function MonthlyTransitYearPanel({
  conversationId,
  lunarYear,
  activeTargetDate,
  onDateChange,
}: MonthlyTransitYearPanelProps) {
  const [overview, setOverview] = useState<MonthlyTransitYearOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [comparisonTargets, setComparisonTargets] = useState<string[]>([]);
  const timelineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (lunarYear === null) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch(`/api/conversations/${conversationId}/transits/months?year=${lunarYear}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async response => {
        const data = await response.json() as { overview?: MonthlyTransitYearOverview; error?: string };
        if (!response.ok || !data.overview) throw new Error(data.error || '全年流月加载失败');
        return data.overview;
      })
      .then(nextOverview => {
        setOverview(nextOverview);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setOverview(null);
        setError(loadError instanceof Error ? loadError.message : '全年流月加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [conversationId, lunarYear]);

  useEffect(() => {
    if (!overview) return;
    setComparisonTargets(current => {
      const valid = current.filter(target => overview.months.some(item => item.targetDate === target));
      if (valid.length > 0) return valid.slice(0, 2);
      const activeIndex = Math.max(0, overview.months.findIndex(item => item.targetDate === activeTargetDate));
      const neighborIndex = activeIndex < overview.months.length - 1 ? activeIndex + 1 : activeIndex - 1;
      return [overview.months[activeIndex]?.targetDate, overview.months[neighborIndex]?.targetDate]
        .filter((target): target is string => Boolean(target));
    });

    const activeElement = timelineRef.current?.querySelector<HTMLElement>(`[data-month-target="${activeTargetDate}"]`);
    if (timelineRef.current && activeElement) {
      timelineRef.current.scrollTo({ left: Math.max(0, activeElement.offsetLeft - 12), behavior: 'smooth' });
    }
  }, [activeTargetDate, overview]);

  const comparisonItems = useMemo(() => (
    comparisonTargets
      .map(target => overview?.months.find(item => item.targetDate === target) ?? null)
      .filter((item): item is MonthlyTransitYearItem => item !== null)
  ), [comparisonTargets, overview]);

  const toggleComparison = (targetDate: string) => {
    setComparisonTargets(current => {
      if (current.includes(targetDate)) return current.filter(target => target !== targetDate);
      if (current.length < 2) return [...current, targetDate];
      return [current[1], targetDate];
    });
  };

  if (lunarYear === null) return null;

  return (
    <div className="mt-4 rounded-xl p-3" style={{ border: '1px solid var(--t-border)', background: 'rgba(212,168,67,.035)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] tracking-[0.18em]" style={{ color: 'var(--t-gold)' }}>全年流月时间轴</div>
          <div className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>
            按农历流年展开；闰年会保留第 13 个真实流月
          </div>
        </div>
        {overview && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!overview.previousYearStartDate || loading}
              onClick={() => overview.previousYearStartDate && onDateChange(overview.previousYearStartDate)}
              className="h-7 rounded-lg px-2 text-[9px] disabled:opacity-30"
              style={{ border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
            >
              ← 上一流年
            </button>
            <span className="min-w-20 text-center text-[10px] font-medium" style={{ color: 'var(--t-gold)' }}>
              {overview.lunarYear} · {overview.monthCount} 月
            </span>
            <button
              type="button"
              disabled={!overview.nextYearStartDate || loading}
              onClick={() => overview.nextYearStartDate && onDateChange(overview.nextYearStartDate)}
              className="h-7 rounded-lg px-2 text-[9px] disabled:opacity-30"
              style={{ border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
            >
              下一流年 →
            </button>
          </div>
        )}
      </div>

      {loading && !overview && (
        <div className="py-7 text-center text-[10px]" style={{ color: 'var(--t-faint)' }}>正在生成全年流月时间轴…</div>
      )}
      {error && (
        <div className="mt-3 rounded-lg px-3 py-2 text-[10px] text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>
      )}

      {overview && (
        <>
          <div ref={timelineRef} className="mt-3 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-2">
              {overview.months.map((item, index) => {
                const active = item.targetDate === activeTargetDate;
                const comparisonIndex = comparisonTargets.indexOf(item.targetDate);
                return (
                  <div
                    key={item.snapshotId}
                    data-month-target={item.targetDate}
                    className="relative w-36 shrink-0 rounded-lg p-2.5"
                    style={{
                      border: active ? '1px solid rgba(212,168,67,.7)' : '1px solid var(--t-border)',
                      background: active ? 'rgba(212,168,67,.10)' : 'var(--t-card)',
                    }}
                  >
                    <button type="button" onClick={() => onDateChange(item.targetDate)} className="w-full text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium" style={{ color: active ? 'var(--t-gold)' : 'var(--t-text)' }}>
                          {item.lunarMonth.label}
                        </span>
                        <span className="text-[8px]" style={{ color: 'var(--t-faint)' }}>{index + 1}/{overview.monthCount}</span>
                      </div>
                      <div className="mt-1.5 text-[10px]" style={{ color: 'var(--t-gold)' }}>{item.flowMonth.ganZhi}</div>
                      <div className="mt-1 text-[8px]" style={{ color: 'var(--t-faint)' }}>
                        {item.lunarMonth.startDate.slice(5)} — {item.lunarMonth.endDate.slice(5)}
                      </div>
                      <div className="mt-1 text-[8px]" style={{ color: 'var(--t-faint)' }}>
                        命宫落本命{item.flowMonth.nativePalaceName}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleComparison(item.targetDate)}
                      className="mt-2 w-full rounded-md py-1 text-[8px]"
                      style={{
                        border: comparisonIndex >= 0 ? '1px solid rgba(212,168,67,.45)' : '1px solid var(--t-border)',
                        color: comparisonIndex >= 0 ? 'var(--t-gold)' : 'var(--t-faint)',
                      }}
                    >
                      {comparisonIndex >= 0 ? `对比 ${comparisonIndex === 0 ? 'A' : 'B'} · 已选` : '加入重点对比'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-2 rounded-lg p-3" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] tracking-wider" style={{ color: 'var(--t-faint)' }}>重点月份事实对比</div>
              <div className="text-[8px]" style={{ color: 'var(--t-faint)' }}>最多选择 2 个月</div>
            </div>
            {comparisonItems.length < 2 ? (
              <div className="py-5 text-center text-[9px]" style={{ color: 'var(--t-faint)' }}>请从时间轴选择两个流月进行并排比较。</div>
            ) : (
              <MonthlyComparison first={comparisonItems[0]} second={comparisonItems[1]} onDateChange={onDateChange} />
            )}
          </div>

          <div className="mt-2 text-[8px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>
            本时间轴只比较命宫、四化和重点宫位等确定性结构，不自动评定“最好”“最差”或推断必然事件。
          </div>
        </>
      )}
    </div>
  );
}

function MonthlyComparison({
  first,
  second,
  onDateChange,
}: {
  first: MonthlyTransitYearItem;
  second: MonthlyTransitYearItem;
  onDateChange: (date: string) => void;
}) {
  const firstPalaces = Array.from(new Set(first.keyPalaces.map(item => item.nativePalaceName)));
  const secondPalaces = Array.from(new Set(second.keyPalaces.map(item => item.nativePalaceName)));
  const commonPalaces = firstPalaces.filter(name => secondPalaces.includes(name));
  const firstOnly = firstPalaces.filter(name => !secondPalaces.includes(name));
  const secondOnly = secondPalaces.filter(name => !firstPalaces.includes(name));

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-2 md:grid-cols-2">
        <ComparisonMonthCard marker="A" item={first} onDateChange={onDateChange} />
        <ComparisonMonthCard marker="B" item={second} onDateChange={onDateChange} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-separate border-spacing-y-1 text-left text-[9px]">
          <thead style={{ color: 'var(--t-faint)' }}>
            <tr><th className="px-2 py-1">四化</th><th className="px-2 py-1">A · {first.lunarMonth.label}</th><th className="px-2 py-1">B · {second.lunarMonth.label}</th></tr>
          </thead>
          <tbody>
            {TRANSFORM_TYPES.map(type => (
              <tr key={type} style={{ background: 'rgba(212,168,67,.035)' }}>
                <td className="rounded-l-md px-2 py-1.5 font-medium" style={{ color: TRANSFORM_COLORS[type] }}>化{type}</td>
                <td className="px-2 py-1.5" style={{ color: 'var(--t-text)' }}>{formatTransform(findTransform(first.transformations, type))}</td>
                <td className="rounded-r-md px-2 py-1.5" style={{ color: 'var(--t-text)' }}>{formatTransform(findTransform(second.transformations, type))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <PalaceDifference label="共同关注宫位" values={commonPalaces} color="var(--t-gold)" />
        <PalaceDifference label={`仅 A · ${first.lunarMonth.label}`} values={firstOnly} color="#3b82f6" />
        <PalaceDifference label={`仅 B · ${second.lunarMonth.label}`} values={secondOnly} color="#10b981" />
      </div>
    </div>
  );
}

function ComparisonMonthCard({
  marker,
  item,
  onDateChange,
}: {
  marker: 'A' | 'B';
  item: MonthlyTransitYearItem;
  onDateChange: (date: string) => void;
}) {
  return (
    <div className="rounded-lg p-2.5" style={{ border: '1px solid var(--t-border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[9px]" style={{ color: 'var(--t-gold)' }}>{marker} · {item.lunarMonth.label} · {item.flowMonth.ganZhi}</div>
          <div className="mt-1 text-[8px]" style={{ color: 'var(--t-faint)' }}>
            {item.lunarMonth.startDate} 至 {item.lunarMonth.endDate} · {item.lunarMonth.dayCount} 天
          </div>
          <div className="mt-1 text-[8px]" style={{ color: 'var(--t-faint)' }}>
            流月命宫：本命{item.flowMonth.nativePalaceName}（{BRANCHES[item.flowMonth.palaceBranch]}宫）
          </div>
        </div>
        <button type="button" onClick={() => onDateChange(item.targetDate)} className="shrink-0 text-[8px]" style={{ color: 'var(--t-gold)' }}>打开本月</button>
      </div>
    </div>
  );
}

function PalaceDifference({ label, values, color }: { label: string; values: string[]; color: string }) {
  return (
    <div className="rounded-md px-2.5 py-2" style={{ background: 'rgba(212,168,67,.035)' }}>
      <div className="text-[8px]" style={{ color }}>{label}</div>
      <div className="mt-1 text-[9px]" style={{ color: 'var(--t-text)' }}>{values.length > 0 ? values.join('、') : '无独立项'}</div>
    </div>
  );
}

function findTransform(transformations: TransitTransform[], type: typeof TRANSFORM_TYPES[number]) {
  return transformations.find(item => item.type === type);
}

function formatTransform(transform: TransitTransform | undefined) {
  if (!transform) return '未定位';
  return `${transform.starName} → 本命${transform.natalPalaceName ?? '未定位宫位'}`;
}
