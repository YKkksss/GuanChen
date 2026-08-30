import type { BaziMonthDayVisibilityMethodology } from './month-day-visibility-types';

export const BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY_VERSION = 'bazi-month-day-visibility-audit-v1';
export const BAZI_MONTH_DAY_VISIBILITY_ENGINE_VERSION = 'bazi-month-day-visibility-engine-v1';

/** M9-16 只审计流月流日参与的显隐、透根与藏干触达条件，不裁决作用结果。 */
export const BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY: BaziMonthDayVisibilityMethodology = {
  schemaVersion: 1,
  version: BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY_VERSION,
  engineVersion: BAZI_MONTH_DAY_VISIBILITY_ENGINE_VERSION,
  status: 'month_day_visibility_root_touch_condition_audit',
  label: '八字流月流日显隐、透根与藏干触达条件审计 v1',
  policy: {
    upstreamPolicy: 'consume_versioned_m9_15_exact_day_segments',
    focusPolicy: 'require_month_or_day_participant_in_each_output',
    repeatPolicy: 'reuse_m9_9_same_stem_and_same_ten_god_clusters',
    transparencyRootPolicy: 'reuse_m9_10_exact_stem_and_same_element_separation',
    hiddenTouchPolicy: 'reuse_m9_11_three_touch_entries',
    segmentPolicy: 'audit_each_exact_day_segment_independently',
    scoringPolicy: 'counts_only_no_strength_fortune_or_event_weight',
  },
  deterministicOutputs: [
    '流月或流日参与的同干重复簇与同十神重复簇',
    '流月或流日参与的藏干对表层完全同干匹配',
    '流月或流日参与的严格同干根与同五行支持参照',
    '由流月或流日参与的完全同干表层、同支重复或明确地支关系触达入口',
    '流日内部跨节、跨运片段的独立条件快照',
  ],
  prohibitedClaims: [
    '把显隐同见解释为已经透干、得根、引动或发动',
    '把严格同干根候选解释为强根、真根、有力或力量增加',
    '把同支重复解释为伏吟吉凶、事件重复或力量叠加',
    '把冲合刑害触达解释为开库、冲开、合化、解冲或最终作用',
    '按重复簇、根候选或触达入口数量计算旺衰、喜忌、吉凶或事件概率',
  ],
  deferredRules: [
    '流月流日证据对月令旺衰综合矩阵的影响',
    '流月流日证据对格局支持、风险和救应条件的影响',
    '流月流日喜忌、吉凶和具体事件预测',
  ],
  sources: [
    {
      id: 'project-m9-9-repeat-audit',
      title: '项目 M9-9 显隐重复证据审计',
      type: 'project_methodology',
      note: '复用同干、同十神、显隐位置和关系证据连接规则，并把关注层限定为流月、流日。',
    },
    {
      id: 'project-m9-10-transparency-root',
      title: '项目 M9-10 透干与通根条件审计',
      type: 'project_methodology',
      note: '复用完全同干、同五行支持、坐支位置和月令藏干单列规则。',
    },
    {
      id: 'project-m9-11-hidden-touch',
      title: '项目 M9-11 藏干触达条件审计',
      type: 'project_methodology',
      note: '复用完全同干动态表层、同支重复和明确地支关系三类入口。',
    },
    {
      id: 'project-m9-15-five-layer-segments',
      title: '项目 M9-15 五层动态关系证据审计',
      type: 'project_methodology',
      note: '所有候选绑定指定流日的真实五层节点、关系条件与精确时间片段。',
    },
  ],
};
