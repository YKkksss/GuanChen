'use client';

import type { MonthlyTransitSnapshot } from '@/lib/transits/types';
import { BRANCHES } from '@/lib/ziwei/constants';

interface MonthlyTransitPanelProps {
  snapshot: MonthlyTransitSnapshot | null;
  observationDate: string;
  minDate: string;
  maxDate: string;
  loading?: boolean;
  error?: string;
  onDateChange: (date: string) => void;
}

const TRANSFORM_COLORS: Record<string, string> = {
  禄: '#10b981',
  权: '#3b82f6',
  科: '#d4a843',
  忌: '#ef4444',
};

export default function MonthlyTransitPanel({
  snapshot,
  observationDate,
  minDate,
  maxDate,
  loading = false,
  error = '',
  onDateChange,
}: MonthlyTransitPanelProps) {
  const previousDate = snapshot
    ? addDays(snapshot.lunarMonth.startDate, -1)
    : addDays(observationDate, -30);
  const nextDate = snapshot
    ? addDays(snapshot.lunarMonth.endDate, 1)
    : addDays(observationDate, 30);

  return (
    <section className="mt-4 rounded-xl card-glass p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] tracking-[0.2em]" style={{ color: 'var(--t-gold)' }}>流月运势快照</div>
          <div className="mt-1 text-[10px]" style={{ color: 'var(--t-faint)' }}>
            选择公历观察日，系统按农历初一自动归入对应流月
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onDateChange(clampDate(previousDate, minDate, maxDate))}
            disabled={previousDate < minDate || loading}
            className="h-8 rounded-lg px-2.5 text-[10px] disabled:opacity-30"
            style={{ border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
          >
            ← 上一流月
          </button>
          <input
            type="date"
            min={minDate}
            max={maxDate}
            value={observationDate}
            onChange={event => {
              if (event.target.value) onDateChange(clampDate(event.target.value, minDate, maxDate));
            }}
            className="h-8 rounded-lg bg-transparent px-2 text-center text-xs font-medium outline-none"
            style={{ border: '1px solid var(--t-border)', color: 'var(--t-gold)' }}
            aria-label="流月观察日期"
          />
          <button
            type="button"
            onClick={() => onDateChange(clampDate(nextDate, minDate, maxDate))}
            disabled={nextDate > maxDate || loading}
            className="h-8 rounded-lg px-2.5 text-[10px] disabled:opacity-30"
            style={{ border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
          >
            下一流月 →
          </button>
        </div>
      </div>

      {loading && (
        <div className="py-10 text-center text-xs" style={{ color: 'var(--t-faint)' }}>正在定位农历月界并计算流月结构…</div>
      )}
      {!loading && error && (
        <div className="mt-4 rounded-lg px-3 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>
          {error}
        </div>
      )}

      {!loading && snapshot && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg px-3 py-2.5 text-[10px] leading-relaxed" style={{ background: 'rgba(212,168,67,.08)', color: 'var(--t-faint)' }}>
            观察日 <span style={{ color: 'var(--t-text)' }}>{observationDate}</span> 属于农历
            <span className="mx-1 font-medium" style={{ color: 'var(--t-gold)' }}>{snapshot.lunarMonth.year} 年{snapshot.lunarMonth.label}</span>
            ，本期从 {snapshot.lunarMonth.startDate} 至 {snapshot.lunarMonth.endDate}。
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <FactCard label="流年背景" value={snapshot.year.ganZhi} detail={`虚岁 ${snapshot.nominalAge} 岁`} />
            <FactCard label="流月干支" value={snapshot.flowMonth.ganZhi} detail={`${snapshot.lunarMonth.year} 年${snapshot.lunarMonth.label}`} />
            <FactCard label="流月命宫" value={`本命${snapshot.flowMonth.nativePalaceName}`} detail={`${BRANCHES[snapshot.flowMonth.palaceBranch]}宫`} />
            <FactCard label="流月范围" value={`${snapshot.lunarMonth.dayCount} 天`} detail={`${snapshot.lunarMonth.startDate} — ${snapshot.lunarMonth.endDate}`} />
          </div>

          <TransformSection title="流月四化与本命落宫" transformations={snapshot.transformations} />

          <div>
            <div className="mb-2 text-[10px] tracking-wider" style={{ color: 'var(--t-faint)' }}>流月重点宫位</div>
            <div className="grid gap-2 md:grid-cols-2">
              {snapshot.keyPalaces.map(item => {
                const mapping = snapshot.palaceMappings.find(candidate => candidate.branch === item.branch);
                return (
                  <div key={item.branch} className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium" style={{ color: 'var(--t-text)' }}>{item.nativePalaceName}</span>
                      <span className="text-[9px]" style={{ color: 'var(--t-gold)' }}>流月{item.transitPalaceName}</span>
                    </div>
                    <div className="mt-1.5 text-[10px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>
                      {item.reasons.join(' · ')}
                    </div>
                    {Boolean(mapping?.transitStars.length) && (
                      <div className="mt-1.5 text-[9px]" style={{ color: 'var(--t-gold)' }}>
                        流曜：{mapping?.transitStars.join('、')}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <details className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)' }}>
            <summary className="cursor-pointer text-[10px]" style={{ color: 'var(--t-gold)' }}>
              查看流年背景、十二宫映射与计算依据
            </summary>
            <div className="mt-3 space-y-3">
              <TransformSection title="本流年的四化背景" transformations={snapshot.yearlyTransformations} compact />
              <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {snapshot.palaceMappings.map(item => (
                  <div key={item.branch} className="rounded-md px-2.5 py-2 text-[9px]" style={{ background: 'var(--t-card)', color: 'var(--t-faint)' }}>
                    本命{item.nativePalaceName} → 流月{item.transitPalaceName}
                    {item.transitStars.length > 0 && <div className="mt-1" style={{ color: 'var(--t-gold)' }}>{item.transitStars.join('、')}</div>}
                  </div>
                ))}
              </div>
              {snapshot.evidence.map(item => (
                <div key={item.id} className="text-[10px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>
                  <span style={{ color: 'var(--t-text)' }}>{item.label}：</span>{item.details}
                </div>
              ))}
            </div>
          </details>

          <div className="rounded-lg px-3 py-2 text-[9px] leading-relaxed" style={{ color: 'var(--t-faint)', background: 'rgba(212,168,67,.06)' }}>
            流月是年度趋势中的短周期观察层，不等于确定事件；本页仅供传统文化学习与个人参考。
          </div>
        </div>
      )}
    </section>
  );
}

function TransformSection({
  title,
  transformations,
  compact = false,
}: {
  title: string;
  transformations: MonthlyTransitSnapshot['transformations'];
  compact?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 text-[10px] tracking-wider" style={{ color: 'var(--t-faint)' }}>{title}</div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {transformations.map(item => (
          <div
            key={`${item.type}-${item.starName}`}
            className={`rounded-lg px-3 ${compact ? 'py-2' : 'py-2.5'}`}
            style={{ background: 'var(--t-card)', border: `1px solid ${TRANSFORM_COLORS[item.type]}35` }}
          >
            <div className="text-xs font-medium" style={{ color: TRANSFORM_COLORS[item.type] }}>
              {item.starName}化{item.type}
            </div>
            <div className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>
              {item.natalPalaceName ? `落本命${item.natalPalaceName}` : '本命盘未定位该星'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FactCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
      <div className="text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}</div>
      <div className="mt-1 text-sm font-medium" style={{ color: 'var(--t-gold)' }}>{value}</div>
      <div className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>{detail}</div>
    </div>
  );
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function clampDate(date: string, minDate: string, maxDate: string): string {
  return date < minDate ? minDate : date > maxDate ? maxDate : date;
}
