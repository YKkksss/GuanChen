import type { ConversationMessage } from '@/lib/conversations/types';

export type AnnualQuestionIntent =
  | { kind: 'none' }
  | { kind: 'clarify'; notice: string }
  | { kind: 'years'; years: number[]; referenceYear: number };

/** 以提问时的北京时间解析年份，重试或跨年重开不会改变“明年”的含义。 */
export function resolveAnnualQuestion(message: ConversationMessage, birthYear: number): AnnualQuestionIntent {
  const text = message.content.trim();
  const hasTime = /\d{4}|今年|明年|后年|去年|前年|年后|未来|接下来|那年|这一年|下个月|下月|今天|明天|流月|流日|本月|上月|后天|下一年|[〇零一二三四五六七八九十两]+年/.test(text);
  const yearOnly = /^(?:那|那么)?(?:\d{4}年|今年|明年|后年|去年|前年)[？?。]?$/.test(text);
  if (!hasTime || (!yearOnly && !/[？?吗呢]|如何|怎样|怎么样|运势|流年|流月|流日|分析|解读|看看|看下|对比|比较|区别|哪|适合|详细|展开|说说/.test(text))) return { kind: 'none' };
  const clarify = (notice: string): AnnualQuestionIntent => ({ kind: 'clarify', notice });
  // 月日必须使用相应计算口径，不能用年度快照冒充。
  if (/\d{4}[-/.]\d{1,2}|\d{1,2}月|\d{1,2}[日号]|流月|流日|下个月|下月|今天|明天|农历|阴历|[一二三四五六七八九十正冬腊]+月|本月|这个月|上个月|上月|后天|几月|几号|哪个月|哪天|哪一天/.test(text)) {
    return clarify('本题涉及月、日或农历日期，尚未自动确定运限区间。请用户通过流月或流日入口选定日期；不得用年度事实代替月日分析。');
  }
  if (/下一年|[〇零一二三四五六七八九十两]+年|不要|不看|不是|排除/.test(text)) {
    return clarify('日期表达有歧义，请用户直接给出本题要分析的公历年份（例如 2028 年），最多三个。');
  }
  const referenceYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric' }).format(new Date(message.createdAt)));
  // 陈述过往经历不等于要求分析该年份；保留问题中的其他时间表达。
  const query = text.replace(/(?:我|我们)(?:在|于)?\s*\d{4}年[^，,。；;？?]*(?=[，,。；;]|$)/g, clause =>
    /为什么|为何|如何|分析|解读|运势|吗|呢/.test(clause) ? clause : '');
  if (/大后年|大前年|[一二三四五六七八九十百\d]+年[后前]|未来|接下来/.test(query)) {
    return clarify('请用户把相对时间范围改为明确的公历年份，最多选择三个年份。');
  }
  const years: number[] = [];
  const range = query.match(/(?<!\d)(\d{4})年?\s*(?:到|至|—|–|-)\s*(\d{4})年?(?!\d)/);
  if (range) {
    const from = Number(range[1]), to = Number(range[2]);
    if (to < from || to - from > 2) return clarify('请用户将年份范围缩小到按顺序排列的最多三个年份，再进行有计算依据的比较。');
    for (let year = from; year <= to; year++) years.push(year);
  }
  if (/\d{4}年/.test(query)) {
    for (const match of query.matchAll(/(?<!\d)(\d{4})(?:年|(?=\s*(?:[、，,和与到至—–-]|$|[?？])))/g)) years.push(Number(match[1]));
  }
  const offsets: Record<string, number> = { 前年: -2, 去年: -1, 今年: 0, 明年: 1, 后年: 2 };
  for (const match of query.matchAll(/前年|去年|今年|明年|后年/g)) years.push(referenceYear + offsets[match[0]]);
  if (/\d+年后|未来|接下来|那年|这一年/.test(query) && !years.length) {
    return clarify('本题的年份尚不明确，请用户给出具体公历年份。不要自行选择年份或沿用不相关的旧运限。');
  }
  const unique = [...new Set(years)];
  if (!unique.length) return { kind: 'none' };
  if (unique.length > 3) return clarify('本题涉及超过三个年份，请用户先选出最多三个重点年份再比较。');
  const latestYear = Math.min(birthYear + 130, 2200);
  if (unique.some(year => year < birthYear || year > latestYear)) {
    return clarify(`当前命盘可计算的年份为 ${birthYear} 至 ${latestYear}。请用户调整年份，不能为范围外的年份编造运限事实。`);
  }
  return { kind: 'years', years: unique, referenceYear };
}
