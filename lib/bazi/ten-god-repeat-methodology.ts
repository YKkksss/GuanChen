import type { BaziTenGodRepeatMethodology } from './ten-god-repeat-types';

export const BAZI_TEN_GOD_REPEAT_METHODOLOGY_VERSION = 'bazi-ten-god-visibility-repeat-audit-v1';
export const BAZI_TEN_GOD_REPEAT_ENGINE_VERSION = 'bazi-ten-god-repeat-engine-v1';

/** M9-9 只审计显隐位置与重复关系，不裁决透干、通根、强弱、吉凶或事件。 */
export const BAZI_TEN_GOD_REPEAT_METHODOLOGY: BaziTenGodRepeatMethodology = {
  schemaVersion: 1,
  version: BAZI_TEN_GOD_REPEAT_METHODOLOGY_VERSION,
  engineVersion: BAZI_TEN_GOD_REPEAT_ENGINE_VERSION,
  status: 'ten_god_visibility_repeat_evidence_audit',
  label: '岁运十神组合与显隐重复证据审计 v1',
  policy: {
    upstreamPolicy: 'consume_versioned_dynamic_ten_god_and_relation_evidence',
    occurrencePolicy: 'preserve_surface_hidden_and_day_master_reference',
    clusterPolicy: 'require_dynamic_occurrence_and_at_least_two_occurrences',
    visibilityPolicy: 'coexistence_only_no_transparency_or_root_verdict',
    connectionPolicy: 'exact_surface_participants_from_relation_evidence_only',
    crossLuckPolicy: 'audit_each_actual_timeline_segment',
    scoringPolicy: 'counts_only_no_strength_or_fortune_weight',
  },
  repeatPatterns: {
    surface_cross_layer_repeat: '跨层表层同干',
    surface_hidden_coexistence: '表层与藏干同见',
    hidden_cross_layer_repeat: '跨层藏干同见',
    annual_luck_repeat: '流年与大运同见',
  },
  deterministicOutputs: [
    '逐个保留原局、大运、流年的表层天干、藏干与日主参照位置',
    '同一天干至少出现两次且包含动态层时生成同干重复簇',
    '同一十神至少出现两次且包含动态层时生成同十神重复簇',
    '分别标记跨层表层同干、表层与藏干同见、跨层藏干同见和流年大运同见',
    '只有 M9-6 天干证据的精确表层参与节点才能形成证据连接',
  ],
  prohibitedClaims: [
    '把表层与藏干同见直接宣告为透干、通根或藏干引动',
    '把重复次数折算为力量倍数、旺衰增减或吉凶分数',
    '把同一十神重复直接映射为人物、领域或具体事件',
    '把没有 M9-6 表层参与证据的重复簇称为已经发生作用',
    '把流年和大运同见解释为事件必然叠加或重复发生',
  ],
  deferredRules: [
    '透干、通根、坐根和藏干引动的条件裁决',
    '月令、旺衰、格局和取用对重复角色的权重影响',
    '多个十神组合的生克制化与优先级',
    '十神对应人物、领域、吉凶和具体事件的解释',
  ],
  sources: [
    {
      id: 'lunar-java-eight-char-visible-hidden-roles',
      title: '6tail lunar-java EightChar 官方实现',
      type: 'official_implementation',
      url: 'https://github.com/6tail/lunar-java/blob/master/src/main/java/com/nlf/calendar/EightChar.java',
      note: '官方接口分别返回柱天干十神和地支藏干十神，项目据此保持表层与藏干数据分离。',
    },
    {
      id: 'project-m9-8-dynamic-ten-god-evidence',
      title: '项目 M9-8 动态十神与作用方向证据审计',
      type: 'project_methodology',
      note: '所有动态角色复用 M9-8 版本，证据连接继续追溯到 M9-6 关系证据。',
    },
  ],
};
