import type { BaziRelationAuditMethodology } from './relation-audit-types';

export const BAZI_RELATION_AUDIT_METHODOLOGY_VERSION = 'bazi-relation-evidence-audit-v1';
export const BAZI_RELATION_AUDIT_ENGINE_VERSION = 'bazi-relation-audit-engine-v1';

/** M9-6 只记录原局、大运、流年的可核对关系，不解释关系吉凶。 */
export const BAZI_RELATION_AUDIT_METHODOLOGY: BaziRelationAuditMethodology = {
  schemaVersion: 1,
  version: BAZI_RELATION_AUDIT_METHODOLOGY_VERSION,
  engineVersion: BAZI_RELATION_AUDIT_ENGINE_VERSION,
  status: 'evidence_audit',
  label: '原局—大运—流年作用关系证据审计 v1',
  policy: {
    layerPolicy: 'natal_luck_annual_segment',
    pairScope: 'cross_layer_only',
    setRule: 'full_members_required',
    transformationPolicy: 'detected_not_transformed',
    scoringPolicy: 'no_numeric_score_no_fortune_weight',
    unknownTimePolicy: 'omit_time_pillar_and_mark_partial',
    crossLuckPolicy: 'audit_each_actual_timeline_segment',
  },
  relationSets: {
    stemFiveCombine: ['甲己', '乙庚', '丙辛', '丁壬', '戊癸'],
    branchSixCombine: ['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未'],
    branchClash: ['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥'],
    branchHarm: ['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌'],
    branchMutualPunishment: ['子卯'],
    branchSelfPunishment: ['辰', '午', '酉', '亥'],
    branchThreeHarmony: ['申子辰', '亥卯未', '寅午戌', '巳酉丑'],
    branchThreeMeeting: ['亥子丑', '寅卯辰', '巳午未', '申酉戌'],
    branchThreePunishment: ['寅巳申', '丑戌未'],
  },
  deterministicOutputs: [
    '逐个真实流年—大运时间片段建立参与节点',
    '记录跨层天干同类、生、克和五合',
    '记录跨层地支六合、六冲、六害、子卯刑和自刑',
    '成员齐全时记录三合、三会和三刑结构',
    '保存参与柱位、命中规则、作用范围和未判化边界',
  ],
  prohibitedClaims: [
    '把合关系直接宣告为合化成功',
    '把检测到的刑冲合害数量折算为吉凶分数',
    '不检查参与柱位便描述大运或流年作用',
    '从单条结构关系直接推导健康、财富、婚姻、事业或具体事件',
    '时柱未知时补造时柱参与关系',
  ],
  deferredRules: [
    '天干五合和地支会合的完整化气成立条件',
    '刑冲合害并见时的力量、远近、次序和解法裁决',
    '藏干引动、透干、旺衰、格局与用神的综合作用',
    '关系证据的吉凶解释和具体事件预测',
  ],
  sources: [
    {
      id: 'sanming-tonghui-stem-combine',
      title: '《三命通会》卷二·论十干合',
      type: 'classical_text',
      url: 'https://zh.wikisource.org/zh-hans/%E4%B8%89%E5%91%BD%E9%80%9A%E6%9C%83/%E5%8D%B7%E4%BA%8C',
      note: '用于天干五合配对；本项目只记录配对，不采纳人物或吉凶断语。',
    },
    {
      id: 'sanming-tonghui-three-harmony',
      title: '《三命通会》卷二·论支元三合',
      type: 'classical_text',
      url: 'https://zh.wikisource.org/zh-hans/%E4%B8%89%E5%91%BD%E9%80%9A%E6%9C%83/%E5%8D%B7%E4%BA%8C',
      note: '用于三合成员齐全规则；原文明确缺一不按三合化局论。',
    },
    {
      id: 'lihai-six-combine-harm',
      title: '《蠡海集》六合与六害条',
      type: 'classical_text',
      url: 'https://zh.wikisource.org/zh-hans/%E8%A0%A1%E6%B5%B7%E9%9B%86_%28%E5%9B%9B%E5%BA%AB%E5%85%A8%E6%9B%B8%E6%9C%AC%29',
      note: '用于六合与六害配对关系。',
    },
    {
      id: 'project-m9-5-timeline',
      title: '项目流年确定性时间轴方法 v1',
      type: 'project_methodology',
      note: '所有关系按 M9-5 已持久化的真实跨运时间片段分别审计。',
    },
  ],
};
