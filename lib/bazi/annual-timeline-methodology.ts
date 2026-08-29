import type { BaziAnnualTimelineMethodology } from './annual-timeline-types';

export const BAZI_ANNUAL_TIMELINE_METHODOLOGY_VERSION = 'bazi-annual-timeline-v1';
export const BAZI_ANNUAL_TIMELINE_ENGINE_VERSION = 'bazi-annual-timeline-engine-v1';

/** M9-5 只建立立春流年与大运区间的确定性时间关系，不解释吉凶。 */
export const BAZI_ANNUAL_TIMELINE_METHODOLOGY: BaziAnnualTimelineMethodology = {
  schemaVersion: 1,
  version: BAZI_ANNUAL_TIMELINE_METHODOLOGY_VERSION,
  engineVersion: BAZI_ANNUAL_TIMELINE_ENGINE_VERSION,
  status: 'deterministic_schedule',
  label: '八字流年确定性时间轴方法 v1',
  policy: {
    annualBoundaryRule: 'exact_li_chun_instant',
    intervalRule: 'half_open_li_chun_to_next_li_chun',
    luckCycleJoinRule: 'exact_interval_intersection',
    crossCycleRule: 'split_at_actual_luck_cycle_transition',
    supportedTimezoneIds: ['Asia/Shanghai'],
    fallbackYears: 81,
    interpretationPolicy: 'schedule_only_no_fortune_claims',
  },
  deterministicOutputs: [
    '以精确立春时刻作为流年干支交接边界',
    '保存每个流年的半开时间区间',
    '按实际交运时刻求流年与大运区间的交集',
    '交运发生在流年内部时拆成前后两个片段',
  ],
  prohibitedClaims: [
    '把公历元旦作为八字流年干支交接边界',
    '把跨越交运时刻的整个流年强行归入单一步大运',
    '从时间轴直接推导流年吉凶、具体事件或确定性结果',
    '用流年时间轴替代医疗、法律、投资或婚姻决策',
  ],
  deferredRules: [
    '非 Asia/Shanghai 时区的立春绝对时刻换算',
    '原局、大运与流年之间的生克冲合刑害证据审计',
    '流月和流日时间轴',
    '流年吉凶和具体事件预测',
  ],
  sources: [
    {
      id: 'lunar-ganzhi-exact',
      title: '6tail 阴历干支文档：精确年干支',
      type: 'official_implementation',
      url: 'https://6tail.cn/calendar/lunar.ganzhi.html',
      note: '用于确认精确年干支以立春交接时刻为界。',
    },
    {
      id: 'lunar-javascript-solar-terms',
      title: '6tail lunar 历法实现',
      type: 'official_implementation',
      url: 'https://github.com/6tail/lunar-java/blob/master/src/main/java/com/nlf/calendar/Solar.java',
      note: '用于取得每年立春的精确公历时刻并交叉校验年干支。',
    },
    {
      id: 'sanming-tonghui-annual-luck',
      title: '《三命通会》总论岁运',
      type: 'classical_text',
      url: 'https://www.shiwens.cn/bookv_13526.html',
      note: '仅用于确认流年太岁和大运是需要组合但应分层记录的时间概念，不采纳吉凶断语。',
    },
    {
      id: 'project-luck-cycle-v1',
      title: '项目八字大运确定性排期方法 v1',
      type: 'project_methodology',
      note: '流年与大运的归属完全绑定 M9-4 已持久化的交运边界。',
    },
  ],
};
