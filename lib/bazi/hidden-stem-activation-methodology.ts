import type { BaziHiddenStemActivationMethodology } from './hidden-stem-activation-types';

export const BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY_VERSION = 'bazi-hidden-stem-touch-condition-audit-v1';
export const BAZI_HIDDEN_STEM_ACTIVATION_ENGINE_VERSION = 'bazi-hidden-stem-activation-engine-v2';

/** M9-11 只审计藏干被哪些已版本化条件触达，不裁决发动、力量、作用结果或应事。 */
export const BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY: BaziHiddenStemActivationMethodology = {
  schemaVersion: 1,
  version: BAZI_HIDDEN_STEM_ACTIVATION_METHODOLOGY_VERSION,
  engineVersion: BAZI_HIDDEN_STEM_ACTIVATION_ENGINE_VERSION,
  status: 'hidden_stem_touch_condition_evidence_audit',
  label: '岁运藏干引动条件证据审计方法 v1',
  policy: {
    upstreamPolicy: 'consume_versioned_relation_dynamic_repeat_and_transparency_evidence',
    surfacePolicy: 'exact_same_stem_dynamic_surface_in_same_segment',
    branchRepeatPolicy: 'same_branch_distinct_node_with_dynamic_participant',
    relationPolicy: 'explicit_branch_relation_evidence_with_adjudication_state',
    targetPolicy: 'audit_each_actual_hidden_stem_occurrence',
    crossLuckPolicy: 'audit_each_actual_timeline_segment',
    scoringPolicy: 'no_activation_strength_effect_or_fortune_verdict',
  },
  entryLabels: {
    exact_dynamic_surface_same_stem: '完全同干岁运表层触达',
    same_branch_repeat: '同支重复触达',
    explicit_branch_relation: '明确冲合刑害关系触达',
  },
  deterministicOutputs: [
    '逐个实际藏干位置审计，不把同一地支内的多个藏干合并成一个结论',
    '完全同干入口只接受同片段的大运或流年表层，并回指 M9-9 与 M9-10',
    '同支重复要求不同节点同支且至少一方属于大运或流年',
    '冲合刑害入口只消费 M9-6 明确地支关系及 M9-7 条件状态',
    '同一流年跨交运时按实际片段分别审计，不跨段拼接入口条件',
  ],
  prohibitedClaims: [
    '把任一触达条件直接称为藏干已经引动、发动、透出或产生作用',
    '按触达入口数量折算藏干力量、旺衰增减、真假或作用优先级',
    '把刑冲一律解释为冲开墓库、把合刑害一律解释为有效发动',
    '从藏干触达条件直接推导人物、领域、喜忌、吉凶或具体事件',
  ],
  deferredRules: [
    '不同流派对冲、合、刑、害能否引动及其先后次序的裁决',
    '月令司令、藏干本中余气、透干与通根对有效性的综合权重',
    '墓库开闭、合化、制化、解冲及关系并见时的作用结果',
    '藏干发动后的强弱、作用对象、吉凶层级与现实事件映射',
  ],
  sources: [
    {
      id: 'ditiansui-branch-motion-boundary',
      title: '《滴天髓》地支章',
      type: 'classical_text',
      url: 'https://zh.wikisource.org/zh-hans/%E6%BB%B4%E5%A4%A9%E9%AB%93/03',
      note: '用于核对冲、刑、害的传统“动不动”争议；本版本因此只记录关系触达，不统一裁决发动。',
    },
    {
      id: 'ziping-zhenquan-relation-coexistence',
      title: '《子平真诠评注》论刑冲会合解法',
      type: 'classical_text',
      url: 'https://ctext.org/wiki.pl?chapter=974137&if=gb',
      note: '用于核对刑冲会合可能并见、相解或反得刑冲的复杂性；本版本保留 M9-7 状态而不自定优先级。',
    },
    {
      id: 'project-m9-6-m9-7-relations',
      title: '项目 M9-6／M9-7 干支关系与条件裁决',
      type: 'project_methodology',
      note: '所有冲合刑害触达必须回指既有关系证据与条件状态。',
    },
    {
      id: 'project-m9-9-m9-10-visibility',
      title: '项目 M9-9／M9-10 显隐重复与透出条件',
      type: 'project_methodology',
      note: '完全同干岁运表层触达必须回指同干簇与透出候选，不能重新计算。',
    },
  ],
};
