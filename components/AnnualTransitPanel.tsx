'use client';

import type { AnnualTransitSnapshot } from '@/lib/transits/types';
import { BRANCHES } from '@/lib/ziwei/constants';

interface AnnualTransitPanelProps {
  snapshot: AnnualTransitSnapshot | null;
  year: number;
  minYear: number;
  maxYear: number;
  loading?: boolean;
  error?: string;
  onYearChange: (year: number) => void;
}

const TRANSFORM_COLORS: Record<string, string> = {
  禄: '#10b981',
  权: '#3b82f6',
  科: '#d4a843',
  忌: '#ef4444',
};

export default function AnnualTransitPanel({
  snapshot,
  year,
  minYear,
  maxYear,
  loading = false,
  error = '',
  onYearChange,
}: AnnualTransitPanelProps) {
  return (
    <section className="mt-4 rounded-xl card-glass p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[10px] tracking-[0.2em]" style={{ color: 'var(--t-gold)' }}>年度运势快照</div>
          <div className="mt-1 text-[10px]" style={{ color: 'var(--t-faint)' }}>
            排盘事实与 AI 解读分离，同一年结果会自动保存
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onYearChange(Math.max(minYear, year - 1))}
            disabled={year <= minYear || loading}
            className="h-8 w-8 rounded-lg disabled:opacity-30"
            style={{ border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
            aria-label="上一年"
          >
            ←
          </button>
          <input
            type="number"
            min={minYear}
            max={maxYear}
            value={year}
            onChange={event => {
              const next = Number.parseInt(event.target.value, 10);
              if (Number.isInteger(next)) onYearChange(Math.min(maxYear, Math.max(minYear, next)));
            }}
            className="h-8 w-24 rounded-lg bg-transparent px-2 text-center text-sm font-medium outline-none"
            style={{ border: '1px solid var(--t-border)', color: 'var(--t-gold)' }}
            aria-label="分析年份"
          />
          <button
            type="button"
            onClick={() => onYearChange(Math.min(maxYear, year + 1))}
            disabled={year >= maxYear || loading}
            className="h-8 w-8 rounded-lg disabled:opacity-30"
            style={{ border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
            aria-label="下一年"
          >
            →
          </button>
        </div>
      </div>

      {loading && (
        <div className="py-10 text-center text-xs" style={{ color: 'var(--t-faint)' }}>正在计算年度结构…</div>
      )}
      {!loading && error && (
        <div className="mt-4 rounded-lg px-3 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>
          {error}
        </div>
      )}

      {!loading && snapshot && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <FactCard label="流年干支" value={snapshot.year.ganZhi} detail={`${snapshot.selectedYear} 年`} />
            <FactCard label="虚岁" value={`${snapshot.nominalAge} 岁`} detail={snapshot.lunarDate} />
            <FactCard
              label="所在大限"
              value={`${snapshot.decadal.startAge ?? '?'}-${snapshot.decadal.endAge ?? '?'} 岁`}
              detail={`落本命${snapshot.decadal.nativePalaceName}`}
            />
            <FactCard
              label="流年命宫"
              value={`本命${snapshot.flowYear.nativePalaceName}`}
              detail={`${BRANCHES[snapshot.flowYear.palaceBranch]}宫`}
            />
          </div>

          <div>
            <div className="mb-2 text-[10px] tracking-wider" style={{ color: 'var(--t-faint)' }}>流年四化与本命落宫</div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {snapshot.transformations.map(item => (
                <div
                  key={`${item.type}-${item.starName}`}
                  className="rounded-lg px-3 py-2.5"
                  style={{ background: 'var(--t-card)', border: `1px solid ${TRANSFORM_COLORS[item.type]}35` }}
                >
                  <div className="text-xs font-medium" style={{ color: TRANSFORM_COLORS[item.type] }}>
                    {item.starName}化{item.type}
                  </div>
                  <div className="mt-1 text-[10px]" style={{ color: 'var(--t-faint)' }}>
                    {item.natalPalaceName ? `落本命${item.natalPalaceName}` : '本命盘未定位该星'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-[10px] tracking-wider" style={{ color: 'var(--t-faint)' }}>年度重点宫位</div>
            <div className="grid gap-2 md:grid-cols-2">
              {snapshot.keyPalaces.map(item => (
                <div key={item.branch} className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium" style={{ color: 'var(--t-text)' }}>{item.nativePalaceName}</span>
                    <span className="text-[9px]" style={{ color: 'var(--t-gold)' }}>流年{item.transitPalaceName}</span>
                  </div>
                  <div className="mt-1.5 text-[10px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>
                    {item.reasons.join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <details className="rounded-lg p-3" style={{ border: '1px solid var(--t-border)' }}>
            <summary className="cursor-pointer text-[10px]" style={{ color: 'var(--t-gold)' }}>
              查看计算依据与边界说明
            </summary>
            <div className="mt-3 space-y-2">
              {snapshot.evidence.map(item => (
                <div key={item.id} className="text-[10px] leading-relaxed" style={{ color: 'var(--t-faint)' }}>
                  <span style={{ color: 'var(--t-text)' }}>{item.label}：</span>{item.details}
                </div>
              ))}
              <div className="pt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>
                年度定位统一采用 {snapshot.representativeDate} 作为该年的代表日期，以避开春节前后的年界歧义。
              </div>
            </div>
          </details>

          <div className="rounded-lg px-3 py-2 text-[9px] leading-relaxed" style={{ color: 'var(--t-faint)', background: 'rgba(212,168,67,.06)' }}>
            本页展示传统命理计算与研究性解释，不构成医疗、投资、法律或其他专业决策依据。
          </div>
        </div>
      )}
    </section>
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
