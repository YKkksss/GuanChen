import type { BaziTransparencyRootMethodology } from './transparency-root-types';

export const BAZI_TRANSPARENCY_ROOT_METHODOLOGY_VERSION = 'bazi-transparency-root-condition-audit-v1';
export const BAZI_TRANSPARENCY_ROOT_ENGINE_VERSION = 'bazi-transparency-root-engine-v1';

/** M9-10 只裁审可观察的同干与同五行位置条件，不裁决力量、真假根、格局或吉凶。 */
export const BAZI_TRANSPARENCY_ROOT_METHODOLOGY: BaziTransparencyRootMethodology = {
  schemaVersion: 1,
  version: BAZI_TRANSPARENCY_ROOT_METHODOLOGY_VERSION,
  engineVersion: BAZI_TRANSPARENCY_ROOT_ENGINE_VERSION,
  status: 'transparency_root_condition_evidence_audit',
  label: '岁运透干与通根条件证据审计方法 v1',
  policy: {
    upstreamPolicy: 'consume_versioned_repeat_clusters_and_dynamic_occurrences',
    transparencyPolicy: 'exact_hidden_stem_to_surface_stem_in_same_segment',
    monthCommandPolicy: 'label_natal_month_hidden_stem_separately',
    rootPolicy: 'separate_exact_same_stem_from_same_element_support',
    selfSeatPolicy: 'same_node_exact_hidden_only',
    dynamicPolicy: 'require_dynamic_occurrence_in_each_candidate',
    crossLuckPolicy: 'audit_each_actual_timeline_segment',
    scoringPolicy: 'no_strength_weight_no_fortune_verdict',
  },
  deterministicOutputs: [
    '逐个动态相关藏干检查同片段是否存在完全同干的表层天干或日主参照',
    '月支藏干的透出匹配与其他地支藏干的广义同干匹配分开标记',
    '逐个动态相关表层天干检查完全同干藏干与仅同五行藏干支持',
    '同节点表层与藏干完全同干时单独标记坐支同干位置',
    '所有完全同干匹配回指 M9-9 同干簇，条件缺失也明确保留',
  ],
  prohibitedClaims: [
    '把同干透出条件匹配直接解释为透干有效、得力、成格或已经发生作用',
    '把完全同干根或同五行支持折算为强根、弱根、真假根或旺衰分数',
    '把坐支同干位置直接称为坐根有力或力量增强',
    '把藏干与岁运同见直接解释为藏干发动、引动或现实事件发生',
    '从透干与根气位置直接推导喜忌、吉凶、人物、领域或具体事件',
  ],
  deferredRules: [
    '根气远近、月令旺衰、刑冲合害和季节对根气有效性的综合权重',
    '透干后的清浊、有情无情、格局成败和用神裁决',
    '真假根、墓库根、余气根及不同流派的等级体系',
    '藏干引动、作用优先级、大运流年吉凶和具体事件预测',
  ],
  sources: [
    {
      id: 'ziping-zhenquan-month-command-transparency',
      title: '《子平真诠评注》杂气章',
      type: 'classical_text',
      url: 'https://ctext.org/wiki.pl?chapter=974137&if=gb',
      note: '用于核对月令藏干透出天干的经典示例；本项目只提取同干位置条件，不继承格局吉凶裁决。',
    },
    {
      id: 'ditiansui-root-and-hidden-stems',
      title: '《滴天髓》及《滴天髓阐微》',
      type: 'classical_text',
      url: 'https://zh.wikisource.org/zh-hans/%E6%BB%B4%E5%A4%A9%E9%AB%93/02',
      note: '用于核对通根用语及一支可藏一至三干、本气优先的结构边界，不用于量化强弱。',
    },
    {
      id: 'lunar-java-visible-hidden-stems',
      title: '6tail lunar-java EightChar 官方实现',
      type: 'official_implementation',
      url: 'https://github.com/6tail/lunar-java/blob/master/src/main/java/com/nlf/calendar/EightChar.java',
      note: '用于核对表层天干、地支藏干和藏干十神的数据分离口径。',
    },
    {
      id: 'project-m9-9-repeat-clusters',
      title: '项目 M9-9 岁运十神显隐重复证据审计',
      type: 'project_methodology',
      note: '完全同干的表层与藏干匹配必须回指 M9-9 同干簇，并沿用实际跨运片段。',
    },
  ],
};
