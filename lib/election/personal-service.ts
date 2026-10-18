import { getBaziBirthProfile, getBaziChartVersion } from '@/lib/db/bazi';
import { getDatabase } from '@/lib/db/client';
import { BAZI_PILLAR_KEYS } from '@/lib/bazi/types';
import { analyzeBaziClimate } from '@/lib/bazi/reading-engine';
import { BAZI_READING_METHODOLOGY_VERSION } from '@/lib/bazi/climate-rules';
import { calculateElection, normalizeElectionInput } from './engine';
import { calculateElectionHours } from './hours';
import { ElectionError } from './error';
import { assessPersonalElection } from './personal-engine';
import { assessPersonalElectionLuck, buildPersonalElectionLuckSnapshot, personalElectionLuckCuts } from './personal-luck-engine';
import { PERSONAL_ELECTION_LUCK_HOURS_VERSION } from './personal-luck-types';
import { PERSONAL_ELECTION_SOURCE } from './personal-rules';
import { PERSONAL_ELECTION_LEGACY_VERSION, PERSONAL_ELECTION_VERSION, type PersonalElectionAssessment, type PersonalElectionChartOption, type PersonalElectionInput, type PersonalElectionSnapshot } from './personal-types';
import type { ElectionStatus } from './types';

function policy(chart: NonNullable<ReturnType<typeof getBaziChartVersion>>) {
  return `${chart.timeStandard === 'apparent_solar_time' ? '真太阳时' : '当地标准时'} · 晚子${chart.lateZiPolicy === 'next_day' ? '次日' : '当日'} · ${chart.inputSnapshot.timeZoneId}`;
}
/** 只从账号作用域数据库读取，选项不包含出生地点、备注等无关资料。 */
export function listPersonalElectionCharts(): PersonalElectionChartOption[] {
  const rows = getDatabase().prepare('SELECT c.id, p.id AS profileId, p.display_name AS displayName FROM bazi_chart_versions c JOIN bazi_birth_profiles p ON p.id=c.birth_profile_id ORDER BY c.created_at DESC, c.id LIMIT 200').all() as {id:string;profileId:string;displayName:string}[];
  return rows.map(row => {
    const chart = getBaziChartVersion(row.id)!;
    return {chartId:chart.id,profileId:row.profileId,displayName:row.displayName,createdAt:chart.createdAt,pillars:BAZI_PILLAR_KEYS.map(k => chart.result.pillars[k]?.ganZhi ?? '时辰未知').join(' '),unknownTime:chart.result.completeness !== 'complete',policyLabel:policy(chart)};
  });
}
export function resolvePersonalElectionSnapshot(input: PersonalElectionInput): PersonalElectionSnapshot {
  const participants = input.participants.map(p => {
    const chart = getBaziChartVersion(p.chartId);
    if (!chart) throw new ElectionError('所选八字版本不存在或已移除，请在当前账号重新选择',404);
    const profile = getBaziBirthProfile(chart.birthProfileId);
    if (!profile) throw new ElectionError('所选八字版本不存在或已移除，请在当前账号重新选择',404);
    const climate = analyzeBaziClimate(chart.result);
    return {...p,profileId:profile.id,displayName:profile.displayName,chartFingerprint:chart.chartFingerprint,chartMethodologyVersion:chart.methodologyVersion,chartEngineVersion:chart.engineVersion,
      pillars:BAZI_PILLAR_KEYS.flatMap(key => {const pillar=chart.result.pillars[key];return pillar ? [{key,label:pillar.label,stem:pillar.stem,branch:pillar.branch}] : [];}),
      unknownTime:chart.result.completeness !== 'complete',policyLabel:policy(chart),
      climateReference:{version:BAZI_READING_METHODOLOGY_VERSION,label:climate.rule.label,scope:climate.rule.scope,detail:`${climate.rule.rationale} ${climate.boundary}`},
      ...(input.includeLuckContext ? {luck:buildPersonalElectionLuckSnapshot(chart.result)} : {})};
  });
  if (new Set(participants.map(p => p.profileId)).size !== participants.length) throw new ElectionError('同一出生档案的不同版本不能作为两位参与者');
  return {version:PERSONAL_ELECTION_VERSION,source:PERSONAL_ELECTION_SOURCE,input,participants};
}
function combine(status: ElectionStatus, reasons: string[], personalReasons: string[]) {
  return {baseStatus:status,status:personalReasons.length && status !== 'avoid' && status !== 'excluded' ? 'excluded' as const : status,reasons:[...reasons,...personalReasons]};
}
function withLuck(assessment: PersonalElectionAssessment, snapshot: PersonalElectionSnapshot, date: string, from = 0, until = 86400): PersonalElectionAssessment {
  if (!snapshot.input.includeLuckContext) return assessment;
  return {...assessment,participants:assessment.participants.map(person => {
    const saved = snapshot.participants.find(p => p.chartId === person.chartId);
    if (!saved) throw new ElectionError('保存的参与者依据不完整，请重新建立方案',409);
    return {...person,luck:assessPersonalElectionLuck(saved,date,assessment.targetGanZhi,assessment.scope,from,until)};
  })};
}
export function calculatePersonalElection(raw: unknown) {
  const input = normalizeElectionInput(raw), {personal:conditions,...baseInput} = input, result = calculateElection(baseInput);
  if (!conditions) return result;
  const personal = resolvePersonalElectionSnapshot(conditions);
  const days = result.days.map(day => {const assessment=withLuck(assessPersonalElection(personal,day.dayGanZhi,'day'),personal,day.date);return {...day,...combine(day.status,day.reasons,assessment.reasons),personal:assessment};});
  const counts = {candidate:0,review:0,avoid:0,unlisted:0,excluded:0}; days.forEach(day => counts[day.status]++);
  return {...result,input,personal,days,counts,warnings:[...result.warnings.filter(w => !w.includes('尚不提供真太阳时') && !w.includes('日冲生肖只按')),
    '个人条件使用已保存八字的实际四柱；用事日期和时辰按北京时间。未进行完整八字用神、专门择日流派或双方命局吉凶裁决。',
    '五合、六合、六冲、同支与完整三合齐支只记录位置，不自动判合化、成局或升级候选。年支、日支避冲及人工日干时干五行仅在明确勾选后排除。',
    '调候月令参考未自动作为喜用或忌神。人工五行必须自行填写依据，只比较用事日干、时干，不代表整日整时的整体五行。',
    ...(conditions.includeLuckContext ? ['岁运背景逐人按实际交接秒拆段，只展示大运、立春流年、节令流月及结构关系；十神按本命日主定位，未把背景关系作为最终旺衰、喜忌、成败或额外排除依据。'] : [])]};
}
/** 第三个参数只允许服务端从当前账号的已保存方案传入，HTTP 不接受快照。 */
export function calculatePersonalElectionHours(raw: unknown, date: unknown, savedSnapshot?: PersonalElectionSnapshot) {
  const input = normalizeElectionInput(raw), {personal:conditions,...baseInput} = input;
  let hours = calculateElectionHours(baseInput,date);
  if (!conditions) return hours;
  const personal = savedSnapshot ?? resolvePersonalElectionSnapshot(conditions);
  if (![PERSONAL_ELECTION_VERSION,PERSONAL_ELECTION_LEGACY_VERSION].includes(personal.version) || personal.version === PERSONAL_ELECTION_LEGACY_VERSION && conditions.includeLuckContext) throw new ElectionError('原方案使用其他个人规则版本，可回看已存依据；新增时段请重新建立方案',409);
  if (JSON.stringify(personal.input) !== JSON.stringify(conditions)) throw new ElectionError('保存的个人条件与方案不一致，请重新建立方案',409);
  if (conditions.includeLuckContext) hours = calculateElectionHours(baseInput,date,personalElectionLuckCuts(personal,hours.date));
  const slots = hours.slots.map(slot => {
    const personalDay=assessPersonalElection(personal,slot.civilDayGanZhi,'day'), assessment=withLuck(assessPersonalElection(personal,slot.timeGanZhi,'hour'),personal,hours.date,slot.startSecond,slot.endSecond);
    return {...slot,...combine(slot.status,slot.reasons,[...personalDay.reasons,...assessment.reasons]),personal:assessment,personalDay};
  });
  return {...hours,...(conditions.includeLuckContext ? {version:PERSONAL_ELECTION_LUCK_HOURS_VERSION} : {}),input,personal,slots,policy:`${hours.policy} 个人日条件按本公历日干支，时条件按实际时干支；个人合冲不抵消事项忌或晚子待核。${conditions.includeLuckContext ? ' 时段已合并所有参与者的交运和出生切点；岁运背景只展示，不新增排除。' : ''}`};
}
