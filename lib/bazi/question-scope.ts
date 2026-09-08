import type { BaziLateZiPolicy } from './types';

/** 日期限定只作为事实检索范围；保留用户原文，禁止从助手回答继承日期。 */
export function resolveBaziQuestionScope(input: {
  question: string;
  previousQuestions: string[];
  currentYear: number;
  timeZone: string;
  lateZiPolicy: BaziLateZiPolicy;
  asOf?: Date;
}): { question: string; scope: string | null; inherited: boolean } {
  const parse = (text: string): string | null => {
    const full = text.match(/(?<!\d)((?:18|19|20|21)\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})(?:日|号)?/);
    if (full) {
      const [year, month, day] = full.slice(1).map(Number);
      const date = new Date(Date.UTC(year, month - 1, day));
      if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
        throw new Error('指定日期无效，请提供有效的年月日。');
      }
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    if (/(?:今天|今日)/.test(text)) {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone: input.timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
      }).formatToParts(input.asOf ?? new Date()).map(item => [item.type, item.value]));
      const date = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)
        + (input.lateZiPolicy === 'next_day' && Number(parts.hour) >= 23 ? 1 : 0)));
      return date.toISOString().slice(0, 10);
    }
    const year = text.match(/(?<!\d)((?:18|19|20|21)\d{2})(?:年|(?=\D|$))/);
    if (year) return `${year[1]}年`;
    if (/(?:今年|当前流年|当前年份)/.test(text)) return `${input.currentYear}年`;
    return null;
  };
  const explicit = parse(input.question);
  let scope = explicit;
  if (!scope && /(?:继续|再|这个|这天|这一年|刚才|上述|详细|为什么)/.test(input.question)
    && !/(?:原局|本命|出生|换个话题|不看流年)/.test(input.question)
    && !/\d{1,2}月\d{1,2}/.test(input.question)) {
    for (const previous of input.previousQuestions.slice().reverse()) {
      // 相对时间以本次观察日解析，不把过去某次“今天”误当固定日期。
      if (/(?:原局|本命|换个话题|不看流年)/.test(previous)) break;
      try { scope = parse(previous); } catch { break; }
      if (scope) break;
    }
  }
  return { question: scope ? `分析范围：${scope}。\n${input.question}` : input.question, scope, inherited: Boolean(scope && !explicit) };
}
