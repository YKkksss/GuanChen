import type { BaziMethodology } from './types';

export const BAZI_METHODOLOGY_VERSION = 'bazi-foundation-v1';
export const BAZI_ENGINE_VERSION = 'bazi-engine-v1';

/**
 * M9-0 只定义可重复计算的排盘口径，不在基础事实层判断旺衰、格局或用神。
 */
export const BAZI_METHODOLOGY: BaziMethodology = {
  schemaVersion: 1,
  version: BAZI_METHODOLOGY_VERSION,
  engineVersion: BAZI_ENGINE_VERSION,
  status: 'foundation',
  label: '八字确定性排盘基础方法 v1',
  calculationPolicy: {
    calendarInput: 'gregorian',
    yearBoundary: 'exact_li_chun',
    monthBoundary: 'exact_jie',
    defaultTimeStandard: 'civil_time',
    supportedTimeStandards: ['civil_time', 'apparent_solar_time'],
    defaultLateZiPolicy: 'same_day',
    supportedLateZiPolicies: ['same_day', 'next_day'],
    timezoneSource: 'iana_tzdb',
    apparentSolarAlgorithm: 'noaa-fractional-year',
    unknownTimePolicy: 'omit_time_pillar_and_warn',
    supportedDateRange: { minimum: '1900-01-01', maximum: '2100-12-31' },
  },
  deterministicOutputs: [
    '按立春精确时刻确定年柱',
    '按交节精确时刻确定月柱',
    '按所选晚子时规则确定日柱',
    '按有效出生时刻确定时柱',
    '四柱天干地支、藏干、十神、纳音、十二长生和旬空',
    '表层五行与藏干五行的结构计数',
  ],
  deferredInterpretations: [
    '五行旺衰和月令权重',
    '格局成立、破格和变格',
    '扶抑、调候、病药、通关等用神体系',
    '大运起运岁数、顺逆和交运时刻',
    '流年吉凶与具体事件预测',
    '紫微与八字综合判断',
  ],
  prohibitedClaims: [
    '仅凭五行数量判断身强身弱',
    '把结构计数称为五行旺衰分数',
    '隐藏晚子时换日规则',
    '未知时辰时伪造时柱',
    '让 AI 自行重算或改写四柱事实',
    '以确定性语气断言健康、投资、婚姻或寿命结果',
  ],
  sources: [
    {
      id: 'lunar-javascript-official',
      title: '6tail lunar-javascript 官方文档与实现',
      type: 'official_documentation',
      url: 'https://6tail.cn/calendar/api.html',
      note: '用于公历转农历、立春和交节精确边界、四柱、藏干、十神、纳音、十二长生及旬空计算。',
    },
    {
      id: 'lunar-sect-policy',
      title: '6tail 八字晚子时流派接口',
      type: 'official_documentation',
      url: 'https://6tail.cn/calendar/lunar.ganzhi.html',
      note: '确认晚子时日柱可按当天或次日两种流派切换；本项目必须保存实际选项。',
    },
    {
      id: 'noaa-solar-equations',
      title: 'NOAA General Solar Position Calculations',
      type: 'official_documentation',
      url: 'https://gml.noaa.gov/grad/solcalc/solareqns.PDF',
      note: '用于可选的地方视太阳时换算，包括经度修正和均时差。',
    },
    {
      id: 'project-rectification-time-v1',
      title: '项目 M5 真太阳时时间服务',
      type: 'project_methodology',
      note: '八字与校时共用同一 IANA 历史时区、夏令时歧义和地方视太阳时快照，避免口径分叉。',
    },
  ],
};
