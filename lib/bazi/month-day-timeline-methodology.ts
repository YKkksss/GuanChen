import type { BaziMonthDayTimelineMethodology } from './month-day-timeline-types';

export const BAZI_MONTH_DAY_TIMELINE_METHODOLOGY_VERSION = 'bazi-month-day-timeline-v1';
export const BAZI_MONTH_DAY_TIMELINE_ENGINE_VERSION = 'bazi-month-day-timeline-engine-v1';

/** M9-14 只建立流月、流日与流年/大运的确定性时间关系，不解释吉凶。 */
export const BAZI_MONTH_DAY_TIMELINE_METHODOLOGY: BaziMonthDayTimelineMethodology = {
  schemaVersion: 1,
  version: BAZI_MONTH_DAY_TIMELINE_METHODOLOGY_VERSION,
  engineVersion: BAZI_MONTH_DAY_TIMELINE_ENGINE_VERSION,
  status: 'deterministic_schedule',
  label: '八字流月流日确定性时间轴方法 v1',
  policy: {
    monthBoundaryRule: 'exact_jie_instant',
    monthIntervalRule: 'half_open_jie_to_next_jie',
    dayBoundaryRule: 'inherit_chart_late_zi_policy',
    sameDayIntervalRule: 'civil_midnight_to_next_midnight',
    nextDayIntervalRule: 'previous_day_23_to_current_day_23',
    annualJoinRule: 'clip_to_selected_annual_interval',
    luckCycleJoinRule: 'inherit_annual_luck_segments',
    cacheRule: 'one_version_per_chart_and_annual_year',
    supportedTimezoneIds: ['Asia/Shanghai'],
    interpretationPolicy: 'schedule_only_no_fortune_claims',
  },
  deterministicOutputs: [
    '按立春、惊蛰、清明等十二个节的精确时刻划分流月',
    '按原命盘晚子时策略划分流日，并保存半开时间区间',
    '把流月、流日裁剪到所选流年的实际有效区间',
    '流日跨越节界或交运时刻时保留分段证据',
    '按命盘版本、流年版本和目标年份缓存确定性结果',
  ],
  prohibitedClaims: [
    '用公历每月一日代替八字流月的节界',
    '忽略命盘选定的晚子时换日口径',
    '把跨节或跨运的流日强行归入单一时间层',
    '从流月流日时间轴直接推导吉凶、具体事件或确定性结果',
    '用本时间轴替代医疗、法律、投资或婚姻决策',
  ],
  deferredRules: [
    '非 Asia/Shanghai 时区的精确节界换算',
    '原局、大运、流年、流月、流日之间的动态十神关系审计',
    '流月流日吉凶与具体事件预测',
  ],
  sources: [
    {
      id: 'lunar-ganzhi-exact-month-day',
      title: '6tail 阴历干支文档：精确月干支与日干支',
      type: 'official_implementation',
      url: 'https://6tail.cn/calendar/lunar.ganzhi.html',
      note: '用于确认月干支按节的精确时刻交接，以及两种晚子时日干支口径。',
    },
    {
      id: 'lunar-javascript',
      title: '6tail lunar-javascript 历法实现',
      type: 'official_implementation',
      url: 'https://github.com/6tail/lunar-javascript',
      note: '用于取得精确节气时刻、月干支和日干支。',
    },
    {
      id: 'project-chart-v1',
      title: '项目八字命盘确定性计算方法',
      type: 'project_methodology',
      note: '流日边界继承命盘已保存的晚子时换日策略。',
    },
    {
      id: 'project-annual-timeline-v1',
      title: '项目八字流年确定性时间轴方法 v1',
      type: 'project_methodology',
      note: '流月、流日只在已保存流年区间内生成，并继承其大运分段。',
    },
  ],
};
