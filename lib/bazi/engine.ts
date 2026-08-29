import { Solar } from 'lunar-javascript';
import { convertCivilTimeToApparentSolar } from '@/lib/rectification/time-service';
import { BAZI_ENGINE_VERSION, BAZI_METHODOLOGY, BAZI_METHODOLOGY_VERSION } from './methodology';
import { BAZI_ELEMENTS } from './types';
import type {
  BaziCalculationInput,
  BaziCalculationResult,
  BaziElement,
  BaziElementCount,
  BaziLateZiPolicy,
  BaziPillar,
  BaziPillarKey,
  BaziTimeStandard,
} from './types';

const STEM_ELEMENTS: Record<string, BaziElement> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};
const BRANCH_ELEMENTS: Record<string, BaziElement> = {
  子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水',
};
const PILLAR_LABELS: Record<BaziPillarKey, string> = { year: '年柱', month: '月柱', day: '日柱', time: '时柱' };

interface EightCharLike {
  setSect(sect: number): void;
  getYear(): string; getYearGan(): string; getYearZhi(): string; getYearHideGan(): string[];
  getYearShiShenGan(): string; getYearShiShenZhi(): string[]; getYearNaYin(): string; getYearDiShi(): string; getYearXunKong(): string;
  getMonth(): string; getMonthGan(): string; getMonthZhi(): string; getMonthHideGan(): string[];
  getMonthShiShenGan(): string; getMonthShiShenZhi(): string[]; getMonthNaYin(): string; getMonthDiShi(): string; getMonthXunKong(): string;
  getDay(): string; getDayGan(): string; getDayZhi(): string; getDayHideGan(): string[];
  getDayShiShenGan(): string; getDayShiShenZhi(): string[]; getDayNaYin(): string; getDayDiShi(): string; getDayXunKong(): string;
  getTime(): string; getTimeGan(): string; getTimeZhi(): string; getTimeHideGan(): string[];
  getTimeShiShenGan(): string; getTimeShiShenZhi(): string[]; getTimeNaYin(): string; getTimeDiShi(): string; getTimeXunKong(): string;
}

interface LunarLike {
  getEightChar(): EightCharLike;
  getYearInChinese(): string;
  getMonthInChinese(): string;
  getDayInChinese(): string;
  getJieQi(): string;
}

export function calculateBazi(rawInput: BaziCalculationInput): BaziCalculationResult {
  const input = normalizeInput(rawInput);
  const warnings: string[] = [];
  let effectiveDate = input.birthDate;
  let effectiveTime = input.birthTime ?? '12:00:00';
  let conversion: BaziCalculationResult['effectiveTime']['conversion'] = null;

  if (input.timeStandard === 'apparent_solar_time') {
    if (input.longitude === null) throw new Error('选择地方视太阳时后必须提供出生地经度');
    conversion = convertCivilTimeToApparentSolar({
      date: input.birthDate,
      time: input.birthTime ?? '12:00:00',
      timeZoneId: input.timeZoneId,
      longitude: input.longitude,
    });
    effectiveDate = conversion.apparentSolarDate;
    effectiveTime = conversion.apparentSolarTime;
    warnings.push(...conversion.warnings);
    if (conversion.dayOffset !== 0) warnings.push('真太阳时换算跨越了民用日期，四柱已按换算后的日期计算。');
  }

  const [year, month, day] = effectiveDate.split('-').map(Number);
  const [hour, minute, second] = effectiveTime.split(':').map(Number);
  const solar = Solar.fromYmdHms(year, month, day, hour, minute, second);
  const lunar = solar.getLunar() as unknown as LunarLike;
  const eightChar = lunar.getEightChar();
  eightChar.setSect(input.lateZiPolicy === 'next_day' ? 1 : 2);

  const pillars = {
    year: buildPillar('year', eightChar),
    month: buildPillar('month', eightChar),
    day: buildPillar('day', eightChar),
    time: input.unknownTime ? null : buildPillar('time', eightChar),
  };
  const solarTerm = lunar.getJieQi() || null;
  if (solarTerm) warnings.push(`出生日期处于“${solarTerm}”节气日，年柱或月柱已按交节精确时刻计算。`);
  if (input.unknownTime) {
    warnings.push('出生时辰未知：本结果不生成时柱；若实际出生在节气交接或 23 点附近，年、月或日柱也可能随时刻变化。');
  }
  if (!input.unknownTime && effectiveTime.startsWith('23:')) {
    warnings.push(`当前时刻属于晚子时，日柱采用“${input.lateZiPolicy === 'next_day' ? '23 点起按次日' : '23 点仍按当天'}”规则。`);
  }

  const rulesApplied = [
    '公历出生日期输入',
    '年柱以立春精确时刻为界',
    '月柱以交节精确时刻为界',
    input.timeStandard === 'apparent_solar_time' ? '民用时间换算为地方视太阳时' : '直接使用出生地民用时间',
    input.lateZiPolicy === 'next_day' ? '晚子时日柱按次日' : '晚子时日柱按当天',
    input.unknownTime ? '未知时辰省略时柱' : '按有效时刻生成时柱',
  ];

  return {
    methodologyVersion: BAZI_METHODOLOGY_VERSION,
    engineVersion: BAZI_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    input,
    effectiveTime: { date: effectiveDate, time: effectiveTime, standard: input.timeStandard, conversion },
    calendar: {
      solar: `${effectiveDate} ${effectiveTime}`,
      lunar: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
      solarTerm,
    },
    dayMaster: { stem: pillars.day.stem, element: pillars.day.stemElement },
    pillars,
    elementCounts: countElements(Object.values(pillars).filter((pillar): pillar is BaziPillar => pillar !== null)),
    completeness: input.unknownTime ? 'partial_unknown_time' : 'complete',
    rulesApplied,
    warnings,
  };
}

function normalizeInput(raw: BaziCalculationInput): BaziCalculationResult['input'] {
  const policy = BAZI_METHODOLOGY.calculationPolicy;
  const birthDate = normalizeDate(raw.birthDate);
  const unknownTime = raw.unknownTime === true;
  const birthTime = unknownTime ? null : normalizeTime(raw.birthTime ?? '');
  const timeStandard: BaziTimeStandard = raw.timeStandard ?? policy.defaultTimeStandard;
  const lateZiPolicy: BaziLateZiPolicy = raw.lateZiPolicy ?? policy.defaultLateZiPolicy;
  if (!policy.supportedTimeStandards.includes(timeStandard)) throw new Error('不支持的时间标准');
  if (!policy.supportedLateZiPolicies.includes(lateZiPolicy)) throw new Error('不支持的晚子时规则');
  if (raw.gender !== 'male' && raw.gender !== 'female') throw new Error('性别必须为 male 或 female');
  const longitude = raw.longitude === undefined || raw.longitude === null ? null : Number(raw.longitude);
  if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
    throw new Error('出生地经度必须在 -180 到 180 之间');
  }
  return {
    birthDate,
    birthTime,
    gender: raw.gender,
    timeZoneId: raw.timeZoneId?.trim() || 'Asia/Shanghai',
    longitude,
    timeStandard,
    lateZiPolicy,
    unknownTime,
  };
}

function normalizeDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!match) throw new Error('出生日期必须使用 YYYY-MM-DD 格式');
  const [year, month, day] = match.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (year < 1900 || year > 2100 || check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) {
    throw new Error('出生日期无效，支持范围为 1900-2100 年');
  }
  return value;
}

function normalizeTime(value: string): string {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value ?? '');
  if (!match) throw new Error('出生时间必须使用 HH:mm 或 HH:mm:ss 格式');
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new Error('出生时间无效');
  return `${match[1]}:${match[2]}:${String(second).padStart(2, '0')}`;
}

function buildPillar(key: BaziPillarKey, eightChar: EightCharLike): BaziPillar {
  const title = key[0].toUpperCase() + key.slice(1);
  const getter = <T>(suffix: string): T => (eightChar as unknown as Record<string, () => T>)[`get${title}${suffix}`]();
  const stem = getter<string>('Gan');
  const branch = getter<string>('Zhi');
  const hiddenStems = getter<string[]>('HideGan');
  const hiddenTenGods = getter<string[]>('ShiShenZhi');
  return {
    key,
    label: PILLAR_LABELS[key],
    ganZhi: getter<string>(''),
    stem,
    branch,
    stemElement: requireElement(STEM_ELEMENTS[stem], `未知天干：${stem}`),
    branchElement: requireElement(BRANCH_ELEMENTS[branch], `未知地支：${branch}`),
    stemTenGod: getter<string>('ShiShenGan'),
    hiddenStems: hiddenStems.map((hiddenStem, index) => ({
      stem: hiddenStem,
      element: requireElement(STEM_ELEMENTS[hiddenStem], `未知藏干：${hiddenStem}`),
      tenGod: hiddenTenGods[index],
    })),
    naYin: getter<string>('NaYin'),
    growthStage: getter<string>('DiShi'),
    xunKong: getter<string>('XunKong'),
  };
}

function countElements(pillars: BaziPillar[]): BaziElementCount[] {
  return BAZI_ELEMENTS.map(element => ({
    element,
    surface: pillars.reduce((count, pillar) => count + Number(pillar.stemElement === element) + Number(pillar.branchElement === element), 0),
    hiddenStems: pillars.reduce((count, pillar) => count + pillar.hiddenStems.filter(item => item.element === element).length, 0),
  }));
}

function requireElement(element: BaziElement | undefined, message: string): BaziElement {
  if (!element) throw new Error(message);
  return element;
}
