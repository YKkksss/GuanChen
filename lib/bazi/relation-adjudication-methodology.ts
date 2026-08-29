import type { BaziRelationAdjudicationMethodology } from './relation-adjudication-types';

export const BAZI_RELATION_ADJUDICATION_METHODOLOGY_VERSION = 'bazi-relation-condition-conflict-audit-v1';
export const BAZI_RELATION_ADJUDICATION_ENGINE_VERSION = 'bazi-relation-adjudication-engine-v1';

/** M9-7 只裁决证据状态，不裁决合化、关系优先级、强弱或吉凶。 */
export const BAZI_RELATION_ADJUDICATION_METHODOLOGY: BaziRelationAdjudicationMethodology = {
  schemaVersion: 1,
  version: BAZI_RELATION_ADJUDICATION_METHODOLOGY_VERSION,
  engineVersion: BAZI_RELATION_ADJUDICATION_ENGINE_VERSION,
  status: 'condition_conflict_audit',
  label: '关系条件与冲突裁决审计 v1',
  policy: {
    upstreamPolicy: 'consume_versioned_relation_evidence',
    partialSetPolicy: 'record_two_of_three_as_missing_condition',
    transformationPolicy: 'review_gate_only_no_transformation_verdict',
    conflictPolicy: 'coexistence_without_priority_verdict',
    positionPolicy: 'record_natal_adjacency_without_strength_weight',
    scoringPolicy: 'no_numeric_score_no_fortune_weight',
    crossLuckPolicy: 'adjudicate_each_actual_timeline_segment',
  },
  stemTransformationGates: [
    { pair: '甲己', targetElement: '土', supportingMonths: ['辰', '戌', '丑', '未', '午'], competingStem: '戊' },
    { pair: '乙庚', targetElement: '金', supportingMonths: ['巳', '酉', '丑', '申'], competingStem: '甲' },
    { pair: '丙辛', targetElement: '水', supportingMonths: ['申', '子', '辰', '亥'], competingStem: '丁' },
    { pair: '丁壬', targetElement: '木', supportingMonths: ['亥', '卯', '未', '寅'], competingStem: '丙' },
    { pair: '戊癸', targetElement: '火', supportingMonths: ['寅', '午', '戌', '巳'], competingStem: '己' },
  ],
  threeMemberSets: {
    branchThreeHarmony: ['申子辰', '亥卯未', '寅午戌', '巳酉丑'],
    branchThreeMeeting: ['亥子丑', '寅卯辰', '巳午未', '申酉戌'],
    branchThreePunishment: ['寅巳申', '丑戌未'],
  },
  deterministicOutputs: [
    '复核 M9-6 每条条件型关系的结构成员与真实时间片段',
    '天干五合记录月支支持与妒合干是否出现',
    '三字集合出现两个成员时记录缺失成员，不冒充完整关系',
    '记录原局参与柱位是否相邻，但不折算力量权重',
    '同一参与节点命中多种地支关系时记录关系并见',
    '输出条件齐备、条件缺失、关系并见或暂缓裁决四种证据状态',
  ],
  prohibitedClaims: [
    '把可核验条件齐备直接宣告为合化成功',
    '在关系并见时自动宣告合、冲、刑、害中的任何一项优先',
    '把柱位邻近或间隔折算为力量分数',
    '把缺一个成员的三字候选称为三合、三会或三刑成立',
    '从条件状态直接推导旺衰、喜忌、吉凶或具体事件',
  ],
  deferredRules: [
    '合化后的五行强弱、真假化与最终化气裁决',
    '刑冲合害并见时的力量大小、次序、解冲和破合裁决',
    '藏干、透干、月令、格局、用神与岁运作用的综合权重',
    '大运流年吉凶和具体事件预测',
  ],
  sources: [
    {
      id: 'sanming-tonghui-transformation-gates',
      title: '《三命通会》卷二·论十干化气',
      type: 'classical_text',
      url: 'https://zh.wikisource.org/zh-hans/%E4%B8%89%E5%91%BD%E9%80%9A%E6%9C%83/%E5%8D%B7%E4%BA%8C',
      note: '用于记录五合的月支支持和妒合干入口条件；本项目不据此自动宣告化气成立。',
    },
    {
      id: 'sanming-tonghui-three-harmony-completeness',
      title: '《三命通会》卷二·论支元三合',
      type: 'classical_text',
      url: 'https://zh.wikisource.org/zh-hans/%E4%B8%89%E5%91%BD%E9%80%9A%E6%9C%83/%E5%8D%B7%E4%BA%8C',
      note: '用于三字齐全与缺一不成局的结构边界。',
    },
    {
      id: 'project-m9-6-relation-evidence',
      title: '项目跨层干支关系证据审计 v1',
      type: 'project_methodology',
      note: '所有裁决必须绑定 M9-6 的版本化证据和真实跨运片段。',
    },
  ],
};
