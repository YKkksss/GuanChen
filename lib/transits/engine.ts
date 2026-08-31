import { astro } from 'iztro';
import { Solar } from 'lunar-javascript';
import { BRANCHES } from '@/lib/ziwei/constants';
import type { SiHua, ZiweiChart } from '@/lib/ziwei/types';
import type {
  AnnualTransitSnapshot,
  DailyTransitSnapshot,
  MonthlyTransitSnapshot,
  TransitKeyPalace,
  TransitPalaceMapping,
  TransitTransform,
} from './types';

export const TRANSIT_ENGINE_VERSION = 'transit-v1-iztro-2.5.8';
export const MONTHLY_TRANSIT_ENGINE_VERSION = 'transit-month-v1-iztro-2.5.8-normal-lunar-boundary';
export const DAILY_TRANSIT_ENGINE_VERSION = 'transit-day-v1-iztro-2.5.8-early-rat-hour';

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
  flowPalaceBranch: number,
  transformations: TransitTransform[],
  levelLabel = '流年',
): TransitKeyPalace[] {
  const reasonMap = new Map<number, string[]>();
  const addReason = (branch: number, reason: string) => {
    if (branch < 0) return;
    const reasons = reasonMap.get(branch) ?? [];
    if (!reasons.includes(reason)) reasons.push(reason);
    reasonMap.set(branch, reasons);
  };

  addReason(flowPalaceBranch, `${levelLabel}命宫落点`);
  addReason((flowPalaceBranch + 6) % 12, `${levelLabel}命宫对宫`);
  addReason((flowPalaceBranch + 4) % 12, `${levelLabel}命宫三合宫`);
  addReason((flowPalaceBranch + 8) % 12, `${levelLabel}命宫三合宫`);
  transformations.forEach(item => {
    if (item.natalPalaceBranch !== null) {
      addReason(item.natalPalaceBranch, `${levelLabel}化${item.type}（${item.starName}）落入`);
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

function buildTransformations(
  chart: ZiweiChart,
  mutagen: readonly string[],
): TransitTransform[] {
  return mutagen.map((starName, index) => {
    const natalPalace = chart.palaces.find(palace => palace.stars.some(star => star.name === starName));
    return {
      type: TRANSFORM_TYPES[index] ?? '忌',
      starName,
      natalPalaceBranch: natalPalace?.branch ?? null,
      natalPalaceName: natalPalace?.name ?? null,
    };
  });
}

function parseSolarDate(targetDate: string): { year: number; month: number; day: number; iso: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate);
  if (!match) throw new Error('日期必须使用 YYYY-MM-DD 格式');
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (value.getUTCFullYear() !== year || value.getUTCMonth() !== month - 1 || value.getUTCDate() !== day) {
    throw new Error('日期不存在');
  }
  return { year, month, day, iso: formatSolarDate(value) };
}

function formatSolarDate(value: Date): string {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function addSolarDays(targetDate: string, days: number): string {
  const parsed = parseSolarDate(targetDate);
  const value = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days));
  return formatSolarDate(value);
}

function getLunarDate(targetDate: string) {
  const { year, month, day } = parseSolarDate(targetDate);
  return Solar.fromYmd(year, month, day).getLunar();
}

function buildLunarMonthLabel(monthName: string, isLeap: boolean): string {
  return `${isLeap && !monthName.startsWith('闰') ? '闰' : ''}${monthName}月`;
}

/**
 * 将任意公历观察日归一到它所属的农历月。
 * iztro 默认使用农历初一作为流月边界，因此同一农历月只保存一份快照。
 */
export function resolveMonthlyTransitPeriod(targetDate: string): MonthlyTransitSnapshot['lunarMonth'] {
  const parsed = parseSolarDate(targetDate);
  const selectedLunar = getLunarDate(parsed.iso);
  const startDate = addSolarDays(parsed.iso, -(selectedLunar.getDay() - 1));
  let nextStartDate: string | null = null;
  for (let offset = 28; offset <= 31; offset += 1) {
    const candidate = addSolarDays(startDate, offset);
    if (getLunarDate(candidate).getDay() === 1) {
      nextStartDate = candidate;
      break;
    }
  }
  if (!nextStartDate) throw new Error('无法定位下一个农历月初一');
  const monthNumber = selectedLunar.getMonth();
  const isLeap = monthNumber < 0;
  const absoluteMonth = Math.abs(monthNumber);
  const dayCount = Math.round(
    (Date.parse(`${nextStartDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000,
  );
  return {
    year: selectedLunar.getYear(),
    month: absoluteMonth,
    isLeap,
    label: buildLunarMonthLabel(selectedLunar.getMonthInChinese(), isLeap),
    startDate,
    endDate: addSolarDays(nextStartDate, -1),
    dayCount,
  };
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
  const transformations = buildTransformations(chart, horoscope.yearly.mutagen as string[]);

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

/**
 * 生成流月运势的确定性快照。
 * 输入是用户选择的公历观察日，快照统一归档到对应农历月初一，避免同一流月重复缓存。
 */
export function buildMonthlyTransitSnapshot(
  chart: ZiweiChart,
  targetDate: string,
): MonthlyTransitSnapshot {
  const lunarMonth = resolveMonthlyTransitPeriod(targetDate);
  const representativeDate = lunarMonth.startDate;
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
    transitPalaceName: horoscope.monthly.palaceNames[index] as string,
    transitStars: (horoscope.monthly.stars?.[index] ?? []).map(star => star.name as string),
  }));
  const flowYearBranch = branchIndex(astrolabe.palaces[horoscope.yearly.index].earthlyBranch as string);
  const flowMonthBranch = branchIndex(astrolabe.palaces[horoscope.monthly.index].earthlyBranch as string);
  const decadalBranch = branchIndex(astrolabe.palaces[horoscope.decadal.index].earthlyBranch as string);
  const decadalFromChart = chart.daXians.find(item => item.palaceBranch === decadalBranch);
  const yearlyTransformations = buildTransformations(chart, horoscope.yearly.mutagen as string[]);
  const transformations = buildTransformations(chart, horoscope.monthly.mutagen as string[]);
  const keyPalaces = buildKeyPalaces(
    chart,
    palaceMappings,
    flowMonthBranch,
    transformations,
    '流月',
  );

  return {
    level: 'month',
    targetDate: lunarMonth.startDate,
    representativeDate,
    boundaryPolicy: 'lunar-month-first-day',
    engineVersion: MONTHLY_TRANSIT_ENGINE_VERSION,
    lunarDate: horoscope.lunarDate,
    nominalAge: horoscope.age.nominalAge,
    lunarMonth,
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
    flowMonth: {
      palaceBranch: flowMonthBranch,
      nativePalaceName: chart.palaces.find(item => item.branch === flowMonthBranch)?.name ?? '未知宫位',
      heavenlyStem: horoscope.monthly.heavenlyStem as string,
      earthlyBranch: horoscope.monthly.earthlyBranch as string,
      ganZhi: `${horoscope.monthly.heavenlyStem}${horoscope.monthly.earthlyBranch}`,
    },
    yearlyTransformations,
    transformations,
    relatedPalaceBranches: [
      flowMonthBranch,
      (flowMonthBranch + 6) % 12,
      (flowMonthBranch + 4) % 12,
      (flowMonthBranch + 8) % 12,
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
        id: 'monthly-boundary',
        label: '流月边界',
        source: 'project-rule',
        details: `按农历初一换月，本流月覆盖公历 ${lunarMonth.startDate} 至 ${lunarMonth.endDate}，共 ${lunarMonth.dayCount} 天。`,
      },
      {
        id: 'monthly-ganzhi',
        label: '流月干支',
        source: 'iztro',
        details: `${lunarMonth.year} 年${lunarMonth.label}定位为 ${horoscope.monthly.heavenlyStem}${horoscope.monthly.earthlyBranch}月。`,
      },
      {
        id: 'monthly-life-palace',
        label: '流月命宫',
        source: 'iztro',
        details: `流月命宫落在本命${chart.palaces.find(item => item.branch === flowMonthBranch)?.name ?? '未知宫位'}（${BRANCHES[flowMonthBranch]}宫）。`,
      },
      {
        id: 'monthly-mutagen',
        label: '流月四化',
        source: 'iztro',
        details: transformations.map(item => `${item.starName}化${item.type}`).join('、'),
      },
      {
        id: 'monthly-stars',
        label: '流月流曜',
        source: 'iztro',
        details: `已将 ${palaceMappings.reduce((count, item) => count + item.transitStars.length, 0)} 个流月流曜定位到十二宫。`,
      },
      {
        id: 'monthly-palace-map',
        label: '流月十二宫映射',
        source: 'iztro',
        details: '将流月十二宫与本命十二宫逐宫对齐，用于月度专题宫位定位。',
      },
      {
        id: 'monthly-related-palaces',
        label: '三方四正',
        source: 'project-rule',
        details: '以流月命宫及其对宫、两个三合宫作为本月结构的首要观察范围。',
      },
    ],
  };
}

/**
 * 生成流日运势的确定性快照。
 * 日期级产品统一使用目标公历日的早子时作为代表点；晚子时跨日属于后续流时模块的范围。
 */
export function buildDailyTransitSnapshot(
  chart: ZiweiChart,
  targetDate: string,
): DailyTransitSnapshot {
  const parsed = parseSolarDate(targetDate);
  const representativeDate = parsed.iso;
  const lunar = getLunarDate(representativeDate);
  const lunarMonth = resolveMonthlyTransitPeriod(representativeDate);
  const birth = chart.birthInfo;
  const gender = birth.gender === 'male' ? '男' : '女';
  const astrolabe = astro.bySolar(
    `${birth.year}-${birth.month}-${birth.day}`,
    birth.hour,
    gender,
    true,
    'zh-CN',
  );
  // 不传 timeIndex 时，iztro 对纯日期使用早子时代表点。
  const horoscope = astrolabe.horoscope(representativeDate);

  const palaceMappings: TransitPalaceMapping[] = astrolabe.palaces.map((palace, index) => ({
    branch: branchIndex(palace.earthlyBranch as string),
    nativePalaceName: palace.name as string,
    transitPalaceName: horoscope.daily.palaceNames[index] as string,
    transitStars: (horoscope.daily.stars?.[index] ?? []).map(star => star.name as string),
  }));
  const flowYearBranch = branchIndex(astrolabe.palaces[horoscope.yearly.index].earthlyBranch as string);
  const flowMonthBranch = branchIndex(astrolabe.palaces[horoscope.monthly.index].earthlyBranch as string);
  const flowDayBranch = branchIndex(astrolabe.palaces[horoscope.daily.index].earthlyBranch as string);
  const decadalBranch = branchIndex(astrolabe.palaces[horoscope.decadal.index].earthlyBranch as string);
  const decadalFromChart = chart.daXians.find(item => item.palaceBranch === decadalBranch);
  const yearlyTransformations = buildTransformations(chart, horoscope.yearly.mutagen as string[]);
  const monthlyTransformations = buildTransformations(chart, horoscope.monthly.mutagen as string[]);
  const transformations = buildTransformations(chart, horoscope.daily.mutagen as string[]);
  const keyPalaces = buildKeyPalaces(
    chart,
    palaceMappings,
    flowDayBranch,
    transformations,
    '流日',
  );
  const lunarMonthNumber = lunar.getMonth();
  const isLeapMonth = lunarMonthNumber < 0;

  return {
    level: 'day',
    targetDate: representativeDate,
    representativeDate,
    representativeTimeIndex: 0,
    boundaryPolicy: 'civil-date-early-rat-hour-representative',
    engineVersion: DAILY_TRANSIT_ENGINE_VERSION,
    lunarDate: horoscope.lunarDate,
    nominalAge: horoscope.age.nominalAge,
    lunarDay: {
      year: lunar.getYear(),
      month: Math.abs(lunarMonthNumber),
      day: lunar.getDay(),
      isLeapMonth,
      monthLabel: buildLunarMonthLabel(lunar.getMonthInChinese(), isLeapMonth),
      dayLabel: lunar.getDayInChinese(),
    },
    lunarMonth,
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
    flowMonth: {
      palaceBranch: flowMonthBranch,
      nativePalaceName: chart.palaces.find(item => item.branch === flowMonthBranch)?.name ?? '未知宫位',
      heavenlyStem: horoscope.monthly.heavenlyStem as string,
      earthlyBranch: horoscope.monthly.earthlyBranch as string,
      ganZhi: `${horoscope.monthly.heavenlyStem}${horoscope.monthly.earthlyBranch}`,
    },
    flowDay: {
      palaceBranch: flowDayBranch,
      nativePalaceName: chart.palaces.find(item => item.branch === flowDayBranch)?.name ?? '未知宫位',
      heavenlyStem: horoscope.daily.heavenlyStem as string,
      earthlyBranch: horoscope.daily.earthlyBranch as string,
      ganZhi: `${horoscope.daily.heavenlyStem}${horoscope.daily.earthlyBranch}`,
    },
    yearlyTransformations,
    monthlyTransformations,
    transformations,
    relatedPalaceBranches: [
      flowDayBranch,
      (flowDayBranch + 6) % 12,
      (flowDayBranch + 4) % 12,
      (flowDayBranch + 8) % 12,
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
        id: 'daily-boundary',
        label: '流日代表口径',
        source: 'project-rule',
        details: `按公历日期 ${representativeDate} 归档，并使用该日早子时作为日期级代表点；晚子时跨日需在流时模块按具体时辰判断。`,
      },
      {
        id: 'daily-lunar-date',
        label: '农历日期',
        source: 'iztro',
        details: `${representativeDate} 对应农历 ${lunar.getYear()} 年${buildLunarMonthLabel(lunar.getMonthInChinese(), isLeapMonth)}${lunar.getDayInChinese()}。`,
      },
      {
        id: 'daily-ganzhi',
        label: '流日干支',
        source: 'iztro',
        details: `早子时代表点的流日干支为 ${horoscope.daily.heavenlyStem}${horoscope.daily.earthlyBranch}。`,
      },
      {
        id: 'daily-life-palace',
        label: '流日命宫',
        source: 'iztro',
        details: `流日命宫落在本命${chart.palaces.find(item => item.branch === flowDayBranch)?.name ?? '未知宫位'}（${BRANCHES[flowDayBranch]}宫）。`,
      },
      {
        id: 'daily-mutagen',
        label: '流日四化',
        source: 'iztro',
        details: transformations.map(item => `${item.starName}化${item.type}`).join('、'),
      },
      {
        id: 'daily-stars',
        label: '流日流曜',
        source: 'iztro',
        details: `已将 ${palaceMappings.reduce((count, item) => count + item.transitStars.length, 0)} 个流日流曜定位到十二宫。`,
      },
      {
        id: 'daily-palace-map',
        label: '流日十二宫映射',
        source: 'iztro',
        details: '将流日十二宫与本命十二宫逐宫对齐，用于日期级专题宫位定位。',
      },
      {
        id: 'daily-related-palaces',
        label: '三方四正',
        source: 'project-rule',
        details: '以流日命宫及其对宫、两个三合宫作为当日结构的首要观察范围。',
      },
    ],
  };
}
