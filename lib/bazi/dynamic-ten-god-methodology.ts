import type { BaziDynamicTenGodMethodology } from './dynamic-ten-god-types';

export const BAZI_DYNAMIC_TEN_GOD_METHODOLOGY_VERSION = 'bazi-dynamic-ten-god-direction-audit-v1';
export const BAZI_DYNAMIC_TEN_GOD_ENGINE_VERSION = 'bazi-dynamic-ten-god-engine-v1';

/** M9-8 只记录动态十神角色与有上游证据的原局指向，不推导强弱、喜忌、吉凶或事件。 */
export const BAZI_DYNAMIC_TEN_GOD_METHODOLOGY: BaziDynamicTenGodMethodology = {
  schemaVersion: 1,
  version: BAZI_DYNAMIC_TEN_GOD_METHODOLOGY_VERSION,
  engineVersion: BAZI_DYNAMIC_TEN_GOD_ENGINE_VERSION,
  status: 'dynamic_role_direction_evidence_audit',
  label: '动态十神与作用方向证据审计 v1',
  policy: {
    tenGodReference: 'day_master_stem',
    hiddenStemPolicy: 'role_metadata_only_no_activation_claim',
    hiddenQiPolicy: 'ordered_main_secondary_residual',
    directionPolicy: 'consume_versioned_cross_layer_relation_evidence',
    targetPolicy: 'natal_pillar_only',
    adjudicationPolicy: 'attach_existing_condition_state_without_reinterpreting',
    crossLuckPolicy: 'audit_each_actual_timeline_segment',
    scoringPolicy: 'no_numeric_score_no_strength_or_fortune_weight',
  },
  tenGodNames: ['比肩', '劫财', '食神', '伤官', '偏财', '正财', '七杀', '正官', '偏印', '正印'],
  hiddenStemOrder: {
    子: ['癸'], 丑: ['己', '癸', '辛'], 寅: ['甲', '丙', '戊'], 卯: ['乙'],
    辰: ['戊', '乙', '癸'], 巳: ['丙', '庚', '戊'], 午: ['丁', '己'], 未: ['己', '丁', '乙'],
    申: ['庚', '壬', '戊'], 酉: ['辛'], 戌: ['戊', '辛', '丁'], 亥: ['壬', '甲'],
  },
  deterministicOutputs: [
    '大运和流年表层天干相对日主的十神角色',
    '大运和流年地支藏干的本气、中气、余气顺序及十神角色',
    '只从 M9-6 关系证据提取动态天干或地支指向的原局具体柱位',
    '方向证据附带 M9-7 已有条件状态，不重新解释条件或优先级',
    '跨运流年按真实时间片段分别生成角色和方向快照',
  ],
  prohibitedClaims: [
    '把十神名称直接映射为必然人物、事件或吉凶结果',
    '把地支中存在的藏干宣告为已经透出、发动或引动',
    '把关系证据中的指向解释为力量大小、强弱变化或作用结果',
    '从动态十神直接推导喜忌、最终用神、大运流年吉凶或具体事件',
    '脱离 M9-6 关系证据自行补充原局作用目标',
  ],
  deferredRules: [
    '藏干在岁运中的透出、引动和实际作用条件',
    '十神组合、重复透出、通根与月令的综合权重',
    '动态十神对旺衰、格局和取用结果的影响',
    '十神对应人物、领域、吉凶与具体事件的解释',
  ],
  sources: [
    {
      id: 'lunar-java-eight-char-ten-god',
      title: '6tail lunar-java EightChar 官方实现',
      type: 'official_implementation',
      url: 'https://github.com/6tail/lunar-java/blob/master/src/main/java/com/nlf/calendar/EightChar.java',
      note: '用于复核日干与其他天干的十神映射，以及地支藏干顺序的数据来源口径。',
    },
    {
      id: 'sanming-tonghui-ten-god-relation',
      title: '《三命通会》卷七·十神关系',
      type: 'classical_text',
      url: 'https://zh.wikisource.org/zh-hans/%E4%B8%89%E5%91%BD%E9%80%9A%E6%9C%83/%E5%8D%B7%E4%B8%83',
      note: '用于核对生我、我生、克我、我克、同类的关系命名；不采用人物和吉凶断语。',
    },
    {
      id: 'project-m9-6-m9-7-evidence-lineage',
      title: '项目 M9-6 关系证据与 M9-7 条件审计',
      type: 'project_methodology',
      note: '所有作用方向绑定上游关系证据，并只附着既有条件状态。',
    },
  ],
};
