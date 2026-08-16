import type { LifeEventCategory } from '@/lib/events/types';
import type {
  RectificationMethodology,
  RectificationTimeSlotDefinition,
  RectificationTopicMapping,
} from './types';

export const RECTIFICATION_METHODOLOGY_VERSION = 'rectification-method-v1';
export const RECTIFICATION_TIME_POLICY_VERSION = 'rectification-time-v1';

const TIME_SLOTS: RectificationTimeSlotDefinition[] = [
  { key: 'early_zi', label: '早子时', branchIndex: 0, engineTimeIndex: 0, apparentSolarStart: '00:00', apparentSolarEnd: '00:59', ziSegment: 'early' },
  { key: 'chou', label: '丑时', branchIndex: 1, engineTimeIndex: 1, apparentSolarStart: '01:00', apparentSolarEnd: '02:59', ziSegment: null },
  { key: 'yin', label: '寅时', branchIndex: 2, engineTimeIndex: 2, apparentSolarStart: '03:00', apparentSolarEnd: '04:59', ziSegment: null },
  { key: 'mao', label: '卯时', branchIndex: 3, engineTimeIndex: 3, apparentSolarStart: '05:00', apparentSolarEnd: '06:59', ziSegment: null },
  { key: 'chen', label: '辰时', branchIndex: 4, engineTimeIndex: 4, apparentSolarStart: '07:00', apparentSolarEnd: '08:59', ziSegment: null },
  { key: 'si', label: '巳时', branchIndex: 5, engineTimeIndex: 5, apparentSolarStart: '09:00', apparentSolarEnd: '10:59', ziSegment: null },
  { key: 'wu', label: '午时', branchIndex: 6, engineTimeIndex: 6, apparentSolarStart: '11:00', apparentSolarEnd: '12:59', ziSegment: null },
  { key: 'wei', label: '未时', branchIndex: 7, engineTimeIndex: 7, apparentSolarStart: '13:00', apparentSolarEnd: '14:59', ziSegment: null },
  { key: 'shen', label: '申时', branchIndex: 8, engineTimeIndex: 8, apparentSolarStart: '15:00', apparentSolarEnd: '16:59', ziSegment: null },
  { key: 'you', label: '酉时', branchIndex: 9, engineTimeIndex: 9, apparentSolarStart: '17:00', apparentSolarEnd: '18:59', ziSegment: null },
  { key: 'xu', label: '戌时', branchIndex: 10, engineTimeIndex: 10, apparentSolarStart: '19:00', apparentSolarEnd: '20:59', ziSegment: null },
  { key: 'hai', label: '亥时', branchIndex: 11, engineTimeIndex: 11, apparentSolarStart: '21:00', apparentSolarEnd: '22:59', ziSegment: null },
  { key: 'late_zi', label: '晚子时', branchIndex: 0, engineTimeIndex: 12, apparentSolarStart: '23:00', apparentSolarEnd: '23:59', ziSegment: 'late' },
];

const TOPIC_MAPPINGS: RectificationTopicMapping[] = [
  topic('education', '学业', ['官禄宫', '命宫'], ['福德宫', '父母宫'], '沿用项目专题路由，将学习过程与目标表现分层观察。'),
  topic('career', '工作与创业', ['官禄宫', '命宫'], ['财帛宫', '迁移宫'], '观察职业角色、行动方向及外部环境，不推断具体职位。'),
  topic('finance', '财务', ['财帛宫', '田宅宫'], ['官禄宫', '福德宫'], '观察资源与积累主题，不推断收益、损失或投资结果。'),
  topic('relationship', '感情与婚姻', ['夫妻宫', '命宫'], ['福德宫', '迁移宫'], '观察关系主题进入时间轴，不把激活等同于结婚或分手。'),
  topic('children', '生育与亲子', ['子女宫', '田宅宫'], ['夫妻宫', '福德宫'], '仅用于用户已经确认的亲子事件，不预测怀孕或生育结果。'),
  topic('relocation', '搬迁与出行', ['迁移宫', '田宅宫'], ['命宫', '官禄宫'], '观察居住与外部环境变化。'),
  topic('family', '家庭事件', ['父母宫', '子女宫'], ['兄弟宫', '田宅宫'], '按用户明确的家庭事件记录，不推断亲属健康或生死。'),
  topic('health', '健康事件', ['疾厄宫', '命宫'], ['福德宫', '父母宫'], '只匹配已确认事件的时间结构，不诊断疾病、不推断病因。'),
  topic('achievement', '奖项与成果', ['官禄宫', '命宫'], ['迁移宫', '福德宫'], '观察成果与公开表现主题，不推断社会地位。'),
  { category: 'custom', label: '自定义', primaryPalaces: [], secondaryPalaces: [], scoreable: false, rationale: '自定义事件必须先由用户映射到标准分类，未映射前不参与排序。' },
];

export const RECTIFICATION_METHODOLOGY: RectificationMethodology = {
  schemaVersion: 1,
  version: RECTIFICATION_METHODOLOGY_VERSION,
  label: '出生时辰候选比较方法论 V1',
  status: 'provisional',
  chartEngineVersion: 'ziwei-v1-iztro-2.5.8',
  transitEngineVersion: 'transit-v1-iztro-2.5.8',
  timePolicy: {
    version: RECTIFICATION_TIME_POLICY_VERSION,
    inputTimeScale: 'civil_time',
    outputTimeScale: 'apparent_solar_time',
    timezoneSource: 'iana_tzdb',
    equationOfTimeAlgorithm: 'noaa-fractional-year',
    longitudeConvention: 'east-positive',
    lateZiPolicy: 'iztro-late-zi-index',
    pre1970TimezonePolicy: 'manual-verification-required',
    steps: [
      '保存用户原始民用时间、地点、来源和不确定范围，不覆盖原始记录。',
      '按出生地点和出生日期查询历史 UTC 偏移与夏令时规则。',
      '使用经度修正和 NOAA 均时差公式换算地方真太阳时。',
      '按真太阳时划分早子、丑至亥和晚子共十三个引擎时段。',
      '保存时间策略、时区数据库和算法版本，确保候选可重建。',
    ],
    slots: TIME_SLOTS,
  },
  scorePolicy: {
    status: 'provisional-unvalidated',
    minimumCandidates: 2,
    maximumCandidates: 13,
    minimumConfirmedEvents: 3,
    recommendedConfirmedEvents: 5,
    minimumDistinctCategories: 2,
    recommendedDistinctCategories: 3,
    eventQualityWeights: {
      documented: 1,
      corroborated_memory: 0.85,
      single_person_memory: 0.65,
      conversation_extracted: 0.25,
      unconfirmed: 0,
    },
    datePrecisionWeights: { day: 1, month: 0.9, year: 0.75, range: 0.6, unknown: 0 },
    impactMultipliers: { 1: 0.8, 2: 0.9, 3: 1, 4: 1.1, 5: 1.2 },
    outcomeScores: { support: 1, weak_support: 0.5, neutral: 0, conflict: -1, insufficient: 0 },
    perEventAbsoluteCap: 1.5,
    perCategoryShareCap: 0.45,
    nonDiscriminatingEvidenceWeight: 0,
    displayScale: 100,
    displayLabel: '相对证据指数',
    leaveOneEventOutMinimumEvents: 4,
    stableTopCandidateRate: 0.75,
    minimumTopMarginRatio: 0.1,
    principles: [
      '分数由确定性规则计算，AI 只能解释，不能修改。',
      '相对证据指数只用于当前候选集排序，不是出生时辰正确概率。',
      '所有候选都命中的证据不具区分度，权重必须归零。',
      '同一事件的多条相关规则先聚合再封顶，避免重复计分。',
      '同类事件总贡献受限，避免大量同类事件淹没其他人生领域。',
      '没有命中传统结构默认为中性，不自动视为冲突。',
      '高影响事件不等于日期更可靠，影响程度和证据质量分别计算。',
      '事件足够时执行留一事件重算，检查第一候选是否稳定。',
    ],
  },
  topicMappings: TOPIC_MAPPINGS,
  rules: [
    rule('reported-window-contains', '出生时间记录范围', 'reported_window_contains', 'reported_time', 'support', 1, 100, ['reported_time', 'candidate_slot'], '候选落在用户记录或回忆的时间范围内；记录范围外只有在来源可靠时才形成冲突。', ['iana-tzdb', 'project-rectification-v1']),
    rule('decadal-topic-focus', '事件年份大限主题', 'decadal_topic_focus', 'decadal', 'support', 0.7, 70, ['confirmed_event', 'annual_snapshot', 'topic_mapping'], '事件年份所在大限宫位命中事件专题宫位时形成支持证据。', ['project-m1-transit', 'project-m2-life-events']),
    rule('annual-flow-topic-focus', '流年命宫专题落点', 'annual_flow_topic_focus', 'annual_flow', 'support', 0.75, 75, ['confirmed_event', 'annual_snapshot', 'topic_mapping'], '流年命宫落入事件专题宫位时形成支持证据。', ['project-m1-transit']),
    rule('annual-key-palace-topic-focus', '年度重点宫位专题命中', 'annual_key_palace_topic_focus', 'annual_key_palace', 'support', 0.65, 65, ['confirmed_event', 'annual_snapshot', 'topic_mapping'], '年度三方四正或四化重点宫位与事件专题宫位相交时形成支持证据。', ['project-m1-transit']),
    rule('annual-transformation-topic-focus', '年度四化专题命中', 'annual_transformation_topic_focus', 'annual_transformation', 'weak_support', 0.45, 55, ['confirmed_event', 'annual_snapshot', 'topic_mapping'], '年度四化落在事件专题宫位时只形成弱支持，不按禄权科忌直接推断吉凶事件。', ['project-m1-transit']),
    rule('multi-layer-convergence', '多层证据汇合', 'multi_layer_convergence', 'convergence', 'support', 0.35, 80, ['two_independent_rule_layers'], '同一事件至少两个独立层同时命中时增加有限汇合证据，且仍受单事件上限约束。', ['project-rectification-v1']),
    rule('insufficient-event-guard', '事件不足保护', 'insufficient_event_guard', 'safety', 'insufficient', 0, 100, ['confirmed_events', 'distinct_categories'], '事件数量或类别不足时禁止给出稳定候选。', ['rubin-baddeley-1989', 'tripod-plus-ai']),
    rule('indistinguishable-candidate-guard', '候选不可区分保护', 'indistinguishable_candidate_guard', 'safety', 'insufficient', 0, 100, ['candidate_scores', 'discriminating_evidence'], '候选差距不足或缺少区分证据时并列展示，不强行选出第一名。', ['tripod-plus-ai', 'project-rectification-v1']),
  ],
  allowedEvidence: [
    '用户保存的原始时间来源与不确定范围',
    'IANA 历史时区和夏令时偏移',
    '经度修正与 NOAA 均时差计算结果',
    '候选命盘的程序化宫位、星曜、本命四化和大限事实',
    '项目年度运限引擎生成的流年命宫、四化和重点宫位',
    '用户明确确认且带日期精度的人生事件',
    '候选之间真正不同的结构化规则命中',
  ],
  forbiddenEvidence: [
    '发旋数量或位置',
    '出生姿势或婴儿睡姿',
    '外貌、身高、体型或疤痕反推',
    '仅凭性格描述匹配时辰',
    'AI 直觉分、AI 自行补算命盘或修改规则分',
    '未经用户确认的聊天推断',
    '把未命中规则直接当作反证',
    '混入未声明的其他流派飞化或自化规则',
  ],
  prohibitedClaims: [
    '百分百准确', '唯一正确时辰', '已经确定真实时辰', '绝对就是', '肯定是这个时辰',
    '命中率百分之百', '科学证明', '医学证明', '注定', '必然发生',
  ],
  sources: [
    { id: 'noaa-solar-equations', title: 'NOAA General Solar Position Calculations', type: 'official_documentation', url: 'https://gml.noaa.gov/grad/solcalc/solareqns.PDF', note: '用于经度、时区偏移和均时差组成的真太阳时换算公式。' },
    { id: 'iana-tzdb', title: 'IANA Time Zone Database', type: 'official_documentation', url: 'https://www.iana.org/time-zones/tz-link', note: '用于历史民用时间的 UTC 偏移和夏令时规则；1970 年前需要额外人工核验。' },
    { id: 'iztro-2.5.8', title: 'iztro 官方文档 2.5.x', type: 'official_documentation', url: 'https://docs.iztro.com/quick-start', note: '确认阳历排盘接受 0 至 12 的时辰序号，区分早子与晚子。' },
    { id: 'rubin-baddeley-1989', title: 'Telescoping is not time compression', type: 'research_paper', url: 'https://pubmed.ncbi.nlm.nih.gov/2811662/', note: '支持对回忆事件日期设置独立精度和证据质量权重。' },
    { id: 'tripod-plus-ai', title: 'TRIPOD+AI transparent reporting principles', type: 'research_paper', url: 'https://www.tripod-statement.org/', note: '借鉴透明报告、内部验证、校准与人工监督原则；不表示本方法具备医学预测效度。' },
    { id: 'carlson-1985', title: 'A double-blind test of astrology', type: 'research_paper', url: 'https://doi.org/10.1038/318419a0', note: '该研究测试的是西方占星人格匹配，并非紫微斗数校时；用于提醒产品不得把传统命理评分宣传为科学概率。' },
    { id: 'project-m1-transit', title: '项目 M1 年度运限方法', type: 'project_methodology', note: '复用确定性年度快照，不让 AI 计算流年事实。' },
    { id: 'project-m2-life-events', title: '项目 M2 人生事件方法', type: 'project_methodology', note: '复用事件分类、日期精度、用户确认和年度关联。' },
    { id: 'project-rectification-v1', title: '项目 M5-0 校时安全方法', type: 'project_methodology', note: '定义候选比较、证据去重、封顶、稳定性和不可区分保护。' },
    { id: 'traditional-rectification-reference', title: '现代紫微斗数定生时资料', type: 'traditional_reference', note: '仅用于识别行业常见做法和争议；发旋、姿势、外貌等方法不进入 V1 规则。' },
  ],
};

function topic(
  category: Exclude<LifeEventCategory, 'custom'>,
  label: string,
  primaryPalaces: RectificationTopicMapping['primaryPalaces'],
  secondaryPalaces: RectificationTopicMapping['secondaryPalaces'],
  rationale: string,
): RectificationTopicMapping {
  return { category, label, primaryPalaces, secondaryPalaces, scoreable: true, rationale };
}

function rule(
  id: string,
  name: string,
  kind: RectificationMethodology['rules'][number]['kind'],
  layer: RectificationMethodology['rules'][number]['layer'],
  outcome: RectificationMethodology['rules'][number]['outcome'],
  baseWeight: number,
  priority: number,
  requiredInputs: string[],
  description: string,
  sourceIds: string[],
): RectificationMethodology['rules'][number] {
  return { id, version: 1, name, kind, layer, outcome, baseWeight, priority, requiredInputs, description, sourceIds, enabled: true };
}

export function getRectificationTopicMapping(category: LifeEventCategory): RectificationTopicMapping {
  return RECTIFICATION_METHODOLOGY.topicMappings.find(item => item.category === category)!;
}

export function getRectificationTimeSlot(key: RectificationMethodology['timePolicy']['slots'][number]['key']): RectificationTimeSlotDefinition {
  return RECTIFICATION_METHODOLOGY.timePolicy.slots.find(item => item.key === key)!;
}
