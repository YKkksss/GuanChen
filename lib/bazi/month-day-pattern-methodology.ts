import type { BaziMonthDayPatternMethodology } from './month-day-pattern-types';

export const BAZI_MONTH_DAY_PATTERN_METHODOLOGY_VERSION = 'bazi-month-day-pattern-condition-v1';
export const BAZI_MONTH_DAY_PATTERN_ENGINE_VERSION = 'bazi-month-day-pattern-engine-v1';

/** M9-18 只映射静态、岁运和流月流日条件入口，不重判格局成败或救应结果。 */
export const BAZI_MONTH_DAY_PATTERN_METHODOLOGY: BaziMonthDayPatternMethodology = {
  schemaVersion: 1,
  version: BAZI_MONTH_DAY_PATTERN_METHODOLOGY_VERSION,
  engineVersion: BAZI_MONTH_DAY_PATTERN_ENGINE_VERSION,
  status: 'month_day_pattern_condition_mapping_audit',
  label: '八字流月流日格局条件映射 v1',
  policy: {
    upstreamPolicy: 'consume_versioned_m9_13_m9_15_m9_16_m9_17_evidence',
    candidatePolicy: 'preserve_m9_13_candidates_checks_and_static_statuses',
    layerPolicy: 'separate_static_inherited_and_month_day_condition_entries',
    rolePolicy: 'visible_surface_role_coverage_without_weight',
    hiddenPolicy: 'm9_16_position_or_touch_context_only',
    relationPolicy: 'm9_15_explicit_relation_entry_without_effect_verdict',
    strengthPolicy: 'm9_17_direction_context_without_pattern_verdict',
    segmentPolicy: 'audit_each_exact_day_segment_independently',
    verdictPolicy: 'mapping_only_no_pattern_success_failure_or_rescue_completion',
    scoringPolicy: 'counts_for_traceability_only_no_pattern_score',
  },
  deterministicOutputs: [
    '原样保留 M9-13 全部月令候选、条件检查、静态状态和风险救应链接，不按流日重新取格',
    '分别映射大运流年既有表层角色、流月流日新增表层角色及合并后的规则角色组覆盖',
    '任一角色、角色组齐见、缺项、五合入口和月支关系入口均复用 M9-13 规则描述',
    'M9-15 明确关系只作为结构入口，M9-16 藏干位置与触达只作为条件上下文',
    'M9-17 静态与动态方向只作为身用承载背景，不参与格局条件状态裁决',
    '同一流日跨节或跨运时逐片段映射，前后角色与结构证据不得累计',
  ],
  prohibitedClaims: [
    '把流月流日角色覆盖称为某日已经成格、格局成立、格局转强或格局升级',
    '把风险角色或月支关系入口称为某日已经破格、格局失败或格局受损',
    '把救应角色、天干五合或月支会合入口称为已经救应、合去、解冲或完成制化',
    '用动态角色、关系、藏干、触达或方向数量计算格局分数、成功率、层次或净值',
    '把缺项规则在动态层的角色出现解释为已经修复原局缺项或改写 M9-13 静态状态',
    '从格局条件映射指定最终用神喜忌、吉凶、富贵贫贱或具体事件',
  ],
  deferredRules: [
    '动态层角色进入后对十干十二月逐格成败的完整时序条件树',
    '天干五合、地支会合对原局格局条件的实际作用、优先级和持续区间',
    '身用承载、根气深浅、清浊纯杂和相神在动态层的权重裁决',
    '最终格局成败、救应完成、用神喜忌、吉凶和具体事件推断',
  ],
  sources: [
    {
      id: 'project-m9-13-pattern-condition',
      title: '项目 M9-13 格局成败、破格与救应条件证据审计',
      type: 'project_methodology',
      note: '提供不可改写的月令候选、静态条件状态、规则匹配语义和风险救应链接。',
    },
    {
      id: 'project-m9-15-five-layer-relation',
      title: '项目 M9-15 指定流日五层关系与十神角色',
      type: 'project_methodology',
      note: '提供每个精确片段的大运、流年、流月、流日表层角色和明确关系入口。',
    },
    {
      id: 'project-m9-16-visibility-root-touch',
      title: '项目 M9-16 流月流日显隐、透根与藏干触达条件',
      type: 'project_methodology',
      note: '提供与流月流日有关的藏干位置和触达上下文，不裁决实际发动。',
    },
    {
      id: 'project-m9-17-strength-composite',
      title: '项目 M9-17 流月流日旺衰综合证据矩阵',
      type: 'project_methodology',
      note: '提供静态、岁运既有与流月流日新增方向背景，不作为格局成败条件。',
    },
  ],
};
