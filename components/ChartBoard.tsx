'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { ArrowsOut, SquaresFour } from '@phosphor-icons/react';
import type { ZiweiChart, Palace, Star, DaXian } from '@/lib/ziwei/types';
import { BRANCHES, STEMS } from '@/lib/ziwei/constants';
import PalaceCell from './PalaceCell';
import TimeNav, { type TimeView, getYearStemIndex, buildSiHuaOverlay } from './TimeNav';

interface ChartBoardProps {
  chart: ZiweiChart;
  onStarSelect?: (star: Star, palace: Palace) => void;
  onPalaceSelect?: (palace: Palace | null) => void;
  selectedBranch?: number | null;
  onSiHuaClick?: (starName: string, siHua: string, view: TimeView) => void;
  timeView?: TimeView;
  liunianYear?: number;
  onTimeViewChange?: (view: TimeView) => void;
  onLiunianYearChange?: (year: number) => void;
  activeDaXian?: DaXian;
}

const BRANCH_GRID_POS: Record<number, [number, number]> = {
  5: [1, 1], 6: [1, 2], 7: [1, 3], 8: [1, 4],
  4: [2, 1], 9: [2, 4],
  3: [3, 1], 10: [3, 4],
  2: [4, 1], 1: [4, 2], 0: [4, 3], 11: [4, 4],
};

// 每个地支宫位在网格中的中心坐标（百分比）
const BRANCH_SVG_POS: Record<number, [number, number]> = {
  5: [12.5, 12.5], 6: [37.5, 12.5], 7: [62.5, 12.5], 8: [87.5, 12.5],
  4: [12.5, 37.5],                                      9: [87.5, 37.5],
  3: [12.5, 62.5],                                     10: [87.5, 62.5],
  2: [12.5, 87.5], 1: [37.5, 87.5], 0: [62.5, 87.5], 11: [87.5, 87.5],
};

// 绕盘面顺时针排列（用于三方四正四边形排序）
const CLOCKWISE_INDEX: Record<number, number> = {
  5: 0, 6: 1, 7: 2, 8: 3,
  9: 4, 10: 5,
  11: 6, 0: 7, 1: 8, 2: 9,
  3: 10, 4: 11,
};

function sortClockwise(branches: number[]): number[] {
  return [...branches].sort((a, b) => CLOCKWISE_INDEX[a] - CLOCKWISE_INDEX[b]);
}

/** 三方四正：本宫 + 对宫 + 两个三合宫 */
function getSanFangSiZheng(branch: number): [number, number, number, number] {
  return [
    branch,
    (branch + 6) % 12,   // 对宫
    (branch + 4) % 12,   // 三合1
    (branch + 8) % 12,   // 三合2
  ];
}

const ANIMATION_ORDER = [5, 6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4];

export default function ChartBoard({
  chart,
  onStarSelect,
  onPalaceSelect,
  selectedBranch: controlledSelectedBranch,
  onSiHuaClick,
  timeView: controlledTimeView,
  liunianYear: controlledLiunianYear,
  onTimeViewChange,
  onLiunianYearChange,
  activeDaXian,
}: ChartBoardProps) {
  const [internalSelectedBranch, setInternalSelectedBranch] = useState<number | null>(null);
  const [mobileBoardMode, setMobileBoardMode] = useState<'overview' | 'readable'>('readable');
  const selectedBranch = controlledSelectedBranch === undefined ? internalSelectedBranch : controlledSelectedBranch;
  const [internalTimeView, setInternalTimeView] = useState<TimeView>('mingpan');
  const [internalLiunianYear, setInternalLiunianYear] = useState<number>(new Date().getFullYear());
  const timeView = controlledTimeView ?? internalTimeView;
  const liunianYear = controlledLiunianYear ?? internalLiunianYear;
  const setTimeView = (view: TimeView) => {
    setInternalTimeView(view);
    onTimeViewChange?.(view);
  };
  const setLiunianYear = (year: number) => {
    setInternalLiunianYear(year);
    onLiunianYearChange?.(year);
  };

  const palaceMap: Record<number, Palace> = {};
  chart.palaces.forEach(p => { palaceMap[p.branch] = p; });

  // 计算当前叠加四化数据（大限或流年）
  const currentDx = activeDaXian ?? chart.daXians[chart.currentDaXianIndex];
  const overlayData: Record<string, string> = (() => {
    if (timeView === 'daxian' && currentDx) {
      const dxPalace = chart.palaces.find(p => p.branch === currentDx.palaceBranch);
      if (dxPalace) return buildSiHuaOverlay(dxPalace.stem);
    }
    if (timeView === 'liunian') {
      return buildSiHuaOverlay(getYearStemIndex(liunianYear));
    }
    return {};
  })();
  const overlayLabel = timeView === 'daxian' ? '限' : timeView === 'liunian' ? '年' : undefined;

  const handlePalaceClick = (branch: number) => {
    const isDeselecting = selectedBranch === branch;
    setInternalSelectedBranch(isDeselecting ? null : branch);
    const palace = palaceMap[branch];
    onPalaceSelect?.(isDeselecting ? null : palace ?? null);
  };

  // 三方四正
  const sanFangBranches = selectedBranch !== null ? getSanFangSiZheng(selectedBranch) : null;
  const sanFangSet = sanFangBranches ? new Set(sanFangBranches) : null;

  return (
    <div className="eastern-chart-board select-none">
      {/* 时间导航轴 */}
      <TimeNav
        chart={chart}
        view={timeView}
        liunianYear={liunianYear}
        onViewChange={setTimeView}
        onYearChange={setLiunianYear}
        activeDaXian={currentDx}
      />

      {/* 命盘摘要 */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="eastern-chart-caption"
      >
        <div className="eastern-chart-caption-primary">
          <span>命主：{chart.birthInfo.name || '未命名'}</span>
          <span>{chart.birthInfo.gender === 'male' ? '男命' : '女命'}</span>
          <span>{chart.wuxingJuName}</span>
        </div>
        <span className="eastern-chart-caption-hint">点击宫位查看三方四正</span>
      </motion.div>

      <div className="eastern-chart-mobile-toolbar" aria-label="手机命盘显示方式">
        <div className="eastern-chart-mobile-toolbar-copy">
          <strong>命盘显示</strong>
          <span>{mobileBoardMode === 'readable' ? '左右滑动可查看完整十二宫' : '整体查看盘面结构'}</span>
        </div>
        <div className="eastern-chart-mobile-mode-switch" role="group" aria-label="切换命盘显示方式">
          <button type="button" className={mobileBoardMode === 'overview' ? 'is-active' : ''} onClick={() => setMobileBoardMode('overview')} aria-pressed={mobileBoardMode === 'overview'}>
            <SquaresFour size={15} aria-hidden="true" />
            总览
          </button>
          <button type="button" className={mobileBoardMode === 'readable' ? 'is-active' : ''} onClick={() => setMobileBoardMode('readable')} aria-pressed={mobileBoardMode === 'readable'}>
            <ArrowsOut size={15} aria-hidden="true" />
            放大
          </button>
        </div>
      </div>

      {/* 4x4 命盘网格（含 SVG 叠加层） */}
      <div className={`eastern-palace-viewport is-${mobileBoardMode}`}>
        <div
          className="eastern-palace-grid grid overflow-hidden relative"
          style={{
            gridTemplateColumns: 'repeat(4, 1fr)',
            gridTemplateRows: 'repeat(4, minmax(104px, 1fr))',
            gap: '1px',
          }}
        >
        {ANIMATION_ORDER.map((branch, i) => {
          const [row, col] = BRANCH_GRID_POS[branch];
          const palace = palaceMap[branch];
          if (!palace) return null;
          return (
            <div key={branch} className="eastern-palace-slot" style={{ gridRow: row, gridColumn: col }}>
              <PalaceCell
                palace={palace}
                onClick={() => handlePalaceClick(branch)}
                onStarClick={onStarSelect ? (star) => onStarSelect(star, palace) : undefined}
                isSelected={selectedBranch === branch}
                isSanFang={!!(sanFangSet?.has(branch) && selectedBranch !== branch)}
                delay={i * 0.04}
                overlayStarSiHua={Object.keys(overlayData).length > 0 ? overlayData : undefined}
                overlayLabel={overlayLabel}
                onSiHuaClick={onSiHuaClick ? (starName, siHua) => onSiHuaClick(starName, siHua, timeView) : undefined}
              />
            </div>
          );
        })}

        {/* 中央信息区 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          className="eastern-chart-center"
          style={{ gridRow: '2 / 4', gridColumn: '2 / 4' }}
        >
          <Image src="/assets/brand/guanchen-seal.svg" alt="观辰标识" width={48} height={48} />

          <div className="eastern-chart-center-copy">
            <div className="eastern-chart-center-kicker">紫微斗数 · 本命</div>
            <h2>观辰 · 紫微命盘</h2>
            <div className="eastern-chart-center-data">
              <div>{chart.birthInfo.year}年{chart.birthInfo.month}月{chart.birthInfo.day}日</div>
              <div>命宫在{BRANCHES[chart.mingGongBranch]} · 身宫在{BRANCHES[chart.shenGongBranch]}</div>
              <div>{chart.wuxingJuName}</div>
            </div>
          </div>

          {chart.currentDaXianIndex >= 0 && (() => {
            const dx = chart.daXians[chart.currentDaXianIndex];
            return (
              <div className="eastern-current-daxian">
                <span>当前大限</span>
                <strong>{dx.startAge}-{dx.endAge}岁</strong>
                <small>{dx.palaceName}</small>
              </div>
            );
          })()}

          <div className="eastern-lunar-date">
            {chart.lunarInfo.lunarYear}·{chart.lunarInfo.isLeapMonth ? '闰' : ''}
            {chart.lunarInfo.lunarMonth}·{chart.lunarInfo.lunarDay}
          </div>
        </motion.div>

        {/* ── 三方四正 SVG 连线（绝对定位在 grid 内部，受 overflow:hidden 裁切） ── */}
        <AnimatePresence>
          {sanFangBranches !== null && (
            <motion.div
              key={`sf-${selectedBranch}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="pointer-events-none"
              style={{
                position: 'absolute',
                inset: 0,
                zIndex: 20,
              }}
            >
              <svg
                width="100%"
                height="100%"
                xmlns="http://www.w3.org/2000/svg"
                style={{ display: 'block' }}
              >
                {(() => {
                  // 三角形（三方）+ 一条直线（对宫）
                  const p0 = BRANCH_SVG_POS[sanFangBranches[0]]; // 本宫
                  const p1 = BRANCH_SVG_POS[sanFangBranches[1]]; // 对宫
                  const p2 = BRANCH_SVG_POS[sanFangBranches[2]]; // 三合1
                  const p3 = BRANCH_SVG_POS[sanFangBranches[3]]; // 三合2
                  const dash = "6,5";
                   const stroke = "var(--chart-link)";
                  const sw = "1.5";
                  return (
                    <>
                      {/* 对宫直线：本宫 ↔ 对宫（穿过中心） */}
                      <line
                        x1={`${p0[0]}%`} y1={`${p0[1]}%`}
                        x2={`${p1[0]}%`} y2={`${p1[1]}%`}
                        stroke={stroke} strokeWidth={sw}
                        strokeDasharray={dash} strokeLinecap="round"
                      />
                      {/* 三合三角形：本宫 → 三合1 → 三合2 → 本宫 */}
                      <line
                        x1={`${p0[0]}%`} y1={`${p0[1]}%`}
                        x2={`${p2[0]}%`} y2={`${p2[1]}%`}
                        stroke={stroke} strokeWidth={sw}
                        strokeDasharray={dash} strokeLinecap="round"
                      />
                      <line
                        x1={`${p2[0]}%`} y1={`${p2[1]}%`}
                        x2={`${p3[0]}%`} y2={`${p3[1]}%`}
                        stroke={stroke} strokeWidth={sw}
                        strokeDasharray={dash} strokeLinecap="round"
                      />
                      <line
                        x1={`${p3[0]}%`} y1={`${p3[1]}%`}
                        x2={`${p0[0]}%`} y2={`${p0[1]}%`}
                        stroke={stroke} strokeWidth={sw}
                        strokeDasharray={dash} strokeLinecap="round"
                      />
                      {/* 四个宫位中心标记点 */}
                      {[p0, p1, p2, p3].map((p, i) => (
                        <circle
                          key={i}
                          cx={`${p[0]}%`} cy={`${p[1]}%`}
                          r="3"
                          fill={i === 0 ? 'var(--chart-link-strong)' : 'var(--chart-link-soft)'}
                        />
                      ))}
                    </>
                  );
                })()}
              </svg>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      {/* 图例 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.7 }}
        className="eastern-chart-legend"
      >
        {[
          { h: '化禄', c: 'badge-lu' },
          { h: '化权', c: 'badge-quan' },
          { h: '化科', c: 'badge-ke' },
          { h: '化忌', c: 'badge-ji' },
        ].map(({ h, c }) => (
          <span key={h} className={`eastern-legend-badge ${c}`}>{h}</span>
        ))}
        <span className="eastern-legend-hint">
          点击宫位看三方四正
        </span>
      </motion.div>
    </div>
  );
}
