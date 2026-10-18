import type { ChatMessage } from '@/lib/ai/deepseek';
import { BRANCHES } from '@/lib/ziwei/constants';
import type { ZiweiChart } from '@/lib/ziwei/types';
import type { DailyTransitSnapshot } from '@/lib/transits/types';
import { CALENDAR_TOPICS, READING_SECTIONS, type CalendarFacts, type CalendarReadingContent, type CalendarTopic, type ReadingSectionKey } from './types';

export const CALENDAR_PROMPT_VERSION = 'fortune-calendar-v1';
export function buildCalendarFacts(chart: ZiweiChart, snapshot: DailyTransitSnapshot): CalendarFacts {
  const evidence: CalendarFacts['evidence'] = [
    { id: 'stage:decadal', label: '所在大限', details: `${snapshot.nominalAge} 虚岁；${snapshot.decadal.periodKind === 'childhood' ? '童限，尚未进入首个大限' : snapshot.decadal.periodKind === 'unavailable' ? '超出已排大限，不推断缺失的大限结构' : `${snapshot.decadal.startAge ?? '未记录'}–${snapshot.decadal.endAge ?? '未记录'} 岁，本命${snapshot.decadal.nativePalaceName}`} ${snapshot.decadal.palaceBranch >= 0 ? `（${BRANCHES[snapshot.decadal.palaceBranch]}）` : ''}。` },
    { id: 'stage:year', label: '所选日的流年', details: `${snapshot.year.ganZhi}年；流年命宫落本命${snapshot.flowYear.nativePalaceName}（${BRANCHES[snapshot.flowYear.palaceBranch]}）。` },
    { id: 'stage:month', label: '所选日的流月', details: `${snapshot.lunarMonth.label}，${snapshot.lunarMonth.startDate}至${snapshot.lunarMonth.endDate}；${snapshot.flowMonth.ganZhi}，流月命宫落本命${snapshot.flowMonth.nativePalaceName}。` },
    { id: 'stage:day', label: '流日命宫', details: `${snapshot.targetDate}，农历${snapshot.lunarDay.monthLabel}${snapshot.lunarDay.dayLabel}，${snapshot.flowDay.ganZhi}；流日命宫落本命${snapshot.flowDay.nativePalaceName}（${BRANCHES[snapshot.flowDay.palaceBranch]}）。` },
  ];
  for (const palace of chart.palaces) {
    evidence.push({ id: `natal:${palace.branch}`, label: `本命${palace.name}`, details: `${BRANCHES[palace.branch]}宫；${palace.stars.map(star => `${star.name}${star.siHua ? `化${star.siHua}` : ''}${star.brightness ? `（${star.brightness}）` : ''}`).join('、') || '无记录星曜'}${palace.isEmpty ? `；空宫，借${palace.borrowedFromName ?? '对宫'}：${palace.borrowedStars?.join('、') || '未记录'}` : ''}。` });
  }
  for (const [level, label, transforms] of [
    ['year', '流年', snapshot.yearlyTransformations], ['month', '流月', snapshot.monthlyTransformations], ['day', '流日', snapshot.transformations],
  ] as const) transforms.forEach((item, index) => evidence.push({ id: `transform:${level}:${index}`, label: `${label}${item.starName}化${item.type}`, details: `${label}${item.starName}化${item.type}，落本命${item.natalPalaceName ?? '未定位宫位'}。` }));
  snapshot.palaceMappings.forEach(item => evidence.push({ id: `mapping:${item.branch}`, label: `流日${item.transitPalaceName}`, details: `落本命${item.nativePalaceName}（${BRANCHES[item.branch]}），流曜：${item.transitStars.join('、') || '无记录'}。` }));
  return { snapshot, unknownTime: Boolean(chart.birthInfo.unknownTime), evidence };
}
export function buildCalendarMessages(facts: CalendarFacts, topic: CalendarTopic): ChatMessage[] {
  return [{ role: 'system', content: `你是观辰紫微运势日历的中文解读助手。仅解释提供的确定性本命与所选日运限事实，不自行起盘、编造星曜四化或补写现实经历。
分析顺序为本命底色、大限背景、流年主题、流月触发、流日观察。流月按农历月，流日按北京时间公历日期的早子时代表点，不能推断晚子时或具体时辰。
当前主题为${CALENDAR_TOPICS[topic].label}，参考宫位为${CALENDAR_TOPICS[topic].palaces.join('、')}，须结合各层运限及三方四正，不机械将单个化忌等同坏运。
出生时辰未知时明确说明子时试排并降低判断确定性。命理解释和行动建议不是现实事件事实，不使用必定、注定、百分百等绝对措辞，不输出吉凶分数或虚构概率。财运关注资源安排，不提供具体投资买卖指令。
仅返回一个 JSON 对象，不输出代码块或额外开场白：
{"summary":"50至120字的主题摘要","sections":[{"key":"overview","content":"当天主题，100至220字","evidenceIds":["stage:day"]},{"key":"focus","content":"可以关注的主题与机会，100至220字","evidenceIds":["实际依据ID"]},{"key":"attention","content":"需要留意的条件与不确定性，100至220字","evidenceIds":["实际依据ID"]},{"key":"action","content":"具体且可执行的建议，100至220字","evidenceIds":["实际依据ID"]}]}
四节必须齐全且不重复。每节引用1至6个输入中实际存在的 evidence.id。依据ID只填写在 evidenceIds，不在正文展示内部标识。` },
  { role: 'user', content: JSON.stringify({ date: facts.snapshot.targetDate, topic: CALENDAR_TOPICS[topic].label, ...facts }) }];
}
export function validateCalendarContent(text: string, facts: CalendarFacts): CalendarReadingContent {
  if (text.length > 24_000) throw new Error('解读内容过长');
  const data: unknown = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('解读格式不完整');
  const raw = data as Record<string, unknown>;
  const string = (value: unknown, min: number, max: number) => {
    if (typeof value !== 'string' || value.trim().length < min || value.length > max || /必定|注定|百分百|必然发生|一定会/.test(value)) throw new Error('解读正文不符合要求');
    return value.trim();
  };
  if (!Array.isArray(raw.sections) || raw.sections.length !== 4) throw new Error('解读章节不完整');
  const allowed = new Set(facts.evidence.map(item => item.id));
  const keys = new Set<string>(), contents = new Set<string>();
  const sections = raw.sections.map((value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('解读章节格式错误');
    const section = value as Record<string, unknown>;
    if (typeof section.key !== 'string' || !Object.hasOwn(READING_SECTIONS, section.key) || keys.has(section.key)) throw new Error('解读章节重复或未知');
    const content = string(section.content, 12, 1600);
    if (contents.has(content)) throw new Error('解读正文重复');
    if (!Array.isArray(section.evidenceIds) || section.evidenceIds.length < 1 || section.evidenceIds.length > 6 || section.evidenceIds.some(id => typeof id !== 'string' || !allowed.has(id))) throw new Error('解读包含无效依据');
    keys.add(section.key); contents.add(content);
    return { key: section.key as ReadingSectionKey, content, evidenceIds: [...new Set(section.evidenceIds as string[])] };
  });
  return { summary: string(raw.summary, 12, 300), sections: Object.keys(READING_SECTIONS).map(key => sections.find(section => section.key === key)!) };
}
