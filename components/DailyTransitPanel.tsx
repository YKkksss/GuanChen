'use client';

import type { DailyTransitSnapshot, TransitTransform } from '@/lib/transits/types';
import { BRANCHES } from '@/lib/ziwei/constants';

interface DailyTransitPanelProps {
  snapshot: DailyTransitSnapshot | null;
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

export default function DailyTransitPanel({
  snapshot,
  observationDate,
  minDate,
  maxDate,
  loading = false,
  error = '',
  onDateChange,
}: DailyTransitPanelProps) {
  const today = localToday();
  const canUseToday = today >= minDate && today <= maxDate;

  return (
    <section className="mt-4 rounded-xl card-glass p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] tracking-[0.2em]" style={{ color: 'var(--t-gold)' }}>流日运势快照</div>
          <div className="mt-1 text-[10px]" style={{ color: 'var(--t-faint)' }}>
            按公历日期保存，用早子时作为日期级代表点
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onDateChange(clampDate(addDays(observationDate, -1), minDate, maxDate))}
            disabled={observationDate <= minDate || loading}
            className="h-8 rounded-lg px-2.5 text-[10px] disabled:opacity-30"
            style={{ border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
          >
            ← 前一日
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
            aria-label="流日观察日期"
          />
          <button
            type="button"
            onClick={() => onDateChange(clampDate(addDays(observationDate, 1), minDate, maxDate))}
            disabled={observationDate >= maxDate || loading}
            className="h-8 rounded-lg px-2.5 text-[10px] disabled:opacity-30"
            style={{ border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
          >
            后一日 →
          </button>
          {canUseToday && observationDate !== today && (
            <button
              type="button"
              onClick={() => onDateChange(today)}
              disabled={loading}
              className="h-8 rounded-lg px-2.5 text-[10px] disabled:opacity-30"
              style={{ border: '1px solid rgba(212,168,67,.28)', color: 'var(--t-gold)', background: 'rgba(212,168,67,.07)' }}
            >
              回到今天
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div className="py-10 text-center text-xs" style={{ color: 'var(--t-faint)' }}>正在计算流日十二宫、四化与流曜…</div>
      )}
      {!loading && error && (
        <div className="mt-4 rounded-lg px-3 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>
          {error}
        </div>
      )}

      {!loading && snapshot && (
        <div className="mt-4 space-y-4">
          <div className="rounded-lg px-3 py-2.5 text-[10px] leading-relaxed" style={{ background: 'rgba(212,168,67,.08)', color: 'var(--t-faint)' }}>
            公历 <span style={{ color: 'var(--t-text)' }}>{snapshot.targetDate}</span> 对应农历
            <span className="mx-1 font-medium" style={{ color: 'var(--t-gold)' }}>
              {snapshot.lunarDay.year} 年{snapshot.lunarDay.monthLabel}{snapshot.lunarDay.dayLabel}
            </span>
            ，本页是日期级观察，不包含晚子时的跨日判定。
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <FactCard label="流年 · 流月" value={`${snapshot.year.ganZhi} · ${snapshot.flowMonth.ganZhi}`} detail={`${snapshot.lunarDay.year} 年${snapshot.lunarDay.monthLabel}`} />
            <FactCard label="流日干支" value={snapshot.flowDay.ganZhi} detail={snapshot.targetDate} />
            <FactCard label="流日命宫" value={`本命${snapshot.flowDay.nativePalaceName}`} detail={`${BRANCHES[snapshot.flowDay.palaceBranch]}宫`} />
            <FactCard label="所在大限" value={`${snapshot.decadal.startAge ?? '?'}-${snapshot.decadal.endAge ?? '?'} 岁`} detail={`落本命${snapshot.decadal.nativePalaceName}`} />
          </div>

          <TransformSection title="流日四化与本命落宫" transformations={snapshot.transformations} />

          <div>
            <div className="mb-2 text-[10px] tracking-wider" style={{ color: 'var(--t-faint)' }}>流日重点宫位</div>
            <div className="grid gap-2 md:grid-cols-2">
              {snapshot.keyPalaces.map(item => {
                const mapping = snapshot.palaceMappings.find(candidate => candidate.branch === item.branch);
                return (
                  <div key={item.branch} className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium" style={{ color: 'var(--t-text)' }}>{item.nativePalaceName}</span>
                      <span className="text-[9px]" style={{ color: 'var(--t-gold)' }}>流日{item.transitPalaceName}</span>
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
              查看上层四化、十二宫映射与日期边界
            </summary>
            <div className="mt-3 space-y-3">
              <TransformSection title="流月四化背景" transformations={snapshot.monthlyTransformations} compact />
              <TransformSection title="流年四化背景" transformations={snapshot.yearlyTransformations} compact />
              <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                {snapshot.palaceMappings.map(item => (
                  <div key={item.branch} className="rounded-md px-2.5 py-2 text-[9px]" style={{ background: 'var(--t-card)', color: 'var(--t-faint)' }}>
                    本命{item.nativePalaceName} → 流日{item.transitPalaceName}
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
            流日只适合短周期观察和日记复盘，不代表当天必然发生某件事情，也不替代现实中的医疗、投资、法律或其他专业判断。
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
  transformations: TransitTransform[];
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

function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
