import type { LifeEventCategory, LifeEventWithTransits } from '@/lib/events/types';
import { matchEventContextPeriod } from '@/lib/events/context-period';
import type { ReportType } from './types';

const TOPIC_CATEGORIES: Partial<Record<ReportType, LifeEventCategory[]>> = {
  career: ['career', 'education', 'achievement', 'finance', 'relocation'],
  relationship: ['relationship', 'family', 'children'],
  wealth: ['finance', 'career', 'relocation'],
  health: ['health'],
};
const CUSTOM_TERMS: Partial<Record<ReportType, RegExp>> = {
  career: /工作|事业|职业|入职|离职|升职|创业|学习|毕业/,
  relationship: /婚|恋爱|伴侣|感情|分手|亲密|家庭|育儿/,
  wealth: /财务|收入|支出|债务|存款|购房|投资|资产/,
  health: /健康|睡眠|运动|就医|康复|体检|压力|休养/,
};

export function selectReportEvents(
  events: LifeEventWithTransits[],
  type: ReportType,
  period: { startDate: string; endDate: string } | null,
) {
  const confirmed = events.filter(event => event.confirmedByUser);
  const categories = TOPIC_CATEGORIES[type];
  const relevance = (event: LifeEventWithTransits) => {
    if (!categories) return 1;
    const index = categories.indexOf(event.category);
    if (index >= 0) return categories.length - index + 1;
    if (event.category === 'custom' && CUSTOM_TERMS[type]?.test(`${event.title} ${event.customCategory ?? ''} ${event.description ?? ''}`)) return 1;
    return 0;
  };
  const matching = confirmed.filter(event => relevance(event) > 0 && (type !== 'current_daxian'
    || (period !== null && matchEventContextPeriod(event, [{ level: 'year', ...period }]) !== null)));
  const selected = [...matching].sort((a, b) => relevance(b) - relevance(a)
    || b.impactLevel - a.impactLevel
    || b.startDate.localeCompare(a.startDate)
    || b.updatedAt - a.updatedAt
    || a.id.localeCompare(b.id)).slice(0, 20);
  return {
    selected,
    summary: {
      policy: type === 'current_daxian' ? '按当前大限日期相交筛选，未知日期不归入阶段'
        : categories ? '按专题分类筛选，自定义分类辅以关键词；相关度、影响程度、日期依次排序'
          : '综合报告保留各类经历，按影响程度与日期排序',
      categories: categories ?? [],
      confirmedCount: confirmed.length,
      matchedCount: matching.length,
      selectedCount: selected.length,
      omittedCount: confirmed.length - selected.length,
      truncatedCount: Math.max(0, matching.length - selected.length),
      period: type === 'current_daxian' ? period : null,
      notice: '筛选记录不代表完整经历；未选中不等于未发生。粗日期与阶段相交仅表示可能相关，不补造具体发生日。',
    },
  };
}
