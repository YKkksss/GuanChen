import { Solar } from 'lunar-javascript';
import { calculateBaziLuckCycles } from '@/lib/bazi/luck-cycle-engine';
import { BAZI_LUCK_CYCLE_ENGINE_VERSION, BAZI_LUCK_CYCLE_METHODOLOGY_VERSION } from '@/lib/bazi/luck-cycle-methodology';
import { resolveBaziTenGod } from '@/lib/bazi/dynamic-ten-god-engine';
import { auditBaziRelationNodeSet, type BaziRelationNodeInput } from '@/lib/bazi/relation-audit-engine';
import { BAZI_RELATION_AUDIT_ENGINE_VERSION, BAZI_RELATION_AUDIT_METHODOLOGY_VERSION } from '@/lib/bazi/relation-audit-methodology';
import { BAZI_DYNAMIC_TEN_GOD_ENGINE_VERSION, BAZI_DYNAMIC_TEN_GOD_METHODOLOGY_VERSION } from '@/lib/bazi/dynamic-ten-god-methodology';
import { resolveCivilTimeUtcCandidates } from '@/lib/rectification/time-service';
import type { BaziCalculationResult } from '@/lib/bazi/types';
import { ElectionError } from './error';
import { PERSONAL_BRANCH_CLASHES, PERSONAL_BRANCH_COMBINES, PERSONAL_STEM_COMBINES } from './personal-rules';
import type { PersonalElectionParticipantSnapshot, PersonalElectionSnapshot } from './personal-types';
import { PERSONAL_ELECTION_LUCK_VERSION, type PersonalElectionLuckAssessment, type PersonalElectionLuckLayer, type PersonalElectionLuckRelation, type PersonalElectionLuckSegment, type PersonalElectionLuckSnapshot } from './personal-luck-types';

function wallAt(date: string, second: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + second * 1000).toISOString().slice(0, 19).replace('T', ' ');
}
function lunarAt(at: string) {
  const [y, m, d, h, minute, s] = at.split(/[- :]/).map(Number);
  // 固定版本库提供精确立春接口；项目旧声明尚未覆盖此方法。
  return Solar.fromYmdHms(y, m, d, h, minute, s).getLunar() as ReturnType<ReturnType<typeof Solar.fromYmdHms>['getLunar']> & { getYearInGanZhiExact(): string };
}
/** 起运使用民用出生瞬间；太阳时只沿用原盘，不再次修正用事时间。 */
function supportedBirthClock(chart: BaziCalculationResult, at: string): boolean {
  if (chart.input.timeZoneId !== 'Asia/Shanghai') return false;
  const conversion = chart.effectiveTime.conversion;
  if (conversion && (conversion.selectedUtcOffsetMinutes !== 480 || conversion.localTimeStatus !== 'unique')) return false;
  try {
    const candidates = resolveCivilTimeUtcCandidates({ date: at.slice(0, 10), time: at.slice(11), timeZoneId: chart.input.timeZoneId });
    return candidates.length === 1 && candidates[0].utcOffsetMinutes === 480;
  } catch { return false; }
}
export function buildPersonalElectionLuckSnapshot(chart: BaziCalculationResult): PersonalElectionLuckSnapshot {
  const birthAt = chart.input.birthTime ? `${chart.input.birthDate} ${chart.input.birthTime}` : null;
  const base = { version: PERSONAL_ELECTION_LUCK_VERSION, methodologyVersion: BAZI_LUCK_CYCLE_METHODOLOGY_VERSION, engineVersion: BAZI_LUCK_CYCLE_ENGINE_VERSION, relationVersion: BAZI_RELATION_AUDIT_METHODOLOGY_VERSION,
    relationEngineVersion: BAZI_RELATION_AUDIT_ENGINE_VERSION, tenGodMethodologyVersion: BAZI_DYNAMIC_TEN_GOD_METHODOLOGY_VERSION, tenGodEngineVersion: BAZI_DYNAMIC_TEN_GOD_ENGINE_VERSION,
    birthDate: chart.input.birthDate, birthAt, dayMasterStem: chart.dayMaster.stem, lateZiPolicy: chart.input.lateZiPolicy };
  const first = birthAt ?? `${chart.input.birthDate} 00:00:00`, last = birthAt ?? `${chart.input.birthDate} 23:59:59`;
  if (!supportedBirthClock(chart, first) || !supportedBirthClock(chart, last)) return { ...base, status: 'withheld_unsupported_clock', cycles: [], warnings: ['出生民用时不在本版已校准的固定东八区范围，或历史时差、夏令时及时间歧义待核；不生成精确大运归属。用事流年、节令月仍按北京时间展示。'] };
  const schedule = calculateBaziLuckCycles(chart);
  return { ...base, status: schedule.status === 'withheld_unsupported_timezone' ? 'withheld_unsupported_clock' : schedule.status,
    cycles: schedule.status === 'complete' ? schedule.cycles.map(({ index, ganZhi, startAt, endAtExclusive }) => ({ index, ganZhi, startAt, endAtExclusive })) : [],
    warnings: [...schedule.warnings, ...(chart.input.timeStandard === 'apparent_solar_time' ? ['原局沿用所选真太阳时版本；起运间隔仍按民用出生瞬间计算，用事时间不叠加太阳时修正。'] : [])] };
}

function assertLuckVersion(luck: PersonalElectionLuckSnapshot) {
  if (luck.version !== PERSONAL_ELECTION_LUCK_VERSION || luck.methodologyVersion !== BAZI_LUCK_CYCLE_METHODOLOGY_VERSION || luck.engineVersion !== BAZI_LUCK_CYCLE_ENGINE_VERSION || luck.relationVersion !== BAZI_RELATION_AUDIT_METHODOLOGY_VERSION || luck.relationEngineVersion !== BAZI_RELATION_AUDIT_ENGINE_VERSION || luck.tenGodMethodologyVersion !== BAZI_DYNAMIC_TEN_GOD_METHODOLOGY_VERSION || luck.tenGodEngineVersion !== BAZI_DYNAMIC_TEN_GOD_ENGINE_VERSION) throw new ElectionError('原方案的岁运背景规则版本不同，已存依据仍可回看；新增时段请重新建立方案', 409);
}
/** 秒级日历切点加每位参与者的出生、交运边界，前闭后开。 */
export function personalElectionLuckCuts(snapshot: Pick<PersonalElectionSnapshot, 'participants'>, date: string): number[] {
  const cuts = new Set([0, 86400]);
  const key = (second: number) => { const l = lunarAt(wallAt(date, second)); return `${l.getYearInGanZhiExact()}/${l.getMonthInGanZhiExact()}`; };
  const first = key(0);
  if (first !== key(86399)) {
    let low = 0, high = 86399;
    while (low + 1 < high) { const mid = Math.floor((low + high) / 2); if (key(mid) === first) low = mid; else high = mid; }
    cuts.add(high);
  }
  const start = wallAt(date, 0), end = wallAt(date, 86400);
  for (const person of snapshot.participants) {
    if (!person.luck) throw new ElectionError('原方案未保存岁运背景，请重新建立方案后启用', 409);
    assertLuckVersion(person.luck);
    const luck = person.luck;
    if (luck.status === 'withheld_unsupported_clock') continue;
    for (const at of [luck.birthAt, ...(luck.status === 'complete' ? luck.cycles.flatMap(c => [c.startAt, c.endAtExclusive]) : [])]) {
      if (at && at > start && at < end) cuts.add((Date.parse(at.replace(' ', 'T') + 'Z') - Date.parse(start.replace(' ', 'T') + 'Z')) / 1000);
    }
  }
  return [...cuts].sort((a, b) => a - b);
}
function locateLuck(luck: PersonalElectionLuckSnapshot, at: string): PersonalElectionLuckSegment['luck'] {
  const empty = (kind: PersonalElectionLuckSegment['luck']['kind'], label: string) => ({ kind, label, ganZhi: null, index: null });
  if (luck.status === 'withheld_unsupported_clock') {
    // 来源本地日不能直接与东八区时刻比较；跨区相邻日期保留保守窗口。
    if (at < wallAt(luck.birthDate, -86400)) return empty('pre_birth', '出生前，不套用个人大运');
    if (at < wallAt(luck.birthDate, 172800)) return empty('birth_time_unknown', '出生时区待核，邻近出生日期只展示日历背景');
    return empty('unavailable', '出生时间口径待核，精确大运归属不可用');
  }
  if (at.slice(0, 10) < luck.birthDate || luck.birthAt && at < luck.birthAt) return empty('pre_birth', '出生前，不套用个人大运');
  if (!luck.birthAt && at.slice(0, 10) === luck.birthDate) return empty('birth_time_unknown', '出生当日缺少时刻，出生前后待核');
  if (luck.status === 'withheld_chart_time_basis_conflict') return empty('unavailable', '排盘与时间依据不一致，精确大运归属不可用');
  if (luck.status !== 'complete') return empty('unavailable', '出生时刻不足，精确大运归属不可用');
  const cycle = luck.cycles.find(c => c.startAt && c.endAtExclusive && at >= c.startAt && at < c.endAtExclusive);
  if (cycle) return { kind: 'active', label: `第${cycle.index}步大运 ${cycle.ganZhi}`, ganZhi: cycle.ganZhi, index: cycle.index };
  const first = luck.cycles[0]?.startAt;
  return first && at < first ? empty('pre_luck', '尚未交首步大运') : empty('out_of_range', '超出已保存的八步大运排期，不外推');
}
function eventRelations(target: string, scope: 'day' | 'hour', layer: { label: string; ganZhi: string }): PersonalElectionLuckRelation[] {
  const relations: PersonalElectionLuckRelation[] = [], prefix = `${scope === 'day' ? '用事日' : '用事时'}${target}与${layer.label}${layer.ganZhi}`;
  const pair = (table: string[], a: string, b: string) => a !== b && table.some(p => p.includes(a) && p.includes(b));
  for (const [matched, label] of [
    [pair(PERSONAL_STEM_COMBINES, target[0], layer.ganZhi[0]), '天干五合'],
    [pair(PERSONAL_BRANCH_COMBINES, target[1], layer.ganZhi[1]), '地支六合'],
    [pair(PERSONAL_BRANCH_CLASHES, target[1], layer.ganZhi[1]), '地支六冲'],
    [target[1] === layer.ganZhi[1], '地支相同'],
  ] as const) if (matched) relations.push({ label, detail: `${prefix}存在${label}位置；只列关系，不判合化、冲开、伏吟、吉凶或取消其他关系。` });
  return relations;
}
export function assessPersonalElectionLuck(person: PersonalElectionParticipantSnapshot, date: string, ganZhi: string, scope: 'day' | 'hour', fromSecond = 0, untilSecond = 86400): PersonalElectionLuckAssessment {
  const luck = person.luck;
  if (!luck) throw new ElectionError('缺少保存的岁运背景，请重新建立方案', 409);
  assertLuckVersion(luck);
  const cuts = personalElectionLuckCuts({ participants: [person] }, date).filter(s => s > fromSecond && s < untilSecond);
  const bounds = [fromSecond, ...cuts, untilSecond];
  const segments = bounds.slice(0, -1).map((start, i) => {
    const startAt = wallAt(date, start), l = lunarAt(startAt), currentLuck = locateLuck(luck, startAt);
    const layerInputs: Array<{ key: PersonalElectionLuckLayer['key']; label: string; ganZhi: string }> = [
      ...(currentLuck.ganZhi ? [{ key: 'luck_cycle' as const, label: '大运', ganZhi: currentLuck.ganZhi }] : []),
      { key: 'annual', label: '立春流年', ganZhi: l.getYearInGanZhiExact() }, { key: 'month', label: '节令流月', ganZhi: l.getMonthInGanZhiExact() },
    ];
    const beforeBirth = currentLuck.kind === 'pre_birth' || currentLuck.kind === 'birth_time_unknown';
    const layers = layerInputs.map(layer => ({ ...layer, tenGod: resolveBaziTenGod(luck.dayMasterStem, layer.ganZhi[0]), eventRelations: beforeBirth ? [] : eventRelations(ganZhi, scope, layer) }));
    const nodes: BaziRelationNodeInput[] = [
      ...person.pillars.map(p => ({ id: `natal-${p.key}`, layer: 'natal' as const, label: `原局${p.label}`, ganZhi: `${p.stem}${p.branch}`, pillarKey: p.key })),
      ...layers.map(layer => ({ id: layer.key, layer: layer.key, label: layer.label, ganZhi: layer.ganZhi })),
    ];
    // 用事时没有冒充流日节点；日时与背景的两柱关系在各层单列。
    const backgroundRelations = beforeBirth ? [] : auditBaziRelationNodeSet({ nodes, year: Number(date.slice(0, 4)), segmentIndex: i })
      .filter(e => !['stem_same_element', 'stem_generate', 'stem_control'].includes(e.type))
      .map(e => ({ label: e.label, detail: `${e.participants.map(p => `${p.label}${p.symbol}`).join('、')}：${e.detail}` }));
    return { startAt, endAtExclusive: wallAt(date, bounds[i + 1]), luck: currentLuck, layers, backgroundRelations };
  });
  return { version: PERSONAL_ELECTION_LUCK_VERSION, timezone: 'UTC+08:00', targetTenGod: resolveBaziTenGod(luck.dayMasterStem, ganZhi[0]), segments, warnings: luck.warnings,
    boundary: `流年以立春、流月以节交接秒切换，大运以保存排期交接；区间前闭后开。原盘晚子${luck.lateZiPolicy === 'next_day' ? '次日' : '当日'}；此处用事日仍按本公历日，时干支沿用黄历时规则，未冒充原盘流日。出生前及出生时刻未定的当日只展示日历干支和形式角色，不作个人适用判断。十神仅为表干相对本命日主的角色，关系不等于有力、引动或吉凶，不自动参与排除，也不改变原局取用和黄历状态。` };
}
