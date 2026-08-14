import { BRANCHES, STEMS } from '@/lib/ziwei/constants';
import type { Palace, ZiweiChart } from '@/lib/ziwei/types';
import type { ContextTopic } from './topic-router';
import { getTopicPalaceNames } from './topic-router';

export function buildCompactChartBase(chart: ZiweiChart): string {
  const birth = chart.birthInfo;
  const currentDaXian = chart.daXians?.[chart.currentDaXianIndex] ?? null;
  const base = {
    birth: {
      date: `${birth.year}-${pad(birth.month)}-${pad(birth.day)}`,
      hourBranch: BRANCHES[birth.hour] ?? birth.hour,
      gender: birth.gender,
    },
    lunar: {
      year: chart.lunarInfo.lunarYear,
      month: chart.lunarInfo.lunarMonth,
      day: chart.lunarInfo.lunarDay,
      yearStemBranch: `${STEMS[chart.lunarInfo.yearStem] ?? ''}${BRANCHES[chart.lunarInfo.yearBranch] ?? ''}`,
      isLeapMonth: chart.lunarInfo.isLeapMonth,
    },
    core: {
      mingGong: BRANCHES[chart.mingGongBranch] ?? chart.mingGongBranch,
      shenGong: BRANCHES[chart.shenGongBranch] ?? chart.shenGongBranch,
      wuxingJu: chart.wuxingJuName,
      currentAge: chart.currentAge,
      currentDaXian: currentDaXian ? {
        ageRange: `${currentDaXian.startAge}-${currentDaXian.endAge}`,
        palace: currentDaXian.palaceName,
        branch: BRANCHES[currentDaXian.palaceBranch] ?? currentDaXian.palaceBranch,
        siHua: currentDaXian.siHua ?? null,
      } : null,
    },
    corePalaces: chart.palaces
      .filter(palace => palace.isMingGong || palace.isShenGong || palace.isCurrentDaXian)
      .map(compactPalace),
  };
  return JSON.stringify(base);
}

export function buildTopicChartContext(
  chart: ZiweiChart,
  topic: ContextTopic,
  palaceBranch: number | null,
): string {
  const branches = new Set<number>();
  const names = new Set(getTopicPalaceNames(topic));

  if (palaceBranch !== null) {
    branches.add(palaceBranch);
    branches.add((palaceBranch + 4) % 12);
    branches.add((palaceBranch + 8) % 12);
    branches.add((palaceBranch + 6) % 12);
  }

  const palaces = chart.palaces
    .filter(palace => branches.has(palace.branch) || names.has(normalizePalaceName(palace.name)))
    .map(compactPalace);

  return JSON.stringify({ topic, palaces });
}

function compactPalace(palace: Palace) {
  return {
    name: normalizePalaceName(palace.name),
    branch: BRANCHES[palace.branch] ?? palace.branch,
    stem: STEMS[palace.stem] ?? palace.stem,
    daXianAge: palace.daXianAge,
    flags: {
      ming: Boolean(palace.isMingGong),
      shen: Boolean(palace.isShenGong),
      currentDaXian: Boolean(palace.isCurrentDaXian),
      empty: Boolean(palace.isEmpty),
    },
    stars: palace.stars.map(star => ({
      name: star.name,
      type: star.type,
      siHua: star.siHua,
      brightness: star.brightness,
    })),
    selfSihua: palace.selfSihua ?? [],
    borrowedFrom: palace.borrowedFromName ?? null,
    borrowedStars: palace.borrowedStars ?? [],
  };
}

function normalizePalaceName(name: string): string {
  return name.endsWith('宫') ? name : `${name}宫`;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
