import type { BaziMonthDayStrengthMethodology } from './month-day-strength-types';

export const BAZI_MONTH_DAY_STRENGTH_METHODOLOGY_VERSION = 'bazi-month-day-strength-composite-v1';
export const BAZI_MONTH_DAY_STRENGTH_ENGINE_VERSION = 'bazi-month-day-strength-engine-v1';

/** M9-17 只比较静态、岁运与流月流日表层方向，并列条件上下文，不裁决最终旺衰。 */
export const BAZI_MONTH_DAY_STRENGTH_METHODOLOGY: BaziMonthDayStrengthMethodology = {
  schemaVersion: 1,
  version: BAZI_MONTH_DAY_STRENGTH_METHODOLOGY_VERSION,
  engineVersion: BAZI_MONTH_DAY_STRENGTH_ENGINE_VERSION,
  status: 'month_day_strength_composite_evidence_audit',
  label: '八字流月流日旺衰综合证据矩阵 v1',
  policy: {
    upstreamPolicy: 'consume_versioned_m9_3_m9_15_m9_16_evidence',
    staticPolicy: 'preserve_m9_3_baseline_without_reclassification',
    surfacePolicy: 'separate_inherited_and_month_day_visible_directions',
    hiddenPolicy: 'position_or_touch_context_only_no_strength_effect',
    rootPolicy: 'm9_16_day_master_root_condition_only',
    monthCommandPolicy: 'm9_16_touch_context_without_effect_verdict',
    comparisonPolicy: 'direction_comparison_not_final_strength',
    segmentPolicy: 'audit_each_exact_day_segment_independently',
    scoringPolicy: 'no_numeric_score_weight_or_final_strength',
  },
  familyLabels: {
    static_baseline: 'M9-3 静态基线',
    inherited_dynamic_surface: '大运／流年表层方向',
    month_day_surface: '流月／流日表层方向',
    month_day_hidden_position: '流月／流日藏干位置',
    day_master_root_condition: '日主根气条件',
    month_command_touch: '月令藏干触达条件',
    hidden_stem_touch_context: '藏干触达条件上下文',
  },
  deterministicOutputs: [
    '原样保留 M9-3 静态旺衰证据标签，不按指定日期重判原局',
    '大运与流年表层方向、流月与流日表层方向分组展示',
    '只用可见表层十神分类生扶或泄耗制方向，不设置数量权重',
    '流月流日藏干、日主根气和月令触达只进入条件上下文列',
    '分别输出流月流日对既有岁运方向的同向、异向或并见比较',
    '五层表层与静态基线只做方向比较，不改写最终旺衰',
  ],
  prohibitedClaims: [
    '按表层数量、藏干数量、根候选或触达入口计算旺衰分数、权重或百分比',
    '把流月流日与岁运方向同向解释为日主已经变强或变弱',
    '把流月流日方向异向解释为已经抵消、反转或压过既有方向',
    '把藏干位置、严格同干根或触达条件直接计入实际生扶、泄耗或制克力量',
    '把月令触达直接解释为月令增强、受损、失效、冲开、合化或解冲',
    '从综合矩阵指定最终用神、喜忌、吉凶或具体事件',
  ],
  deferredRules: [
    '流月流日证据对格局支持、风险和救应条件的映射',
    '节气深浅、司令分日与根气位置的流派权重',
    '五层刑冲合害对力量方向的作用条件树',
    '最终旺衰、格局成败、用神喜忌、吉凶与事件推断',
  ],
  sources: [
    {
      id: 'project-m9-3-static-baseline',
      title: '项目 M9-3 静态旺衰证据',
      type: 'project_methodology',
      note: '静态标签和证据方向原样保留，不因某个流日重新分类原局。',
    },
    {
      id: 'project-m9-12-strength-composite',
      title: '项目 M9-12 月令与旺衰综合证据矩阵',
      type: 'project_methodology',
      note: '复用十神表层方向、静态动态比较和条件上下文不计力量的语义。',
    },
    {
      id: 'project-m9-15-five-layer-role',
      title: '项目 M9-15 五层关系与动态十神角色',
      type: 'project_methodology',
      note: '提供精确片段内大运、流年、流月、流日表层与藏干十神角色。',
    },
    {
      id: 'project-m9-16-visibility-root-touch',
      title: '项目 M9-16 显隐、透根与藏干触达条件',
      type: 'project_methodology',
      note: '日主根气、月令触达和藏干触达只作为条件上下文，不折算力量。',
    },
  ],
};
