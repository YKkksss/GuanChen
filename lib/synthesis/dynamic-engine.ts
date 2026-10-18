import { Solar } from 'lunar-javascript';
import * as LunarModule from 'lunar-javascript';
import { calculateBaziLuckCycles } from '@/lib/bazi/luck-cycle-engine';
import { resolveBaziTenGod } from '@/lib/bazi/dynamic-ten-god-engine';
import type { BaziCalculationResult } from '@/lib/bazi/types';
import { validateCalendarDate } from '@/lib/fortune-calendar/dates';
import { buildAnnualTransitSnapshotAtDate, buildMonthlyTransitSnapshotAtDate } from '@/lib/transits/engine';
import type { AnnualTransitSnapshot, MonthlyTransitSnapshot } from '@/lib/transits/types';
import { BRANCHES } from '@/lib/ziwei/constants';
import { SYNTHESIS_TOPICS, type SynthesisEvidence, type SynthesisFacts } from './types';
import { buildSynthesisDynamicReview, buildSynthesisDynamicReviewEvidence } from './dynamic-review-engine';
import {
  SYNTHESIS_DYNAMIC_VERSION,
  type SynthesisDynamicFacts,
  type SynthesisDynamicPillar,
  type SynthesisDynamicSelection,
  type SynthesisDynamicStage,
} from './dynamic-types';

interface SolarBoundary { toYmdHms(): string }
interface JieBoundary { getName(): string; getSolar(): SolarBoundary }
interface ObservationLunar {
  getYearInGanZhiExact(): string;
  getMonthInGanZhiExact(): string;
  getJieQiTable(): Record<string, SolarBoundary>;
  getPrevJie(wholeDay: boolean): JieBoundary;
  getNextJie(wholeDay: boolean): JieBoundary;
}

const HIDDEN_STEMS = (LunarModule as unknown as {
  LunarUtil: { ZHI_HIDE_GAN: Record<string, string[]> };
}).LunarUtil.ZHI_HIDE_GAN;

/** 只接收北京时间墙钟，不将浏览器时区或带偏移的时刻混入合参。 */
export function normalizeDynamicSelection(raw: unknown): SynthesisDynamicSelection {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('请提交有效的动态合参观察条件');
  const value = raw as Record<string, unknown>;
  if (!Object.hasOwn(value, 'level') || !Object.hasOwn(value, 'dateTime')) throw new Error('请明确填写观察层级和时刻');
  if (value.level !== 'year' && value.level !== 'month') throw new Error('观察层级只能选择流年或流月');
  if (typeof value.dateTime !== 'string') throw new Error('请填写观察日期与时刻');
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.dateTime);
  if (!match) throw new Error('观察时刻必须使用 YYYY-MM-DDTHH:mm:ss 格式，不附加时区');
  validateCalendarDate(match[1]);
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4] ?? 0) > 59) throw new Error('观察时刻不存在');
  return { level: value.level, dateTime: `${match[1]}T${match[2]}:${match[3]}:${match[4] ?? '00'}` };
}

/** 出生边界取民用出生瞬间与紫微有效出生日期中较晚者。 */
export function resolveDynamicRange(base: SynthesisFacts): SynthesisDynamicStage['range'] {
  const input = base.bazi.chart.input;
  const civilBirth = `${input.birthDate}T${input.birthTime ?? '00:00:00'}`;
  const ziweiBirth = `${base.policy.ziweiDate}T00:00:00`;
  return {
    minDateTime: civilBirth > ziweiBirth ? civilBirth : ziweiBirth,
    maxDateTime: `${Math.min(Number(input.birthDate.slice(0, 4)) + 130, 2200)}-12-31T23:59:59`,
  };
}

export function buildDynamicSynthesisFacts(base: SynthesisFacts, raw: unknown): SynthesisDynamicFacts {
  const selection = normalizeDynamicSelection(raw);
  const range = resolveDynamicRange(base);
  if (selection.dateTime < range.minDateTime || selection.dateTime > range.maxDateTime) {
    throw new Error(`观察时刻必须在 ${range.minDateTime.replace('T', ' ')} 至 ${range.maxDateTime.replace('T', ' ')} 之间`);
  }
  const targetDate = selection.dateTime.slice(0, 10);
  const at = selection.dateTime.replace('T', ' ');
  const lunar = lunarAt(at);
  const year = resolveYearPillar(lunar, at);
  const month = selection.level === 'month' ? resolveMonthPillar(lunar) : null;
  const annual = buildAnnualTransitSnapshotAtDate(base.ziwei, targetDate);
  const monthly = selection.level === 'month' ? buildMonthlyTransitSnapshotAtDate(base.ziwei, targetDate) : null;
  const luck = resolveLuck(base.bazi.chart, at);
  const roles: SynthesisDynamicStage['bazi']['roles'] = [];
  if (luck.cycle) roles.push(buildRole('luck', `第 ${luck.cycle.index} 步大运`, luck.cycle.ganZhi, base.bazi.chart.dayMaster.stem));
  roles.push(buildRole('year', '八字流年', year.ganZhi, base.bazi.chart.dayMaster.stem));
  if (month) roles.push(buildRole('month', '八字流月', month.ganZhi, base.bazi.chart.dayMaster.stem));

  const boundaries = [
    '观察时刻统一为北京时间固定 UTC+08:00；不随浏览器时区转换，不重新换算出生太阳时。',
    '紫微流年按农历年、虚岁定位大限或童限；八字流年按精确立春时刻定位，两者年标签可以不同。',
    '紫微宫位、星曜、四化与八字干支、十神分别解释，不能一一替换；共同观察不构成独立事实互证。',
    '八字排期采用前闭后开区间；交节或交运时刻起进入新片段，不把整个公历年或月份视为同一状态。',
    '大运只保留既有排期器的八步结果，首运前、条件不足与末步之后分别显示，不延伸或补造大运。',
    '十神仅是动态天干和藏干相对本命日主的角色，藏干出现不表示透出、引动、合化或实际效力。',
    '本轮只展示岁运结构和可引用条件，不新增动态旺衰、喜忌、格局成败、吉凶评分或具体事件预测。',
    ...(monthly ? ['紫微流月按观察日定位，展示所属农历月并依 iztro 处理闰月后半月；八字流月按十二节的精确时刻定位，农历初一不等于节界。'] : []),
    ...(base.bazi.chart.input.timeZoneId === 'Etc/GMT-8' ? ['起运间隔以原始标准时及固定 UTC+08:00 节气时刻计算，不套用历史上海偏移或夏令时；太阳时四柱与标准时排期冲突时，保留精确归属撤回状态。'] : []),
    ...(base.policy.unknownTime || base.bazi.chart.input.unknownTime ? [
      '出生时辰未知：紫微沿用子时试排，八字缺少时柱及精确起运；观察年、月日历可定位，不等于本命与岁运条件已完整。',
      ...(targetDate === base.bazi.chart.input.birthDate ? ['观察日为出生当日，真实出生时刻未知，不能确认该时刻已在出生之后。'] : []),
    ] : []),
  ];
  const dynamic: SynthesisDynamicStage = {
    version: SYNTHESIS_DYNAMIC_VERSION,
    key: `${SYNTHESIS_DYNAMIC_VERSION}:${selection.level}:${selection.dateTime}`,
    selection,
    label: `${selection.level === 'year' ? '流年' : '流月'}观察 · ${selection.dateTime.replace('T', ' ')}`,
    timezoneLabel: '北京时间固定 UTC+08:00',
    range,
    ziwei: { annual, monthly },
    bazi: { year, month, luck, roles },
    boundaries,
  };
  dynamic.review = buildSynthesisDynamicReview(base, dynamic);
  const evidence = base.evidence.filter(item => !item.id.startsWith('ziwei:dynamic:') && !item.id.startsWith('bazi:dynamic:'));
  evidence.push(...buildSynthesisDynamicReviewEvidence(dynamic.review), ...buildDynamicEvidence(base, dynamic));
  return { ...base, evidence, dynamic };
}

function lunarAt(at: string): ObservationLunar {
  const [date, time] = at.split(' ');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);
  return Solar.fromYmdHms(year, month, day, hour, minute, second).getLunar() as unknown as ObservationLunar;
}

function liChunAt(year: number): string {
  const boundary = lunarAt(`${year}-07-01 12:00:00`).getJieQiTable()['立春'];
  if (!boundary) throw new Error(`无法定位 ${year} 年立春时刻`);
  return boundary.toYmdHms();
}

function resolveYearPillar(lunar: ObservationLunar, at: string): SynthesisDynamicPillar {
  const civilYear = Number(at.slice(0, 4));
  const first = liChunAt(civilYear);
  const year = at < first ? civilYear - 1 : civilYear;
  return { ganZhi: lunar.getYearInGanZhiExact(), startAt: year === civilYear ? first : liChunAt(year), endAtExclusive: year === civilYear ? liChunAt(year + 1) : first };
}

function resolveMonthPillar(lunar: ObservationLunar): SynthesisDynamicPillar {
  return {
    ganZhi: lunar.getMonthInGanZhiExact(),
    startAt: lunar.getPrevJie(false).getSolar().toYmdHms(),
    endAtExclusive: lunar.getNextJie(false).getSolar().toYmdHms(),
  };
}

function resolveLuck(chart: BaziCalculationResult, at: string): SynthesisDynamicStage['bazi']['luck'] {
  // 既有排期器直接使用固定东八区墙钟；此处只适配能力标签，不转换或修改出生资料。
  const schedulingChart = chart.input.timeZoneId === 'Etc/GMT-8'
    ? { ...chart, input: { ...chart.input, timeZoneId: 'Asia/Shanghai' } }
    : chart;
  const result = calculateBaziLuckCycles(schedulingChart);
  const shared = { startAt: result.startAt, direction: result.direction.label, methodologyVersion: result.methodologyVersion, engineVersion: result.engineVersion };
  if (result.status !== 'complete') return { ...shared, status: 'unavailable', cycle: null, reason: result.warnings.join('；') };
  if (result.startAt && at < result.startAt) return { ...shared, status: 'pre_luck', cycle: null, reason: `尚未交入首运，首运交接为 ${result.startAt}；不提前套用第一步大运。` };
  const cycle = result.cycles.find(item => item.startAt && item.endAtExclusive && item.startAt <= at && at < item.endAtExclusive) ?? null;
  return cycle
    ? { ...shared, status: 'active', cycle, reason: `按精确交运区间定位第 ${cycle.index} 步 ${cycle.ganZhi} 大运，不表示该运吉凶。` }
    : { ...shared, status: 'unavailable', cycle: null, reason: '观察时刻超出当前八步大运排期，保留年、月日历，不推算第九步或循环套用已有大运。' };
}

function buildRole(key: 'luck' | 'year' | 'month', label: string, ganZhi: string, dayMaster: string): SynthesisDynamicStage['bazi']['roles'][number] {
  return {
    key, label, ganZhi,
    stemTenGod: resolveBaziTenGod(dayMaster, ganZhi[0]),
    hiddenStems: (HIDDEN_STEMS[ganZhi[1]] ?? []).map(stem => ({ stem, tenGod: resolveBaziTenGod(dayMaster, stem) })),
  };
}

function buildDynamicEvidence(base: SynthesisFacts, stage: SynthesisDynamicStage): SynthesisEvidence[] {
  const { annual, monthly } = stage.ziwei;
  const { year, month, luck, roles } = stage.bazi;
  const evidence: SynthesisEvidence[] = [
    { id: 'ziwei:dynamic:observation', label: '紫微动态观察口径', system: 'ziwei', details: `观察 ${stage.selection.dateTime.replace('T', ' ')}，固定 UTC+08:00；紫微按该公历日期的农历年、月结构定位，本轮不计算流时。${base.policy.unknownTime ? '本命出生时辰未知，仅为子时试排，动态宫位同样有条件不确定性。' : ''}` },
    { id: 'ziwei:dynamic:year', label: '紫微流年命宫与四化', system: 'ziwei', details: `农历 ${annual.lunarDate}；流年 ${annual.year.ganZhi}；流年命宫在本命${annual.flowYear.nativePalaceName}（${palaceBranch(annual.flowYear.palaceBranch)}）；${transformationText(annual.transformations)}。` },
    { id: 'ziwei:dynamic:decadal', label: '紫微大限或童限背景', system: 'ziwei', details: decadalText(annual) },
    { id: 'bazi:dynamic:observation', label: '八字动态观察口径', system: 'bazi', details: `观察 ${stage.selection.dateTime.replace('T', ' ')}，固定 UTC+08:00。流年取精确立春、流月取十二节交接的前闭后开区间；不重算本命，不叠加出生太阳时修正。${base.policy.unknownTime ? '本命时柱未知，年、月日历定位不能补足出生与起运条件。' : ''}` },
    { id: 'bazi:dynamic:year', label: '八字立春流年', system: 'bazi', details: `${year.ganZhi}流年，区间［${year.startAt}，${year.endAtExclusive}），固定 UTC+08:00。` },
    { id: 'bazi:dynamic:luck', label: '八字大运归属', system: 'bazi', details: `${luck.direction}；${luck.reason}${luck.cycle ? `区间［${luck.cycle.startAt}，${luck.cycle.endAtExclusive}）。` : ''}大运与紫微大限不是同一个区间，不强求同时交接。` },
    { id: 'bazi:dynamic:roles', label: '动态十神角色与藏干', system: 'bazi', details: roles.map(role => `${role.label}${role.ganZhi}：天干${role.ganZhi[0]}为${role.stemTenGod}，地支藏干${role.hiddenStems.map(item => `${item.stem}${item.tenGod}`).join('、') || '未记录'}`).join('；') + '。均以本命日主为参照，角色位置不等于实际效力或具体人物。' },
  ];
  if (monthly) evidence.push({ id: 'ziwei:dynamic:month', label: '紫微观察日流月', system: 'ziwei', details: `观察日 ${monthly.representativeDate}，所属农历 ${monthly.lunarMonth.year} 年${monthly.lunarMonth.label}（${monthly.lunarMonth.startDate} 至 ${monthly.lunarMonth.endDate}）；流月 ${monthly.flowMonth.ganZhi}；流月命宫落本命${monthly.flowMonth.nativePalaceName}（${palaceBranch(monthly.flowMonth.palaceBranch)}）；${transformationText(monthly.transformations)}。闰月后半月按 iztro 规则定位，不把初一结构套用于整月。` });
  if (month) evidence.push({ id: 'bazi:dynamic:month', label: '八字节令流月', system: 'bazi', details: `${month.ganZhi}流月，区间［${month.startAt}，${month.endAtExclusive}），固定 UTC+08:00；按节界交接，不按农历初一换月。` });
  addTopicEvidence(evidence, base, annual, 'year');
  if (monthly) addTopicEvidence(evidence, base, monthly, 'month');
  return evidence;
}

function decadalText(annual: AnnualTransitSnapshot): string {
  const stage = annual.decadal;
  if (stage.periodKind === 'childhood') return `虚岁 ${annual.nominalAge}，处于童限，当前落本命${stage.nativePalaceName}（${palaceBranch(stage.palaceBranch)}）；不是正式十年大限。`;
  if (stage.periodKind !== 'decadal') return `虚岁 ${annual.nominalAge}，当前超出已排紫微大限，不补造大限宫位或年龄区间。`;
  return `虚岁 ${annual.nominalAge}，${stage.startAge} 至 ${stage.endAge} 岁大限，落本命${stage.nativePalaceName}（${palaceBranch(stage.palaceBranch)}），宫干支 ${stage.heavenlyStem}${stage.earthlyBranch}。`;
}

function transformationText(transformations: AnnualTransitSnapshot['transformations']): string {
  return transformations.map(item => `${item.starName}化${item.type}落${item.natalPalaceName ? `本命${item.natalPalaceName}` : '未定位本命宫'}`).join('、');
}

function palaceBranch(branch: number): string { return BRANCHES[branch] ?? '未定位'; }

function addTopicEvidence(evidence: SynthesisEvidence[], base: SynthesisFacts, snapshot: AnnualTransitSnapshot | MonthlyTransitSnapshot, level: 'year' | 'month'): void {
  for (const name of SYNTHESIS_TOPICS[base.topic].palaces) {
    const mapping = snapshot.palaceMappings.find(item => item.transitPalaceName.replace(/宫$/, '') === name.replace(/宫$/, ''));
    if (!mapping) continue;
    const related = [mapping.branch, (mapping.branch + 6) % 12, (mapping.branch + 4) % 12, (mapping.branch + 8) % 12];
    evidence.push({
      id: `ziwei:dynamic:${level}:topic:${name}`,
      label: `${level === 'year' ? '流年' : '流月'}${name}及三方四正`,
      system: 'ziwei',
      details: `${snapshot.representativeDate} 观察：${level === 'year' ? '流年' : '流月'}${name}落本命${mapping.nativePalaceName}（${palaceBranch(mapping.branch)}），流曜${mapping.transitStars.join('、') || '无记录'}；三方四正为${related.map(branch => `本命${base.ziwei.palaces.find(item => item.branch === branch)?.name ?? '未定位'}（${palaceBranch(branch)}）`).join('、')}。这是同主题宫位的实际映射，不代表事件结论。`,
    });
  }
}
