import type { BaziInterpretationMethodology } from './interpretation-types';

export const BAZI_INTERPRETATION_METHODOLOGY_VERSION = 'bazi-interpretation-audit-v1';
export const BAZI_INTERPRETATION_ENGINE_VERSION = 'bazi-analysis-engine-v1';

/**
 * M9-3 首版只形成可追溯的证据审计，不把不同流派压成一个伪精确分数。
 */
export const BAZI_INTERPRETATION_METHODOLOGY: BaziInterpretationMethodology = {
  schemaVersion: 1,
  version: BAZI_INTERPRETATION_METHODOLOGY_VERSION,
  engineVersion: BAZI_INTERPRETATION_ENGINE_VERSION,
  status: 'evidence_audit',
  label: '旺衰、格局与用神证据审计方法 v1',
  strengthPolicy: {
    outputMode: 'evidence_balance_without_numeric_score',
    monthCommandPriority: 'primary_not_exclusive',
    rootPolicy: 'hidden_stem_actual_root',
    unknownTimePolicy: 'downgrade_to_insufficient',
    allowedAssessments: [
      'supporting_evidence_established',
      'draining_evidence_established',
      'mixed_evidence',
      'insufficient_due_to_unknown_time',
    ],
  },
  patternPolicy: {
    primaryBasis: 'month_branch_main_qi',
    transparencyPolicy: 'record_only_no_auto_transformation',
    storageMonthPolicy: 'multi_candidate_manual_review',
    interactionPolicy: 'detect_without_assuming_transformation',
    allowedStatuses: ['supported_candidate', 'candidate', 'review_required'],
  },
  usefulGodPolicy: {
    separateMethods: ['month_command_pattern', 'balancing', 'climate', 'flow'],
    terminologyPolicy: 'never_merge_pattern_and_balancing_meanings',
    outputMode: 'candidate_direction_only',
  },
  prohibitedClaims: [
    '用单一五行数量或固定加权分数判定身强身弱',
    '把得令直接等同于身旺或把失令直接等同于身弱',
    '忽略通根、透干、刑冲会合和全局制化',
    '把月令格局用神与扶抑用神混为一个概念',
    '在藏干透出和会合变化未核实时宣告成格或破格',
    '把候选元素称为最终用神、喜神或忌神',
    '从静态原局证据直接推导大运流年与具体吉凶',
  ],
  deferredRules: [
    '逐日人元司令分野和交接时刻',
    '天干五合是否化气的完整成立条件',
    '地支三合三会六合的化局成立与解冲次序',
    '格局成败、救应、纯杂和高低的完整规则树',
    '穷通宝鉴十天干十二月调候表的版本化校勘',
    '病药、通关和从化专旺等特殊取用规则',
    '大运、流年和具体事件推断',
  ],
  sources: [
    {
      id: 'ziping-zhenquan-original',
      title: '《子平真诠》原本',
      author: '沈孝瞻',
      period: '清',
      url: 'https://www.vr-d.com/pdf-file/%E5%91%BD%E7%90%86/%E5%AD%90%E5%B9%B3%E7%9C%9F%E8%AF%A0%E5%8E%9F%E6%9C%AC.pdf',
      scope: 'pattern',
      note: '用于月令取格、得时不等于必旺、失时不等于必弱，以及通根重于干上比助等规则边界。',
    },
    {
      id: 'ditiansui-chanwei-wikisource',
      title: '《滴天髓阐微》',
      author: '任铁樵注',
      period: '清',
      url: 'https://zh.wikisource.org/wiki/%E6%BB%B4%E5%A4%A9%E9%AB%93%E9%97%A1%E5%BE%AE',
      scope: 'strength',
      note: '用于月令提纲、根气、全局气势和损益不能一偏而求的证据原则。',
    },
    {
      id: 'sanming-tonghui-month-command',
      title: '《三命通会》卷十·看命口诀一',
      author: '万民英',
      period: '明',
      url: 'https://www.gushiwen.cn/guwen/bookv_c3f9151be6c8.aspx',
      scope: 'pattern',
      note: '用于先看月支、月令透出与月令无可用时再看他格的候选顺序。',
    },
    {
      id: 'qiongtong-baojian-wikisource',
      title: '《穷通宝鉴》',
      author: '余春台整理',
      period: '清',
      url: 'https://zh.wikisource.org/zh-hans/%E7%A9%B7%E9%80%9A%E5%AE%9D%E9%89%B4',
      scope: 'climate',
      note: '用于调候方法独立建模；首版只标记寒暖燥湿方向，不冒充十干十二月精细取用。',
    },
  ],
};
