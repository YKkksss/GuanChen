import type { BaziStrengthCompositeMethodology } from './strength-composite-types';

export const BAZI_STRENGTH_COMPOSITE_METHODOLOGY_VERSION = 'bazi-month-command-strength-composite-v2';
export const BAZI_STRENGTH_COMPOSITE_ENGINE_VERSION = 'bazi-strength-composite-engine-v1';

/** M9-12 只组合静态与岁运证据方向，不裁决最终旺衰、权重、喜忌或吉凶。 */
export const BAZI_STRENGTH_COMPOSITE_METHODOLOGY: BaziStrengthCompositeMethodology = {
  schemaVersion: 1,
  version: BAZI_STRENGTH_COMPOSITE_METHODOLOGY_VERSION,
  engineVersion: BAZI_STRENGTH_COMPOSITE_ENGINE_VERSION,
  status: 'month_command_strength_composite_evidence_audit_v2',
  label: '月令与旺衰综合条件证据审计方法 v2',
  policy: {
    upstreamPolicy: 'consume_versioned_m9_3_and_m9_8_to_m9_11_evidence',
    baselinePolicy: 'preserve_static_assessment_without_reclassification',
    dynamicSurfacePolicy: 'classify_visible_ten_god_direction_without_weight',
    hiddenPolicy: 'position_or_touch_condition_only_no_activation',
    monthCommandPolicy: 'preserve_touch_types_and_relation_states_without_strength_effect',
    rootPolicy: 'day_master_root_condition_only_no_strength_grade',
    comparisonPolicy: 'direction_comparison_not_final_strength',
    crossLuckPolicy: 'audit_each_actual_timeline_segment',
    scoringPolicy: 'counts_for_traceability_only_no_numeric_strength_score',
  },
  familyLabels: {
    month_command_baseline: '月令静态基线',
    natal_root: '原局实际根气',
    natal_surface: '原局表层损益',
    dynamic_surface: '岁运表层方向',
    dynamic_hidden_position: '岁运藏干位置',
    day_master_root_condition: '日主根气条件',
    month_command_touch: '月令藏干触达条件',
  },
  deterministicOutputs: [
    '完整保留 M9-3 静态旺衰证据标签，不在岁运层重新判定原局',
    '大运与流年表层十神只分生扶或泄耗制方向，不设置数量权重',
    '岁运藏干只作为位置或触达条件上下文，不冒充已经发动的力量',
    '日主严格同干根与同五行支持只回指 M9-10 条件，不评定根气等级',
    '月令藏干触达类型与关系条件状态回指 M9-11，不推导月令增强或受损',
    '静态与动态只比较方向同向、异向或并见，不改写为最终身强身弱',
  ],
  prohibitedClaims: [
    '按证据条数、藏干数量、本中余气或触达入口计算旺衰分数和百分比',
    '把静态与动态方向同向直接解释为日主变强、变弱或旺衰已经确定',
    '把月令被冲合刑害触达直接解释为提纲受损、解冲、合化或月令失效',
    '把岁运藏干位置或触达条件直接算作已经生扶、泄耗或制克的力量',
    '从综合矩阵直接指定最终用神、喜神、忌神、吉凶或具体事件',
  ],
  deferredRules: [
    '月令司令分日、节气深浅及旺相休囚的可验证版本',
    '各类实际根气、透干、盖头截脚和远近位置的流派权重',
    '刑冲合害对月令与根气产生何种强弱结果的条件树',
    '从格、专旺、化气等特殊格局对常规扶抑逻辑的改写条件',
    '最终旺衰、格局成败、用神喜忌、岁运吉凶与事件推断',
  ],
  sources: [
    {
      id: 'ziping-zhenquan-timing-not-exclusive',
      title: '《子平真诠评注》论十干得时不旺失时不弱',
      type: 'classical_text',
      url: 'https://ctext.org/wiki.pl?chapter=974137&if=gb',
      note: '用于月令优先但不能执一而论的边界；本阶段保留月令基线，同时列出年、日、时和岁运证据。',
    },
    {
      id: 'ditiansui-strength-root-context',
      title: '《滴天髓阐微》衰旺章',
      type: 'classical_text',
      url: 'https://zh.wikisource.org/zh-hant/%E6%BB%B4%E5%A4%A9%E9%AB%93%E9%97%A1%E5%BE%AE',
      note: '用于核对得时仍需全局损益、失令仍需通根的传统论述；不将古籍案例量化为现代评分。',
    },
    {
      id: 'ditiansui-body-use',
      title: '《滴天髓》体用章',
      type: 'classical_text',
      url: 'https://zh.wikisource.org/zh-hant/%E6%BB%B4%E5%A4%A9%E9%AB%93/10',
      note: '用于核对提纲与年月时损益需结合观察；本阶段只建立方向矩阵，不进入喜用裁决。',
    },
    {
      id: 'project-m9-3-m9-11-evidence-chain',
      title: '项目 M9-3 与 M9-8 至 M9-11 版本化证据链',
      type: 'project_methodology',
      note: '综合矩阵只消费既有静态标签、动态角色、透根条件和藏干触达结果，不重新排盘或改写上游。',
    },
  ],
};
