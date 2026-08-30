import type { BaziMonthDayRelationMethodology } from './month-day-relation-types';

export const BAZI_MONTH_DAY_RELATION_METHODOLOGY_VERSION = 'bazi-month-day-relation-audit-v1';
export const BAZI_MONTH_DAY_RELATION_ENGINE_VERSION = 'bazi-month-day-relation-engine-v1';

/** M9-15 只审计指定流日的五层关系、条件状态与十神角色，不解释吉凶。 */
export const BAZI_MONTH_DAY_RELATION_METHODOLOGY: BaziMonthDayRelationMethodology = {
  schemaVersion: 1,
  version: BAZI_MONTH_DAY_RELATION_METHODOLOGY_VERSION,
  engineVersion: BAZI_MONTH_DAY_RELATION_ENGINE_VERSION,
  status: 'five_layer_dynamic_evidence_audit',
  label: '八字流月流日五层动态关系证据审计 v1',
  policy: {
    layerPolicy: 'natal_luck_annual_month_day',
    datePolicy: 'one_version_per_effective_date',
    segmentPolicy: 'audit_each_exact_day_segment',
    evidencePolicy: 'reuse_m9_6_and_require_month_or_day_participant',
    conditionPolicy: 'structural_gate_and_coexistence_no_priority',
    tenGodPolicy: 'reuse_m9_8_day_master_mapping',
    hiddenStemPolicy: 'role_metadata_only_no_activation_claim',
    scoringPolicy: 'no_numeric_score_no_strength_or_fortune_weight',
  },
  deterministicOutputs: [
    '指定流日每个精确片段内的原局、大运、流年、流月、流日节点',
    '至少包含流月或流日参与者的 M9-6 干支关系证据',
    '完整关系、三字缺一和关系并见的条件状态',
    '大运、流年、流月、流日表层与藏干的十神角色',
    '动态节点通过已有关系证据指向原局柱位的链接',
  ],
  prohibitedClaims: [
    '把关系证据或条件齐备解释为合化、解冲、破合或关系优先级结论',
    '把流月流日十神直接映射为人物、财富、婚姻、事业、健康或事件',
    '从证据条数计算力量、旺衰、喜忌、吉凶分数或概率',
    '把藏干角色宣告为已经透出、引动、发动或产生实际作用',
    '把跨节或跨运流日的证据跨片段混用',
  ],
  deferredRules: [
    '流月流日层的显隐重复、透干、通根和藏干触达条件',
    '五层证据对旺衰、格局和取用的影响',
    '流月流日吉凶与具体事件预测',
  ],
  sources: [
    {
      id: 'project-m9-6-relation-catalog',
      title: '项目 M9-6 干支关系证据目录',
      type: 'project_methodology',
      note: '直接复用天干生克五合、地支冲合刑害、三合三会三刑规则，不另建第二套目录。',
    },
    {
      id: 'project-m9-7-condition-state',
      title: '项目 M9-7 条件与关系并见语义',
      type: 'project_methodology',
      note: '复用条件齐备、条件缺失、关系并见和暂缓裁决状态，并保持不判合化和优先级。',
    },
    {
      id: 'project-m9-8-ten-god-mapping',
      title: '项目 M9-8 动态十神映射',
      type: 'project_methodology',
      note: '所有动态十神继续以原局日主为唯一参照，藏干仅作角色元数据。',
    },
    {
      id: 'project-m9-14-exact-day-segment',
      title: '项目 M9-14 流月流日精确时间轴',
      type: 'project_methodology',
      note: '每条证据绑定流日内部真实的流月与大运时间片段。',
    },
  ],
};
