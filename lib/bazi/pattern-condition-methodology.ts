import type { BaziPatternConditionMethodology } from './pattern-condition-types';

export const BAZI_PATTERN_CONDITION_METHODOLOGY_VERSION = 'bazi-pattern-condition-audit-v1';
export const BAZI_PATTERN_CONDITION_ENGINE_VERSION = 'bazi-pattern-condition-engine-v1';

/** M9-13 只审计成格支持、破格风险和救应候选条件，不输出格局成败或高低。 */
export const BAZI_PATTERN_CONDITION_METHODOLOGY: BaziPatternConditionMethodology = {
  schemaVersion: 1,
  version: BAZI_PATTERN_CONDITION_METHODOLOGY_VERSION,
  engineVersion: BAZI_PATTERN_CONDITION_ENGINE_VERSION,
  status: 'pattern_formation_breaking_rescue_condition_evidence_audit',
  label: '格局成败、破格与救应条件证据审计方法 v1',
  policy: {
    upstreamPolicy: 'consume_versioned_m9_3_candidate_and_m9_12_static_baseline',
    candidatePolicy: 'preserve_every_month_command_candidate_without_ranking',
    layerPolicy: 'natal_chart_only',
    visibilityPolicy: 'separate_surface_hidden_structural_and_upstream_context',
    rescuePolicy: 'link_rescue_candidate_to_observed_or_unresolved_breaking_risk',
    combinationPolicy: 'position_condition_only_no_resolution_verdict',
    unknownTimePolicy: 'mark_absence_dependent_checks_unknown',
    verdictPolicy: 'condition_evidence_only_no_pattern_success_failure',
    scoringPolicy: 'counts_for_traceability_only_no_pattern_score',
  },
  archetypeLabels: {
    direct_officer: '正官格路径', wealth: '财格路径', seal: '印格路径', food_god: '食神格路径',
    seven_killings: '七杀格路径', hurting_officer: '伤官格路径', yang_blade: '阳刃格路径',
    build_prosperity: '建禄格路径', month_robbery: '月劫格路径',
  },
  deterministicOutputs: [
    '逐一保留 M9-3 的月令格局候选、来源藏干、气级、透出位置和上游状态',
    '分别记录成格支持条件、破格风险条件及其对应救应候选，不合并成最终结论',
    '表层天干、藏干、月支结构和 M9-12 静态旺衰标签分层展示',
    '完全同干五合或地支会合只记位置条件，不宣告合去、解冲或救应完成',
    '阳日主月令劫财且落在开放刃位表时，单列阳刃路径；其余保留月劫路径',
    '所有依赖未见某角色的条件在时柱未知时降级为未知，不把缺失资料当作缺失事实',
  ],
  prohibitedClaims: [
    '把条件证据齐备直接称为已经成格、格局成立或格局清纯',
    '把某项破格风险证据直接称为已经破格、格局失败或格局全无',
    '把救应候选五合、会合或角色同见直接称为已经救应、合去或解冲',
    '按条件条数计算格局分数、成功率、层次、富贵贫贱或吉凶等级',
    '把格局路径直接指定为最终用神、喜神、忌神、职业、财富、婚姻或健康事件',
    '把原局条件审计外推为大运流年对格局的成败变化',
  ],
  deferredRules: [
    '十干十二月逐格细则、相神、有情无情、清浊纯杂和位置先后完整规则树',
    '财官印食煞伤劫刃各格强弱、根深根浅和身用承载的权重裁决',
    '天干五合能否合去、地支会合能否解冲以及多关系优先次序',
    '阴日刃位、墓库杂气取格、化气从格与专旺等流派差异的版本化裁决',
    '格局高低、最终用神喜忌、岁运成败、吉凶和具体事件推断',
  ],
  sources: [
    {
      id: 'ziping-zhenquan-pattern-success-failure-rescue',
      title: '《子平真诠评注》论用神成败救应',
      type: 'classical_text',
      url: 'https://ctext.org/wiki.pl?chapter=974137&if=gb',
      note: '用于抽取官、财、印、食、煞、伤、刃、禄劫的成败与救应条件骨架；本项目将其拆成条件证据，不继承富贵吉凶结论。',
    },
    {
      id: 'sanming-tonghui-six-pattern-outline',
      title: '《三命通会》卷五论古人立印食官财名义',
      type: 'classical_text',
      url: 'https://zh.wikisource.org/wiki/%E4%B8%89%E5%91%BD%E9%80%9A%E6%9C%83/%E5%8D%B7%E4%BA%94',
      note: '用于核对财官印食及生克制化的格局纲领；具体条件仍以版本化规则表为准。',
    },
    {
      id: 'project-m9-3-m9-12-pattern-chain',
      title: '项目 M9-3 至 M9-12 版本化证据链',
      type: 'project_methodology',
      note: '候选只取 M9-3，静态旺衰上下文只取 M9-12；M9-13 不重新排盘、不重算旺衰，也不混入岁运。',
    },
  ],
};
