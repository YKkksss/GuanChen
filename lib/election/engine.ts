import { Solar } from 'lunar-javascript';
import { shiftCalendarDay, validateCalendarDate } from '@/lib/fortune-calendar/dates';
import { ELECTION_EVENTS, ELECTION_MODES, ELECTION_SOURCE, ELECTION_VERSION, ZODIACS, type AlmanacRule, type ElectionDay, type ElectionInput, type ElectionResult } from './types';
import { ElectionError } from './error';
import { normalizePersonalElectionInput } from './personal-rules';
export { ElectionError } from './error';
export function electionDate(raw: unknown) { if (typeof raw !== 'string') throw new ElectionError('请使用 YYYY-MM-DD 日期格式'); try { validateCalendarDate(raw); } catch { throw new ElectionError('日期格式不正确或日期不存在'); } if (raw < '1900-01-01' || raw > '2100-12-31') throw new ElectionError('择日范围为 1900–2100 年'); return raw; }
function numbers(value: unknown, max: number, minLength: number, label: string): number[] { if (!Array.isArray(value) || value.length < minLength || value.length > max+1 || value.some(n => typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > max)) throw new ElectionError(`${label}选项不正确`); return [...new Set(value as number[])].sort((a,b) => a-b); }
export function normalizeElectionInput(raw: unknown): ElectionInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ElectionError('请提交有效的择日条件');
  const v = raw as Record<string,unknown>;
  if (typeof v.event !== 'string' || !Object.hasOwn(ELECTION_EVENTS,v.event)) throw new ElectionError('请选择支持的事项');
  if (v.ruleMode !== undefined && (typeof v.ruleMode !== 'string' || !Object.hasOwn(ELECTION_MODES,v.ruleMode))) throw new ElectionError('黄历口径不正确');
  const startDate = electionDate(v.startDate), endDate = electionDate(v.endDate), days = (Date.parse(`${endDate}T00:00:00Z`)-Date.parse(`${startDate}T00:00:00Z`))/86400000+1;
  if (days < 1 || days > 92) throw new ElectionError('日期区间需按先后填写，最多含首尾 92 天');
  if (Object.keys(v).some(k => !['event','startDate','endDate','ruleMode','weekdays','excludedZodiacs','personal'].includes(k))) throw new ElectionError('择日条件含不支持的字段');
  return { event: v.event as ElectionInput['event'], startDate, endDate, ruleMode: (v.ruleMode as ElectionInput['ruleMode']) ?? 'compare', weekdays: numbers(v.weekdays ?? [0,1,2,3,4,5,6],6,1,'星期'), excludedZodiacs: numbers(v.excludedZodiacs ?? [],11,0,'日冲生肖'), ...(v.personal === undefined ? {} : {personal:normalizePersonalElectionInput(v.personal)}) };
}
export function assessAlmanac(term: string, yi: string[], ji: string[]): Pick<AlmanacRule,'assessment'|'reason'> {
  if (ji.includes(term) || yi.includes('诸事不宜') || ji.includes('诸事不宜')) return { assessment:'avoid', reason:ji.includes(term) ? `黄历忌项列有“${term}”${yi.includes(term) ? '，即使宜项也出现该事项，仍保留冲突并谨慎排除' : ''}。` : '黄历列有“诸事不宜”，不列为该事项候选。' };
  if (yi.includes(term)) return { assessment:'support', reason:`宜项明确列有“${term}”，忌项未列该事项；这只是当前黄历口径的候选依据。` };
  return { assessment:'unlisted', reason:`宜忌没有明确列出“${term}”，未列忌不等于适宜，不自动列为候选。` };
}
export function classifyElectionDay(rules: AlmanacRule[], blocked: string[], changesWithinDay: boolean): Pick<ElectionDay,'status'|'reasons'> {
  const selected = rules.filter(r => r.selected);
  if (!selected.length) throw new ElectionError('至少需使用一种黄历口径');
  if (blocked.length) return { status:'excluded', reasons:blocked };
  if (changesWithinDay && selected.some(r => r.mode === 'exact_boundary')) return { status:'review', reasons:['这一天精确节令月在日内切换。12:00 代表时刻的宜忌不能推为全天适用，需补充实际办理时刻复核。',...selected.filter(r => r.assessment === 'avoid').map(r => r.reason)] };
  if (selected.some(r => r.assessment === 'avoid')) return { status:'avoid', reasons:selected.filter(r => r.assessment === 'avoid').map(r => r.reason) };
  if (selected.every(r => r.assessment === 'support')) return { status:'candidate', reasons:selected.map(r => `${r.mode === 'day_boundary' ? '交节日期' : '精确交节'}口径：${r.reason}`) };
  if (selected.some(r => r.assessment === 'support')) return { status:'review', reasons:['所选黄历口径的事项记录不一致，仅一侧明确列宜，保留为待核日期。'] };
  return { status:'unlisted', reasons:[selected[0].reason] };
}
export function calculateElection(raw: unknown): ElectionResult {
  const input = normalizeElectionInput(raw), term = ELECTION_EVENTS[input.event].term, days: ElectionDay[] = [];
  if (input.personal) throw new ElectionError('个人化择日需经当前账号读取八字版本后计算');
  for (let date = input.startDate; date <= input.endDate; date = shiftCalendarDay(date,1)) {
    const [y,m,d] = date.split('-').map(Number), lunar = Solar.fromYmdHms(y,m,d,12,0,0).getLunar(), start = Solar.fromYmdHms(y,m,d,0,0,0).getLunar(), end = Solar.fromYmdHms(y,m,d,23,59,59).getLunar();
    const boundary = { changesWithinDay:start.getMonthInGanZhiExact() !== end.getMonthInGanZhiExact(), startMonth:start.getMonthInGanZhiExact(), noonMonth:lunar.getMonthInGanZhiExact(), endMonth:end.getMonthInGanZhiExact() };
    const rules: AlmanacRule[] = ([['day_boundary',1],['exact_boundary',2]] as const).map(([mode,sect]) => { const yi = lunar.getDayYi(sect), ji = lunar.getDayJi(sect); return { mode, monthGanZhi:sect === 1 ? lunar.getMonthInGanZhi() : lunar.getMonthInGanZhiExact(), yi, ji, ...assessAlmanac(term,yi,ji), selected:input.ruleMode === 'compare' || input.ruleMode === mode }; });
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(), chongZodiac = lunar.getDayChongShengXiao(), blocked: string[] = [];
    if (!input.weekdays.includes(weekday)) blocked.push('不在你选择的可用星期内。');
    if (input.excludedZodiacs.some(i => ZODIACS[i] === chongZodiac)) blocked.push(`日冲${chongZodiac}，命中你设置的日冲生肖排除条件；这不是完整生辰合忌判断。`);
    const classification = classifyElectionDay(rules,blocked,boundary.changesWithinDay);
    const lunarMonth = lunar.getMonth();
    days.push({ date, weekday, lunar:`${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`, lunarMonth, leapMonth:lunarMonth < 0, dayGanZhi:lunar.getDayInGanZhi(), jieQi:lunar.getJieQi(), zhiXing:lunar.getZhiXing(), tianShen:lunar.getDayTianShen(), tianShenType:lunar.getDayTianShenType(), tianShenLuck:lunar.getDayTianShenLuck(), chong:lunar.getDayChongDesc(), chongZodiac, sha:lunar.getDaySha(), boundary, rules, ...classification });
    if (date === input.endDate) break;
  }
  const counts: ElectionResult['counts'] = { candidate:0,review:0,avoid:0,unlisted:0,excluded:0 }; days.forEach(d => counts[d.status]++);
  return { version:ELECTION_VERSION, source:ELECTION_SOURCE, input, representativeTime:'12:00:00', timezone:'北京时间标准时 · UTC+08:00', warnings:['这是传统黄历事项筛选，候选不保证事件结果，请同时考虑现实安排。','两种黄历口径来自同一历法库，不构成独立流派互证；未列事项不等于适宜。','精确交节口径在日内换月时需按实际办理时刻复核，可打开择日吉时查看分段依据；尚不提供真太阳时、完整八字用神或三合等专门择日。','建除值星与黄道/黑道标签按库的交节日期口径展示，仅作历法参考，不单独决定候选。','日冲生肖只按用户选择的条件排除，不替代个人八字或双方命盘的完整匹配。'], counts, days };
}
