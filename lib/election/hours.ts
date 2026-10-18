import { Solar } from 'lunar-javascript';
import { assessAlmanac, classifyElectionDay, electionDate, ElectionError, normalizeElectionInput } from './engine';
import { ELECTION_EVENTS, ZODIACS, type AlmanacRule, type ElectionStatus } from './types';
import { ELECTION_HOURS_POLICY, ELECTION_HOURS_SOURCE, ELECTION_HOURS_VERSION, type ElectionHours } from './hours-types';

function clock(second: number) {
  return [Math.floor(second / 3600), Math.floor(second / 60) % 60, second % 60].map(n => String(n).padStart(2, '0')).join(':');
}
export function classifyElectionHour(day: { status: ElectionStatus; reasons: string[] }, time: Pick<AlmanacRule, 'assessment' | 'reason'>, lateZi: boolean) {
  if (day.status === 'excluded') return day;
  if (day.status === 'avoid' || time.assessment === 'avoid') return { status: 'avoid' as const, reasons: [...(day.status === 'avoid' ? day.reasons.map(r => `日宜忌：${r}`) : []), ...(time.assessment === 'avoid' ? [`时宜忌：${time.reason}`] : [])] };
  if (lateZi) return { status: 'review' as const, reasons: ['晚子时的时宜忌使用次日日干支，而日宜忌仍取本公历日；两种日界保留差异，不自动列为候选。'] };
  if (day.status === 'candidate' && time.assessment === 'support') return { status: 'candidate' as const, reasons: ['所选日宜忌口径与该时段均明确列宜，且未列对应忌项；仅为事项候选。'] };
  if (day.status === 'review' || day.status === 'candidate' || time.assessment === 'support') return { status: 'review' as const, reasons: ['日宜忌与时宜忌未同时明确列宜，或所选日口径有差异；保留待核，不以时辰标签抵消日忌。'] };
  return { status: 'unlisted' as const, reasons: ['日时记录没有同时明确支持该事项；未列忌不等于适宜。'] };
}
export function calculateElectionHours(raw: unknown, rawDate: unknown, extraCuts: number[] = []): ElectionHours {
  const input = normalizeElectionInput(raw), date = electionDate(rawDate);
  if (input.personal) throw new ElectionError('个人化时辰需经当前账号读取八字版本或保存快照后计算');
  if (date < input.startDate || date > input.endDate) throw new ElectionError('查看时辰的日期需在当前方案区间内');
  // 仅供服务端岁运排期合并切点，HTTP 输入不能传入这些边界。
  if (extraCuts.some(s => !Number.isInteger(s) || s < 0 || s > 86400)) throw new ElectionError('时段分界需为当日有效整数秒');
  const [y, m, d] = date.split('-').map(Number);
  const lunarAt = (s: number) => Solar.fromYmdHms(y, m, d, Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60).getLunar();
  const firstMonth = lunarAt(0).getMonthInGanZhiExact();
  let transition: number | null = null;
  // 二分到实际交节秒界；不以整点或正午替代节令月切换。
  if (firstMonth !== lunarAt(86399).getMonthInGanZhiExact()) {
    let low = 0, high = 86399;
    while (low + 1 < high) { const middle = Math.floor((low + high) / 2); if (lunarAt(middle).getMonthInGanZhiExact() === firstMonth) low = middle; else high = middle; }
    transition = high;
  }
  const cuts = [...new Set([0, ...Array.from({ length: 12 }, (_, i) => (i * 2 + 1) * 3600), 86400, ...extraCuts, ...(transition === null ? [] : [transition])])].sort((a, b) => a - b);
  const term = ELECTION_EVENTS[input.event].term, weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const slots = cuts.slice(0, -1).map((startSecond, i) => {
    const endSecond = cuts[i + 1], lunar = lunarAt(startSecond), lateZi = startSecond >= 82800;
    const dayRules: AlmanacRule[] = ([['day_boundary', 1], ['exact_boundary', 2]] as const).map(([mode, sect]) => {
      const yi = lunar.getDayYi(sect), ji = lunar.getDayJi(sect);
      return { mode, yi, ji, monthGanZhi: sect === 1 ? lunar.getMonthInGanZhi() : lunar.getMonthInGanZhiExact(), selected: input.ruleMode === 'compare' || input.ruleMode === mode, ...assessAlmanac(term, yi, ji) };
    });
    const blocked: string[] = [];
    if (!input.weekdays.includes(weekday)) blocked.push('不在方案的可用星期内。');
    if (input.excludedZodiacs.some(i => ZODIACS[i] === lunar.getDayChongShengXiao())) blocked.push(`本公历日日冲${lunar.getDayChongShengXiao()}，命中方案的日冲排除条件。`);
    const yi = lunar.getTimeYi(), ji = lunar.getTimeJi(), time = assessAlmanac(term, yi, ji);
    const classification = classifyElectionHour(classifyElectionDay(dayRules, blocked, false), time, lateZi);
    const timeGanZhi = lunar.getTimeInGanZhi(), label = startSecond < 3600 ? '早子时' : lateZi ? '晚子时' : `${timeGanZhi[1]}时`;
    return { id: `${startSecond}-${endSecond}`, startSecond, endSecond, start: clock(startSecond), end: clock(endSecond), label,
      timeGanZhi, civilDayGanZhi: lunar.getDayInGanZhi(), timeRuleDayGanZhi: lunar.getDayInGanZhiExact(), monthGanZhi: lunar.getMonthInGanZhiExact(),
      splitAtTerm: transition !== null && (startSecond === transition || endSecond === transition), lateZi, yi, ji, timeAssessment: time.assessment, dayRules, ...classification,
      chong: lunar.getTimeChongDesc(), chongZodiac: lunar.getTimeChongShengXiao(), sha: lunar.getTimeSha(), tianShen: lunar.getTimeTianShen(), tianShenType: lunar.getTimeTianShenType(), tianShenLuck: lunar.getTimeTianShenLuck() };
  });
  return { version: ELECTION_HOURS_VERSION, source: ELECTION_HOURS_SOURCE, policy: ELECTION_HOURS_POLICY, date, input, transitionAt: transition === null ? null : clock(transition), slots };
}
