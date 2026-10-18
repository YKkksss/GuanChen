import { Solar } from 'lunar-javascript';
import { getConversation } from '@/lib/db/conversations';
import { getOrCreateDailyTransit } from '@/lib/transits/service';
import { createChatCompletion, getProviderConfig } from '@/lib/ai/deepseek';
import { claimCalendarReading, failCalendarReading, finishCalendarReading, getCalendarReading, listCalendarReadings } from '@/lib/db/fortune-calendar';
import { beijingToday, clampCalendarDate, parseCalendarMonth, validateCalendarDate } from './dates';
import { buildCalendarFacts, buildCalendarMessages, CALENDAR_PROMPT_VERSION, validateCalendarContent } from './interpretation';
import type { CalendarDayDetail, CalendarMonth, CalendarTopic } from './types';

export class CalendarError extends Error { constructor(message: string, public status = 400) { super(message); } }
function requireChart(id: string) {
  const conversation = getConversation(id);
  if (!conversation) throw new CalendarError('命盘不存在', 404);
  if (conversation.type !== 'chart' || !conversation.chartSnapshot || !conversation.birthInfo) throw new CalendarError('运势日历需要一份完整的个人紫微命盘');
  const birth = conversation.birthInfo;
  return { conversation, chart: conversation.chartSnapshot, minDate: `${birth.year}-${String(birth.month).padStart(2, '0')}-${String(birth.day).padStart(2, '0')}`, maxDate: `${Math.min(birth.year + 130, 2200)}-12-31` };
}
export function getCalendarMonth(id: string, requestedMonth: string | null, topic: CalendarTopic): CalendarMonth {
  const { conversation, minDate, maxDate } = requireChart(id);
  const month = requestedMonth ?? clampCalendarDate(beijingToday(), minDate, maxDate).slice(0, 7);
  let parsed: ReturnType<typeof parseCalendarMonth>;
  try { parsed = parseCalendarMonth(month); } catch (error) { throw new CalendarError(error instanceof Error ? error.message : '月份格式错误'); }
  if (month < minDate.slice(0, 7) || month > maxDate.slice(0, 7)) throw new CalendarError('该月份不在命盘的运限范围内');
  const readings = new Map(listCalendarReadings(id, month, topic).map(item => [item.date, item]));
  const days = Array.from({ length: parsed.days }, (_, index) => {
    const day = index + 1, date = `${month}-${String(day).padStart(2, '0')}`;
    const lunar = Solar.fromYmd(parsed.year, parsed.month, day).getLunar();
    const available = date >= minDate && date <= maxDate;
    const snapshot = available ? getOrCreateDailyTransit(id, date).snapshot : null;
    const reading = readings.get(date);
    const monthLabel = snapshot?.lunarDay.monthLabel ?? `${lunar.getMonth() < 0 && !lunar.getMonthInChinese().startsWith('闰') ? '闰' : ''}${lunar.getMonthInChinese()}月`;
    return { date, day, weekday: new Date(`${date}T12:00:00Z`).getUTCDay(), available,
      lunarLabel: lunar.getDay() === 1 ? monthLabel : lunar.getDayInChinese(),
      lunarMonthLabel: monthLabel, ganZhi: snapshot?.flowDay.ganZhi ?? `${lunar.getDayGan()}${lunar.getDayZhi()}`, dayPalace: snapshot?.flowDay.nativePalaceName ?? null,
      reading: reading ? { status: reading.status, summary: reading.summary } : null };
  });
  return { month, today: beijingToday(), minDate, maxDate, conversationTitle: conversation.title, unknownTime: Boolean(conversation.birthInfo?.unknownTime), days };
}
export function getCalendarDay(id: string, date: string, topic: CalendarTopic): CalendarDayDetail {
  const { chart, minDate, maxDate } = requireChart(id);
  try { validateCalendarDate(date); } catch (error) { throw new CalendarError(error instanceof Error ? error.message : '日期格式错误'); }
  if (date < minDate || date > maxDate) throw new CalendarError('该日期不在命盘的运限范围内');
  const snapshot = getOrCreateDailyTransit(id, date).snapshot;
  return { date, topic, facts: buildCalendarFacts(chart, snapshot), reading: getCalendarReading(id, date, topic) };
}
export async function generateCalendarReading(id: string, date: string, topic: CalendarTopic, signal?: AbortSignal) {
  const detail = getCalendarDay(id, date, topic);
  // 先返回已保存的解读，回看不依赖供应商在线或当前密钥配置。
  if (detail.reading && detail.reading.status !== 'failed') return detail.reading;
  const config = getProviderConfig();
  if (!config.apiKey || !config.baseUrl || !config.model) throw new CalendarError('AI 服务尚未配置，请联系管理员', 503);
  const claim = claimCalendarReading({ conversationId: id, date, topic, facts: detail.facts, provider: config.provider, model: config.model, promptVersion: CALENDAR_PROMPT_VERSION });
  if (!claim.requestId) return claim.reading;
  try {
    const deadline = AbortSignal.timeout(100_000);
    const result = await createChatCompletion(buildCalendarMessages(detail.facts, topic), { temperature: 0.25, maxTokens: 2400, thinking: false, signal: signal ? AbortSignal.any([signal, deadline]) : deadline });
    const content = validateCalendarContent(result.content, detail.facts);
    finishCalendarReading(claim.reading.id, claim.requestId, content, result.usage.inputTokens, result.usage.outputTokens);
    const saved = getCalendarReading(id, date, topic);
    if (!saved) throw new CalendarError('命盘或解读已被删除', 404);
    return saved;
  } catch (error) {
    failCalendarReading(claim.reading.id, claim.requestId, 'generation_failed');
    if (error instanceof CalendarError) throw error;
    // 上游错误可能包含服务配置，客户端与数据库只保存固定的中文提示/错误码。
    throw new CalendarError('解读生成失败，请稍后重试。已保存的其他日期解读不受影响。', 502);
  }
}
