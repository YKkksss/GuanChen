import type { Palace, ZiweiChart } from '@/lib/ziwei/types';

export const ZIWEI_SYSTEM_PROMPT = `你是一个中文紫微斗数命盘解读助手。
要求：
1. 只基于用户提供的命盘结构、宫位、星曜、四化、大限流年进行分析，不要编造出生信息。
2. 语气可以像命理师，但结论必须留有余地，避免“必然发生”“一定发财”“一定生病”等绝对化表达。
3. 涉及健康、投资、法律、婚姻等重大事项时，明确这是文化学习与个人反思参考，不替代专业建议。
4. 输出中文，结构清晰，优先使用 **【小标题】** 分段。
5. 用户问得宽泛时，先给总览，再给可执行的观察重点。
6. 只有标记为“用户已确认人生事件”的正式记录可以作为现实事实；聊天中的事件候选、助手推断和命理解释都不能自动写成用户经历。
7. 出生时辰标记为 unknown 时，必须说明当前是子时试排并降低置信度，不得把时宫相关结论写成确定事实。`;

export function summarizeChart(chart: ZiweiChart): string {
  const birth = chart.birthInfo;
  const currentDaXian = chart.daXians?.[chart.currentDaXianIndex];

  return JSON.stringify({
    birthInfo: {
      year: birth.year,
      month: birth.month,
      day: birth.day,
      hour: birth.unknownTime ? null : birth.hour,
      timeConfidence: birth.unknownTime ? 'unknown' : 'known',
      gender: birth.gender,
      name: birth.name,
      city: birth.city,
    },
    uncertainty: birth.unknownTime ? '出生时辰未知；当前命盘按子时试排，分析必须降低置信度并提示校时。' : undefined,
    lunarInfo: chart.lunarInfo,
    mingGongBranch: chart.mingGongBranch,
    shenGongBranch: chart.shenGongBranch,
    wuxingJuName: chart.wuxingJuName,
    currentAge: chart.currentAge,
    currentDaXian,
    palaces: chart.palaces.map(summarizePalace),
  }, null, 2);
}

function summarizePalace(palace: Palace) {
  return {
    name: palace.name,
    branch: palace.branch,
    stem: palace.stem,
    daXianAge: palace.daXianAge,
    isMingGong: palace.isMingGong,
    isShenGong: palace.isShenGong,
    isCurrentDaXian: palace.isCurrentDaXian,
    stars: palace.stars.map(star => ({
      name: star.name,
      type: star.type,
      siHua: star.siHua,
      brightness: star.brightness,
    })),
    selfSihua: palace.selfSihua,
    isEmpty: palace.isEmpty,
    borrowedFromName: palace.borrowedFromName,
    borrowedStars: palace.borrowedStars,
  };
}
