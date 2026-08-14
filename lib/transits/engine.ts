import { astro } from 'iztro';
import { BRANCHES } from '@/lib/ziwei/constants';
import type { SiHua, ZiweiChart } from '@/lib/ziwei/types';
import type {
  AnnualTransitSnapshot,
  TransitKeyPalace,
  TransitPalaceMapping,
  TransitTransform,
} from './types';

export const TRANSIT_ENGINE_VERSION = 'transit-v1-iztro-2.5.8';

const TRANSFORM_TYPES: SiHua[] = ['禄', '权', '科', '忌'];

function branchIndex(branch: string): number {
  const index = BRANCHES.indexOf(branch);
  if (index < 0) throw new Error(`无法识别地支：${branch}`);
  return index;
}

function findMappingBranch(
  mappings: TransitPalaceMapping[],
  palaceName: string,
): number {
  return mappings.find(item => item.transitPalaceName === palaceName)?.branch ?? -1;
}

function buildKeyPalaces(
  chart: ZiweiChart,
  mappings: TransitPalaceMapping[],
  flowYearBranch: number,
  transformations: TransitTransform[],
): TransitKeyPalace[] {
  const reasonMap = new Map<number, string[]>();
  const addReason = (branch: number, reason: string) => {
    if (branch < 0) return;
    const reasons = reasonMap.get(branch) ?? [];
    if (!reasons.includes(reason)) reasons.push(reason);
    reasonMap.set(branch, reasons);
  };

  addReason(flowYearBranch, '流年命宫落点');
  addReason((flowYearBranch + 6) % 12, '流年命宫对宫');
  addReason((flowYearBranch + 4) % 12, '流年命宫三合宫');
  addReason((flowYearBranch + 8) % 12, '流年命宫三合宫');
  transformations.forEach(item => {
    if (item.natalPalaceBranch !== null) {
      addReason(item.natalPalaceBranch, `流年化${item.type}（${item.starName}）落入`);
    }
  });

  return Array.from(reasonMap.entries()).map(([branch, reasons]) => {
    const nativePalace = chart.palaces.find(item => item.branch === branch);
    const mapping = mappings.find(item => item.branch === branch);
    return {
      branch,
      nativePalaceName: nativePalace?.name ?? `${BRANCHES[branch]}宫`,
      transitPalaceName: mapping?.transitPalaceName ?? '未知宫位',
      reasons,
    };
  });
}

/**
 * 生成年度运势的确定性快照。
 * 年度选择使用当年 7 月 1 日作为代表日期，避开春节前后年界歧义；
 * 这只是定位运限结构，不直接生成吉凶判断。
 */
export function buildAnnualTransitSnapshot(
  chart: ZiweiChart,
  selectedYear: number,
): AnnualTransitSnapshot {
  const representativeDate = `${selectedYear}-7-1`;
  const birth = chart.birthInfo;
  const gender = birth.gender === 'male' ? '男' : '女';
  const astrolabe = astro.bySolar(
    `${birth.year}-${birth.month}-${birth.day}`,
    birth.hour,
    gender,
    true,
    'zh-CN',
  );
  const horoscope = astrolabe.horoscope(representativeDate, birth.hour);

  const palaceMappings: TransitPalaceMapping[] = astrolabe.palaces.map((palace, index) => ({
    branch: branchIndex(palace.earthlyBranch as string),
    nativePalaceName: palace.name as string,
    transitPalaceName: horoscope.yearly.palaceNames[index] as string,
    transitStars: (horoscope.yearly.stars?.[index] ?? []).map(star => star.name as string),
  }));

  const flowYearBranch = branchIndex(astrolabe.palaces[horoscope.yearly.index].earthlyBranch as string);
  const decadalBranch = branchIndex(astrolabe.palaces[horoscope.decadal.index].earthlyBranch as string);
  const decadalFromChart = chart.daXians.find(item => item.palaceBranch === decadalBranch);
  const transformations: TransitTransform[] = horoscope.yearly.mutagen.map((starName, index) => {
    const natalPalace = chart.palaces.find(palace => palace.stars.some(star => star.name === starName));
    return {
      type: TRANSFORM_TYPES[index] ?? '忌',
      starName: starName as string,
      natalPalaceBranch: natalPalace?.branch ?? null,
      natalPalaceName: natalPalace?.name ?? null,
    };
  });

  const keyPalaces = buildKeyPalaces(
    chart,
    palaceMappings,
    flowYearBranch,
    transformations,
  );

  return {
    level: 'year',
    selectedYear,
    targetDate: String(selectedYear),
    representativeDate: `${selectedYear}-07-01`,
    boundaryPolicy: 'annual-midyear-representative-date',
    engineVersion: TRANSIT_ENGINE_VERSION,
    lunarDate: horoscope.lunarDate,
    nominalAge: horoscope.age.nominalAge,
    year: {
      heavenlyStem: horoscope.yearly.heavenlyStem as string,
      earthlyBranch: horoscope.yearly.earthlyBranch as string,
      ganZhi: `${horoscope.yearly.heavenlyStem}${horoscope.yearly.earthlyBranch}`,
    },
    decadal: {
      startAge: decadalFromChart?.startAge ?? null,
      endAge: decadalFromChart?.endAge ?? null,
      palaceBranch: decadalBranch,
      nativePalaceName: chart.palaces.find(item => item.branch === decadalBranch)?.name ?? '未知宫位',
      heavenlyStem: horoscope.decadal.heavenlyStem as string,
      earthlyBranch: horoscope.decadal.earthlyBranch as string,
    },
    flowYear: {
      palaceBranch: flowYearBranch,
      nativePalaceName: chart.palaces.find(item => item.branch === flowYearBranch)?.name ?? '未知宫位',
      heavenlyStem: horoscope.yearly.heavenlyStem as string,
      earthlyBranch: horoscope.yearly.earthlyBranch as string,
    },
    transformations,
    relatedPalaceBranches: [
      flowYearBranch,
      (flowYearBranch + 6) % 12,
      (flowYearBranch + 4) % 12,
      (flowYearBranch + 8) % 12,
    ],
    palaceMappings,
    keyPalaces,
    topicPalaces: {
      career: findMappingBranch(palaceMappings, '官禄宫'),
      relationship: findMappingBranch(palaceMappings, '夫妻宫'),
      wealth: findMappingBranch(palaceMappings, '财帛宫'),
      health: findMappingBranch(palaceMappings, '疾厄宫'),
    },
    evidence: [
      {
        id: 'annual-ganzhi',
        label: '流年干支',
        source: 'iztro',
        details: `${selectedYear} 年按代表日期定位为 ${horoscope.yearly.heavenlyStem}${horoscope.yearly.earthlyBranch}年。`,
      },
      {
        id: 'decadal-position',
        label: '所在大限',
        source: 'iztro',
        details: `虚岁 ${horoscope.age.nominalAge}，大限落在本命${chart.palaces.find(item => item.branch === decadalBranch)?.name ?? '未知宫位'}。`,
      },
      {
        id: 'annual-life-palace',
        label: '流年命宫',
        source: 'iztro',
        details: `流年命宫落在本命${chart.palaces.find(item => item.branch === flowYearBranch)?.name ?? '未知宫位'}（${BRANCHES[flowYearBranch]}宫）。`,
      },
      {
        id: 'annual-mutagen',
        label: '流年四化',
        source: 'iztro',
        details: transformations.map(item => `${item.starName}化${item.type}`).join('、'),
      },
      {
        id: 'annual-palace-map',
        label: '流年十二宫映射',
        source: 'iztro',
        details: '将流年十二宫与本命十二宫逐宫对齐，用于专题宫位定位。',
      },
      {
        id: 'related-palaces',
        label: '三方四正',
        source: 'project-rule',
        details: '以流年命宫及其对宫、两个三合宫作为年度结构的首要观察范围。',
      },
    ],
  };
}
