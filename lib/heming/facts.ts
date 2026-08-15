import { BRANCHES } from '@/lib/ziwei/constants';
import type { ZiweiChart } from '@/lib/ziwei/types';
import {
  PALACE_NAMES,
  type ChartOwner,
  type HemingChartFacts,
  type HemingFactBundle,
  type HemingPalaceFact,
  type HemingStageFact,
  type PalaceName,
} from './types';

const PALACE_NAME_SET = new Set<string>(PALACE_NAMES);
const PALACE_ALIASES: Record<string, PalaceName> = {
  命: '命宫', 命宫: '命宫',
  兄弟: '兄弟宫', 兄弟宫: '兄弟宫',
  夫妻: '夫妻宫', 夫妻宫: '夫妻宫',
  子女: '子女宫', 子女宫: '子女宫',
  财帛: '财帛宫', 财帛宫: '财帛宫',
  疾厄: '疾厄宫', 疾厄宫: '疾厄宫',
  迁移: '迁移宫', 迁移宫: '迁移宫',
  仆役: '交友宫', 仆役宫: '交友宫', 交友: '交友宫', 交友宫: '交友宫',
  官禄: '官禄宫', 官禄宫: '官禄宫',
  田宅: '田宅宫', 田宅宫: '田宅宫',
  福德: '福德宫', 福德宫: '福德宫',
  父母: '父母宫', 父母宫: '父母宫',
};

/**
 * 把完整命盘转换成规则引擎允许读取的事实子集。
 * 明确不复制 selfSihua 等 M4 v1 禁用字段。
 */
export function extractHemingChartFacts(chart: ZiweiChart, owner: ChartOwner): HemingChartFacts {
  if (!Array.isArray(chart.palaces)) throw new Error(`${owner} 方命盘宫位数据缺失`);

  const palaceEntries = chart.palaces
    .map(palace => ({ palace, palaceName: normalizePalaceName(palace.name) }))
    .filter((entry): entry is { palace: typeof entry.palace; palaceName: PalaceName } => !!entry.palaceName)
    .map(({ palace, palaceName }) => {
      const stars = palace.stars
        .map(star => ({
          name: star.name,
          type: star.type,
          siHua: star.siHua,
          brightness: star.brightness,
        }))
        .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
      const fact: HemingPalaceFact = {
        owner,
        palace: palaceName,
        branchIndex: palace.branch,
        branch: BRANCHES[palace.branch] ?? String(palace.branch),
        stars,
        isEmpty: palace.isEmpty ?? !stars.some(star => star.type === 'major'),
      };
      return [palaceName, fact] as const;
    });

  const seenPalaces = new Set<PalaceName>();
  const duplicatePalaces = new Set<PalaceName>();
  for (const [palaceName] of palaceEntries) {
    if (seenPalaces.has(palaceName)) duplicatePalaces.add(palaceName);
    seenPalaces.add(palaceName);
  }
  if (duplicatePalaces.size) {
    throw new Error(`${owner} 方命盘宫位重复：${[...duplicatePalaces].join('、')}`);
  }

  const palaceMap = Object.fromEntries(palaceEntries) as Partial<Record<PalaceName, HemingPalaceFact>>;
  const missingPalaces = PALACE_NAMES.filter(name => !palaceMap[name]);
  if (missingPalaces.length) {
    throw new Error(`${owner} 方命盘缺少宫位：${missingPalaces.join('、')}`);
  }

  return {
    owner,
    birthTimeKnown: chart.birthInfo.unknownTime !== true,
    palaces: palaceMap as Record<PalaceName, HemingPalaceFact>,
    currentStage: extractCurrentStage(chart, owner),
  };
}

export function extractHemingFacts(chartA: ZiweiChart, chartB: ZiweiChart): HemingFactBundle {
  return {
    A: extractHemingChartFacts(chartA, 'A'),
    B: extractHemingChartFacts(chartB, 'B'),
  };
}

function extractCurrentStage(chart: ZiweiChart, owner: ChartOwner): HemingStageFact | null {
  const currentDaXian = chart.daXians?.[chart.currentDaXianIndex];
  const palaceName = currentDaXian ? normalizePalaceName(currentDaXian.palaceName) : null;
  if (!currentDaXian || !palaceName) return null;

  return {
    owner,
    palace: palaceName,
    branchIndex: currentDaXian.palaceBranch,
    branch: BRANCHES[currentDaXian.palaceBranch] ?? String(currentDaXian.palaceBranch),
    startAge: currentDaXian.startAge,
    endAge: currentDaXian.endAge,
  };
}

export function normalizePalaceName(value: string): PalaceName | null {
  const normalized = value.trim();
  if (PALACE_NAME_SET.has(normalized)) return normalized as PalaceName;
  return PALACE_ALIASES[normalized] ?? null;
}
