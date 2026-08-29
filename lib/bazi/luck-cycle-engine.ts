import { Solar } from 'lunar-javascript';
import {
  BAZI_LUCK_CYCLE_ENGINE_VERSION,
  BAZI_LUCK_CYCLE_METHODOLOGY,
  BAZI_LUCK_CYCLE_METHODOLOGY_VERSION,
} from './luck-cycle-methodology';
import type {
  BaziLuckCycleDirection,
  BaziLuckCycleItem,
  BaziLuckCycleResult,
  BaziLuckCycleScheduleStatus,
  BaziLuckCycleStartOffset,
  BaziStemPolarity,
} from './luck-cycle-types';
import type { BaziCalculationResult } from './types';

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const YANG_STEMS = new Set(['甲', '丙', '戊', '庚', '壬']);
const JIA_ZI = Array.from({ length: 60 }, (_, index) => `${STEMS[index % 10]}${BRANCHES[index % 12]}`);

interface SolarLike {
  toYmdHms(): string;
  subtractMinute(other: SolarLike): number;
  nextYear(years: number): SolarLike;
}

interface JieLike {
  getName(): string;
  getSolar(): SolarLike;
}

interface DaYunLike {
  getGanZhi(): string;
}

interface YunLike {
  isForward(): boolean;
  getStartYear(): number;
  getStartMonth(): number;
  getStartDay(): number;
  getStartHour(): number;
  getStartSolar(): SolarLike;
  getDaYun(count: number): DaYunLike[];
}

interface EightCharLuckLike {
  getYun(gender: number, sect: number): YunLike;
}

interface LunarLuckLike {
  getEightChar(): EightCharLuckLike;
  getPrevJie(): JieLike;
  getNextJie(): JieLike;
}

export function calculateBaziLuckCycles(chart: BaziCalculationResult): BaziLuckCycleResult {
  const direction = getDirection(chart.pillars.year.stem, chart.input.gender);
  const polarity: BaziStemPolarity = YANG_STEMS.has(chart.pillars.year.stem) ? 'yang' : 'yin';
  const directionStatus = chart.completeness === 'complete'
    ? 'established_from_chart_snapshot' as const
    : 'provisional_from_partial_chart' as const;
  const basis = `${chart.pillars.year.stem}为${polarity === 'yang' ? '阳干' : '阴干'}，${chart.input.gender === 'male' ? '男命' : '女命'}，按“阳男阴女顺、阴男阳女逆”取${direction === 'forward' ? '顺排' : '逆排'}`;
  const sourceChart = {
    methodologyVersion: chart.methodologyVersion,
    engineVersion: chart.engineVersion,
    birthAt: chart.input.birthTime ? `${chart.input.birthDate} ${chart.input.birthTime}` : null,
    timeZoneId: chart.input.timeZoneId,
    timeStandard: chart.input.timeStandard,
    monthPillar: chart.pillars.month.ganZhi,
  };
  const provisionalCycles = buildCycles(chart, direction, null);
  const base = {
    methodologyVersion: BAZI_LUCK_CYCLE_METHODOLOGY_VERSION,
    engineVersion: BAZI_LUCK_CYCLE_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    sourceChart,
    direction: {
      value: direction,
      label: direction === 'forward' ? '顺排' as const : '逆排' as const,
      yearStem: chart.pillars.year.stem,
      yearStemPolarity: polarity,
      gender: chart.input.gender,
      basis,
      status: directionStatus,
    },
  };

  if (!chart.input.birthTime || chart.input.unknownTime) {
    return withheldResult(base, 'withheld_unknown_time', provisionalCycles, [
      '出生时辰未知：顺逆和大运干支序列仅按当前三柱快照暂列，不生成起运间隔、交运日期或公历区间。',
    ]);
  }
  if (!BAZI_LUCK_CYCLE_METHODOLOGY.policy.supportedTimezoneIds.includes(chart.input.timeZoneId as 'Asia/Shanghai')) {
    return withheldResult(base, 'withheld_unsupported_timezone', provisionalCycles, [
      `M9-4 v1 尚未校准 ${chart.input.timeZoneId} 的节气绝对时刻换算，因此不生成精确交运日期。`,
    ]);
  }

  const solar = createCivilSolar(chart.input.birthDate, chart.input.birthTime);
  const lunar = solar.getLunar() as unknown as LunarLuckLike;
  const eightChar = lunar.getEightChar();
  const yun = eightChar.getYun(chart.input.gender === 'male' ? 1 : 0, 2);
  const libraryDirection: BaziLuckCycleDirection = yun.isForward() ? 'forward' : 'backward';
  const officialCycles = yun.getDaYun(BAZI_LUCK_CYCLE_METHODOLOGY.policy.displayedCycles + 1).slice(1);
  const sequenceMatches = officialCycles.every((item, index) => item.getGanZhi() === provisionalCycles[index]?.ganZhi);
  if (libraryDirection !== direction || !sequenceMatches) {
    return withheldResult(base, 'withheld_chart_time_basis_conflict', provisionalCycles, [
      '民用出生时刻计算出的年柱或月柱与已保存命盘时间口径不一致，已撤回精确交运日期；请复核节气边界和地方视太阳时设置。',
    ]);
  }

  const reference = direction === 'forward' ? lunar.getNextJie() : lunar.getPrevJie();
  const referenceSolar = reference.getSolar();
  const elapsedMinutes = direction === 'forward'
    ? referenceSolar.subtractMinute(solar as unknown as SolarLike)
    : (solar as unknown as SolarLike).subtractMinute(referenceSolar);
  if (elapsedMinutes < 0) throw new Error('起运节气时间差不能为负数');
  const startOffset = convertMinutesToStartOffset(elapsedMinutes);
  assertOfficialOffset(yun, startOffset);
  const startSolar = yun.getStartSolar();
  const cycles = buildCycles(chart, direction, startSolar);
  const warnings = [
    '本结果只表示大运排期，不表示任何一步大运的吉凶。',
    '起运时间采用分钟折算法；出生秒数和节气秒数不参与时间差折算。',
  ];
  if (chart.input.timeStandard === 'apparent_solar_time') {
    warnings.push('四柱使用地方视太阳时时，大运间隔仍以民用出生时刻代表实际出生瞬间；若两种口径跨越节界，系统会停止输出精确日期。');
  }

  return {
    ...base,
    status: 'complete',
    capabilities: {
      direction: true, ganZhiSequence: true, exactStartBoundary: true,
      luckInterpretation: false, annualPrediction: false, eventPrediction: false,
    },
    referenceJie: {
      name: reference.getName(),
      relation: direction === 'forward' ? 'next' : 'previous',
      at: referenceSolar.toYmdHms(),
      elapsedMinutes,
    },
    startOffset,
    startAt: startSolar.toYmdHms(),
    cycles,
    rulesApplied: buildRules(direction),
    warnings,
    boundary: '大运只计算顺逆、起运间隔、交运日期和十年干支区间；不解释旺衰变化、喜忌、吉凶或具体事件。',
  };
}

function withheldResult(
  base: Pick<BaziLuckCycleResult, 'methodologyVersion' | 'engineVersion' | 'calculatedAt' | 'sourceChart' | 'direction'>,
  status: Exclude<BaziLuckCycleScheduleStatus, 'complete'>,
  cycles: BaziLuckCycleItem[],
  warnings: string[],
): BaziLuckCycleResult {
  return {
    ...base,
    status,
    capabilities: {
      direction: true, ganZhiSequence: true, exactStartBoundary: false,
      luckInterpretation: false, annualPrediction: false, eventPrediction: false,
    },
    referenceJie: null,
    startOffset: null,
    startAt: null,
    cycles,
    rulesApplied: buildRules(base.direction.value),
    warnings,
    boundary: '当前只保留顺逆依据和基于月柱的暂定干支序列；条件不足时不得补写起运岁数、交运日期或大运吉凶。',
  };
}

function buildRules(direction: BaziLuckCycleDirection): string[] {
  return [
    '以已保存年柱天干阴阳和性别确定顺逆',
    direction === 'forward' ? '顺排取出生后的下一个节' : '逆排取出生前的上一个节',
    '只取十二节，不把中气作为起运边界',
    '按分钟折算：4320 分钟为一年、360 分钟为一月、12 分钟为一日、余 1 分钟为 2 小时',
    '每步大运十年，干支从已保存月柱按顺逆逐位推移',
  ];
}

function getDirection(yearStem: string, gender: BaziCalculationResult['input']['gender']): BaziLuckCycleDirection {
  const yang = YANG_STEMS.has(yearStem);
  return (yang && gender === 'male') || (!yang && gender === 'female') ? 'forward' : 'backward';
}

function buildCycles(
  chart: BaziCalculationResult,
  direction: BaziLuckCycleDirection,
  startSolar: SolarLike | null,
): BaziLuckCycleItem[] {
  const monthIndex = JIA_ZI.indexOf(chart.pillars.month.ganZhi);
  if (monthIndex < 0) throw new Error(`无法识别月柱干支：${chart.pillars.month.ganZhi}`);
  const cycleCount = BAZI_LUCK_CYCLE_METHODOLOGY.policy.displayedCycles;
  const birthYear = Number(chart.input.birthDate.slice(0, 4));
  return Array.from({ length: cycleCount }, (_, index) => {
    const step = index + 1;
    const offset = direction === 'forward' ? step : -step;
    const ganZhi = JIA_ZI[(monthIndex + offset + JIA_ZI.length) % JIA_ZI.length];
    const cycleStart = startSolar?.nextYear(index * 10) ?? null;
    const cycleEnd = startSolar?.nextYear((index + 1) * 10) ?? null;
    const nominalStartYear = cycleStart ? Number(cycleStart.toYmdHms().slice(0, 4)) : null;
    return {
      index: step,
      ganZhi,
      stem: ganZhi[0],
      branch: ganZhi[1],
      startAt: cycleStart?.toYmdHms() ?? null,
      endAtExclusive: cycleEnd?.toYmdHms() ?? null,
      nominalStartYear,
      nominalEndYear: nominalStartYear === null ? null : nominalStartYear + 9,
      nominalStartAge: nominalStartYear === null ? null : nominalStartYear - birthYear + 1,
      nominalEndAge: nominalStartYear === null ? null : nominalStartYear - birthYear + 10,
      entryOffsetLabel: cycleStart ? formatCycleEntry(index, cycleStart) : null,
      scheduleStatus: cycleStart ? 'established' : 'provisional_sequence_only',
    };
  });
}

function formatCycleEntry(index: number, cycleStart: SolarLike): string {
  if (index === 0) return `首运交于 ${cycleStart.toYmdHms()}`;
  return `自首运起第 ${index * 10} 年交入第 ${index + 1} 步：${cycleStart.toYmdHms()}`;
}

export function convertMinutesToStartOffset(totalMinutes: number): BaziLuckCycleStartOffset {
  if (!Number.isInteger(totalMinutes) || totalMinutes < 0) throw new Error('起运时间差必须是非负整数分钟');
  const conversion = BAZI_LUCK_CYCLE_METHODOLOGY.policy.conversionEquivalences;
  let remaining = totalMinutes;
  const years = Math.floor(remaining / conversion.minutesPerYear);
  remaining -= years * conversion.minutesPerYear;
  const months = Math.floor(remaining / conversion.minutesPerMonth);
  remaining -= months * conversion.minutesPerMonth;
  const days = Math.floor(remaining / conversion.minutesPerDay);
  remaining -= days * conversion.minutesPerDay;
  const hours = remaining * conversion.hoursPerRemainingMinute;
  return {
    years, months, days, hours,
    label: `${years}年${months}个月${days}天${hours}小时`,
  };
}

function assertOfficialOffset(yun: YunLike, offset: BaziLuckCycleStartOffset): void {
  const actual = [yun.getStartYear(), yun.getStartMonth(), yun.getStartDay(), yun.getStartHour()];
  const expected = [offset.years, offset.months, offset.days, offset.hours];
  if (actual.some((value, index) => value !== expected[index])) {
    throw new Error('项目起运折算结果与官方历法实现不一致');
  }
}

function createCivilSolar(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);
  return Solar.fromYmdHms(year, month, day, hour, minute, second);
}
