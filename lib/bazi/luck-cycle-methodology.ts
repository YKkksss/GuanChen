import type { BaziLuckCycleMethodology } from './luck-cycle-types';

export const BAZI_LUCK_CYCLE_METHODOLOGY_VERSION = 'bazi-luck-cycle-schedule-v1';
export const BAZI_LUCK_CYCLE_ENGINE_VERSION = 'bazi-luck-cycle-engine-v1';

/**
 * M9-4 只计算大运排期事实，不解释某步大运的吉凶。
 */
export const BAZI_LUCK_CYCLE_METHODOLOGY: BaziLuckCycleMethodology = {
  schemaVersion: 1,
  version: BAZI_LUCK_CYCLE_METHODOLOGY_VERSION,
  engineVersion: BAZI_LUCK_CYCLE_ENGINE_VERSION,
  status: 'deterministic_schedule',
  label: '八字大运确定性排期方法 v1',
  policy: {
    directionRule: 'year_stem_yin_yang_and_gender',
    forwardGroups: ['yang_male', 'yin_female'],
    backwardGroups: ['yin_male', 'yang_female'],
    boundaryRule: 'forward_next_jie_backward_previous_jie',
    boundaryScope: 'jie_only_not_all_solar_terms',
    conversionRule: 'minute_precision_three_days_one_year',
    conversionEquivalences: {
      minutesPerYear: 4320,
      minutesPerMonth: 360,
      minutesPerDay: 12,
      hoursPerRemainingMinute: 2,
    },
    precision: 'minute_seconds_discarded',
    cycleLengthYears: 10,
    displayedCycles: 8,
    supportedTimezoneIds: ['Asia/Shanghai'],
    unknownTimePolicy: 'withhold_exact_start_keep_provisional_sequence',
    apparentSolarTimePolicy: 'use_civil_birth_instant_for_elapsed_time',
  },
  deterministicOutputs: [
    '按年干阴阳和性别确定大运顺逆',
    '顺排取出生后的下一个节，逆排取出生前的上一个节',
    '按分钟记录出生时刻与所取节的时间差',
    '按三日一年折算起运年、月、日、时',
    '生成交运时刻和八步十年大运干支序列',
  ],
  prohibitedClaims: [
    '把节和中气混为同一组起运边界',
    '隐藏顺逆、所取节或折算方法',
    '出生时辰未知时伪造精确交运日期',
    '把大运干支排期直接解释为吉凶事件',
    '用大运结果给出医疗、投资、婚姻或寿命决定性建议',
  ],
  deferredRules: [
    '非 Asia/Shanghai 时区的节气绝对时刻换算',
    '其他起运折算法和流派对照',
    '每步大运的旺衰、格局、用神和喜忌作用',
    '流年、流月和具体事件预测',
  ],
  sources: [
    {
      id: 'yuanhai-ziping-start-luck',
      title: '《渊海子平》卷一·论起大运法',
      type: 'classical_text',
      url: 'https://sajumania.com/ebook/to01-06/to01-06-01-55.htm',
      note: '用于顺逆分组、顺取未来节、逆取已过节及三日折一年。',
    },
    {
      id: 'sanming-tonghui-luck',
      title: '《三命通会》卷二·论大运',
      type: 'classical_text',
      url: 'https://www.mastervt.com/books/sanmingtonghui/juan-2/chapter-026',
      note: '用于核对节气日时折算及一辰十岁的排运框架。',
    },
    {
      id: 'lunar-javascript-yun-sect2',
      title: '6tail lunar Yun 官方实现',
      type: 'official_implementation',
      url: 'https://github.com/6tail/lunar-java/blob/master/src/main/java/com/nlf/calendar/eightchar/Yun.java',
      note: '采用流派参数 2 的分钟折算实现，并与本项目中 lunar-javascript 1.7.3 结果交叉校验。',
    },
    {
      id: 'project-bazi-foundation-v1',
      title: '项目八字确定性排盘基础方法 v1',
      type: 'project_methodology',
      note: '大运干支序列绑定已保存月柱，顺逆依据绑定已保存年柱，避免 AI 重算。',
    },
  ],
};
