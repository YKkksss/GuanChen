import {
  BAZI_INTERPRETATION_ENGINE_VERSION,
  BAZI_INTERPRETATION_METHODOLOGY_VERSION,
} from './interpretation-methodology';
import type {
  BaziBranchInteraction,
  BaziInterpretationEvidence,
  BaziInterpretationResult,
  BaziPatternCandidate,
  BaziRelationRole,
  BaziRootEvidence,
  BaziStrengthAssessment,
  BaziUsefulGodMethodAudit,
} from './interpretation-types';
import type { BaziCalculationResult, BaziElement, BaziPillar } from './types';

const STEM_ELEMENTS: Record<string, BaziElement> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};
const MAIN_QI_STEMS: Record<string, string> = {
  子: '癸', 丑: '己', 寅: '甲', 卯: '乙', 辰: '戊', 巳: '丙',
  午: '丁', 未: '己', 申: '庚', 酉: '辛', 戌: '戊', 亥: '壬',
};
const GENERATES: Record<BaziElement, BaziElement> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CONTROLS: Record<BaziElement, BaziElement> = { 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' };
const STORAGE_BRANCHES = new Set(['辰', '戌', '丑', '未']);
const WINTER_BRANCHES = new Set(['亥', '子', '丑']);
const SUMMER_BRANCHES = new Set(['巳', '午', '未']);
const PATTERN_LABELS: Record<string, string> = {
  正官: '正官格候选', 七杀: '七杀格候选', 正财: '正财格候选', 偏财: '偏财格候选',
  正印: '正印格候选', 偏印: '偏印格候选', 食神: '食神格候选', 伤官: '伤官格候选',
  比肩: '建禄格候选', 劫财: '月劫格候选',
};

export function analyzeBaziInterpretation(chart: BaziCalculationResult): BaziInterpretationResult {
  const pillars = [chart.pillars.year, chart.pillars.month, chart.pillars.day, chart.pillars.time]
    .filter((pillar): pillar is BaziPillar => pillar !== null);
  const interactions = detectBranchInteractions(pillars);
  const strength = auditStrength(chart, pillars, interactions);
  const pattern = auditPattern(chart, pillars, interactions);
  const usefulGod = auditUsefulGod(chart, strength.assessment, pattern.candidates[0] ?? null);
  const warnings = [
    '本结果是传统命理规则的证据审计，不是科学测量，也不使用伪精确旺衰分数。',
    '候选格局不等于成格；候选元素不等于最终用神、喜神或忌神。',
    ...chart.completeness === 'partial_unknown_time'
      ? ['出生时辰未知，时柱可能补充根气、透干或改变刑冲会合，结论已降级。']
      : [],
    ...interactions.some(item => item.involvesMonthBranch)
      ? ['月支参与刑冲会合候选；首版只记录结构，不自动认定合化、解冲或变格。']
      : [],
  ];
  return {
    methodologyVersion: BAZI_INTERPRETATION_METHODOLOGY_VERSION,
    engineVersion: BAZI_INTERPRETATION_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    capabilities: {
      strengthEvidenceAudit: true,
      patternCandidates: true,
      usefulGodMethodSeparation: true,
      finalStrengthVerdict: false,
      patternSuccessFailure: false,
      finalUsefulGod: false,
      luckCycles: false,
      predictions: false,
    },
    strength,
    pattern: {
      monthBranch: pattern.monthBranch,
      isStorageMonth: pattern.isStorageMonth,
      candidates: pattern.candidates,
      interactions,
      requiresManualReview: pattern.requiresManualReview,
      boundary: '格局只按月令本气、透干和结构冲突生成候选；尚不判断成格、破格、救应、纯杂或高低。',
    },
    usefulGod,
    warnings,
  };
}

function auditStrength(
  chart: BaziCalculationResult,
  pillars: BaziPillar[],
  interactions: BaziBranchInteraction[],
) {
  const dayElement = chart.dayMaster.element;
  const month = chart.pillars.month;
  const mainQiStem = MAIN_QI_STEMS[month.branch];
  const mainQiElement = requireStemElement(mainQiStem);
  const monthRelation = relationToDayMaster(dayElement, mainQiElement);
  const evidence: BaziInterpretationEvidence[] = [{
    id: 'month_command',
    label: `月令本气为${mainQiStem}${mainQiElement}`,
    detail: `月支${month.branch}以${mainQiStem}为本气，与日主${chart.dayMaster.stem}${dayElement}形成${relationLabel(monthRelation)}关系。月令优先，但不是唯一结论。`,
    side: isSupport(monthRelation) ? 'support' : 'drain_or_control',
    importance: 'primary',
    pillar: month.label,
    branch: month.branch,
    stem: mainQiStem,
    relation: monthRelation,
  }];
  const roots: BaziRootEvidence[] = [];
  for (const pillar of pillars) {
    pillar.hiddenStems.forEach((hidden, index) => {
      if (hidden.element !== dayElement) return;
      const grade = index === 0 ? 'main_qi' : index === 1 ? 'secondary_qi' : 'residual_qi';
      roots.push({ pillar: pillar.label, branch: pillar.branch, hiddenStem: hidden.stem, grade });
      evidence.push({
        id: `root_${pillar.key}_${hidden.stem}_${index}`,
        label: `${pillar.label}${pillar.branch}中见${hidden.stem}${dayElement}根气`,
        detail: `${hidden.stem}位于${grade === 'main_qi' ? '本气' : grade === 'secondary_qi' ? '中气' : '余气'}；只记录实际藏干，不以地支表面五行代替通根。`,
        side: 'support',
        importance: grade === 'main_qi' ? 'primary' : 'secondary',
        pillar: pillar.label,
        branch: pillar.branch,
        stem: hidden.stem,
        relation: 'peer',
      });
    });
  }

  const nonDayPillars = pillars.filter(pillar => pillar.key !== 'day');
  let visibleSupportCount = 0;
  let visiblePressureCount = 0;
  for (const pillar of nonDayPillars) {
    const relation = relationToDayMaster(dayElement, pillar.stemElement);
    if (isSupport(relation)) visibleSupportCount += 1;
    else visiblePressureCount += 1;
    evidence.push({
      id: `visible_${pillar.key}_${pillar.stem}`,
      label: `${pillar.label}透${pillar.stem}${pillar.stemElement}（${pillar.stemTenGod}）`,
      detail: `该天干相对日主属于${relationLabel(relation)}，作为${isSupport(relation) ? '生扶' : '泄耗制'}证据记录。`,
      side: isSupport(relation) ? 'support' : 'drain_or_control',
      importance: 'secondary',
      pillar: pillar.label,
      stem: pillar.stem,
      relation,
    });
  }

  const hasMonthInteraction = interactions.some(item => item.involvesMonthBranch);
  let assessment: BaziStrengthAssessment;
  if (chart.completeness === 'partial_unknown_time') {
    assessment = 'insufficient_due_to_unknown_time';
  } else if (isSupport(monthRelation) && roots.length > 0 && visiblePressureCount < 2 && !hasMonthInteraction) {
    assessment = 'supporting_evidence_established';
  } else if (!isSupport(monthRelation) && roots.length === 0 && visibleSupportCount === 0 && !hasMonthInteraction) {
    assessment = 'draining_evidence_established';
  } else {
    assessment = 'mixed_evidence';
  }
  const labels: Record<BaziStrengthAssessment, string> = {
    supporting_evidence_established: '生扶证据较明确',
    draining_evidence_established: '泄耗制证据较明确',
    mixed_evidence: '生扶与泄耗制证据并见',
    insufficient_due_to_unknown_time: '时柱缺失，证据不足',
  };
  const rationale = [
    `月令本气对日主为${relationLabel(monthRelation)}。`,
    roots.length ? `四支共找到 ${roots.length} 处同五行实际藏干根气。` : '四支未找到日主同五行藏干根气。',
    `年、月、时天干记录为 ${visibleSupportCount} 项生扶、${visiblePressureCount} 项泄耗制证据。`,
    hasMonthInteraction ? '月支参与结构作用，因此不能直接把月令静态关系当成最终结论。' : '月支未检测到直接结构作用候选。',
  ];
  return {
    assessment,
    label: labels[assessment],
    confidence: chart.completeness === 'partial_unknown_time' || hasMonthInteraction ? 'low' as const : 'medium' as const,
    monthBranch: month.branch,
    monthMainQiStem: mainQiStem,
    monthRelation,
    roots,
    evidence,
    rationale,
    boundary: '该标签只描述当前证据分布，不等于最终身强身弱判定；未使用固定旺衰分数。',
  };
}

function auditPattern(
  chart: BaziCalculationResult,
  pillars: BaziPillar[],
  interactions: BaziBranchInteraction[],
) {
  const month = chart.pillars.month;
  const isStorageMonth = STORAGE_BRANCHES.has(month.branch);
  const mainQiStem = MAIN_QI_STEMS[month.branch];
  const monthInteraction = interactions.some(item => item.involvesMonthBranch);
  const visible = pillars.filter(pillar => pillar.key !== 'day');
  const candidates: BaziPatternCandidate[] = [];
  month.hiddenStems.forEach((hidden, index) => {
    const sourceQi = hidden.stem === mainQiStem ? 'main_qi' : index <= 1 ? 'secondary_qi' : 'residual_qi';
    const transparentAt = visible.filter(pillar => pillar.stem === hidden.stem).map(pillar => pillar.label);
    if (sourceQi !== 'main_qi' && !transparentAt.length) return;
    const reviewRequired = isStorageMonth || monthInteraction || sourceQi !== 'main_qi';
    const status = reviewRequired
      ? 'review_required' as const
      : transparentAt.length ? 'supported_candidate' as const : 'candidate' as const;
    const reasons = [
      sourceQi === 'main_qi' ? `${hidden.stem}是月支${month.branch}本气。` : `${hidden.stem}是月支${month.branch}的${sourceQi === 'secondary_qi' ? '中气' : '余气'}并已透干。`,
      transparentAt.length ? `在${transparentAt.join('、')}透出。` : '本气未在年、月、时天干透出。',
      ...(isStorageMonth ? ['辰戌丑未按杂气月处理，必须比较藏干透出、会合和制化。'] : []),
      ...(monthInteraction ? ['月支参与刑冲会合候选，不能自动认定原候选保持不变。'] : []),
    ];
    candidates.push({
      label: PATTERN_LABELS[hidden.tenGod] ?? `${hidden.tenGod}候选`,
      tenGod: hidden.tenGod,
      sourceStem: hidden.stem,
      sourceQi,
      transparentAt,
      status,
      reasons,
    });
  });
  return {
    monthBranch: month.branch,
    isStorageMonth,
    candidates,
    requiresManualReview: isStorageMonth || monthInteraction || candidates.some(item => item.status === 'review_required'),
  };
}

function auditUsefulGod(
  chart: BaziCalculationResult,
  strength: BaziStrengthAssessment,
  pattern: BaziPatternCandidate | null,
) {
  const dayElement = chart.dayMaster.element;
  const peer = dayElement;
  const resource = findElement(element => GENERATES[element] === dayElement);
  const output = GENERATES[dayElement];
  const wealth = CONTROLS[dayElement];
  const officer = findElement(element => CONTROLS[element] === dayElement);
  const methods: BaziUsefulGodMethodAudit[] = [{
    method: 'month_command_pattern',
    label: '月令格局法',
    status: pattern ? 'candidate_direction' : 'withheld',
    candidateElements: pattern ? [requireStemElement(pattern.sourceStem)] : [],
    candidateRoles: pattern ? [pattern.tenGod] : [],
    rationale: pattern
      ? [`以月令候选“${pattern.label}”作为格局语义中的用神入口。`, '仍须检查成败、救应、纯杂和制化。']
      : ['月令尚未形成可记录候选。'],
    boundary: '这里的“用神”沿用《子平真诠》的月令格局语义，不等于补偏所需的某个五行。',
  }];

  if (strength === 'supporting_evidence_established') {
    methods.push({
      method: 'balancing', label: '扶抑法', status: 'candidate_direction',
      candidateElements: uniqueElements([output, wealth, officer]),
      candidateRoles: ['食伤', '财', '官杀'],
      rationale: ['当前生扶证据较明确，因此只列泄、耗、制三个后续筛选方向。', '三个方向不能同时直接称为用神，仍需检查流通、格局和调候冲突。'],
      boundary: '这是扶抑候选方向，不是最终用神或喜忌结论。',
    });
  } else if (strength === 'draining_evidence_established') {
    methods.push({
      method: 'balancing', label: '扶抑法', status: 'candidate_direction',
      candidateElements: uniqueElements([resource, peer]), candidateRoles: ['印', '比劫'],
      rationale: ['当前泄耗制证据较明确，因此只列生助两个后续筛选方向。', '仍需检查是否存在从化、格局和调候等反例。'],
      boundary: '这是扶抑候选方向，不是最终用神或喜忌结论。',
    });
  } else {
    methods.push({
      method: 'balancing', label: '扶抑法', status: 'withheld', candidateElements: [], candidateRoles: [],
      rationale: ['当前证据混合或时柱缺失，暂不产生扶抑候选元素。'],
      boundary: '证据不足时必须留空，不能为了完整性强行选择用神。',
    });
  }

  const monthBranch = chart.pillars.month.branch;
  const isWinter = WINTER_BRANCHES.has(monthBranch);
  const isSummer = SUMMER_BRANCHES.has(monthBranch);
  methods.push({
    method: 'climate', label: '调候法', status: 'reference_pending',
    candidateElements: isWinter ? ['火'] : isSummer ? ['水'] : [],
    candidateRoles: [],
    rationale: isWinter
      ? ['出生在亥子丑寒季，首版只标记温暖方向；具体仍须按日干与月份查核调候原表。']
      : isSummer
        ? ['出生在巳午未热季，首版只标记润燥降温方向；具体仍须按日干与月份查核调候原表。']
        : ['春秋调候必须结合具体日干、月令和全局，首版不自动给出元素。'],
    boundary: '季节方向不是调候用神结论；十天干十二月规则完成版本化校勘前保持待核。',
  });
  methods.push({
    method: 'flow', label: '通关与病药法', status: 'withheld', candidateElements: [], candidateRoles: [],
    rationale: ['需要先验证两行对峙、合化、刑冲解法和全局病点，首版仅保留方法入口。'],
    boundary: '不得仅凭五行数量自动指定通关或病药用神。',
  });
  return {
    terminologyWarning: '“用神”在月令格局法、扶抑法、调候法和通关病药法中的语义不同，本项目分别保存，禁止合并成一个无来源答案。',
    methods,
    finalSelection: null,
  } as const;
}

function detectBranchInteractions(pillars: BaziPillar[]): BaziBranchInteraction[] {
  const branches = pillars.map(pillar => pillar.branch);
  const monthBranch = pillars.find(pillar => pillar.key === 'month')!.branch;
  const result: BaziBranchInteraction[] = [];
  const addPairs = (type: BaziBranchInteraction['type'], pairs: string[][]) => {
    for (const pair of pairs) {
      if (pair.every(branch => branches.includes(branch))) result.push({
        type, branches: pair, involvesMonthBranch: pair.includes(monthBranch),
        transformedElement: null, conclusion: 'detected_not_transformed',
      });
    }
  };
  addPairs('clash', [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']]);
  addPairs('six_combine', [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']]);
  const triples: Array<[BaziBranchInteraction['type'], string[], BaziElement]> = [
    ['three_harmony', ['申', '子', '辰'], '水'], ['three_harmony', ['亥', '卯', '未'], '木'],
    ['three_harmony', ['寅', '午', '戌'], '火'], ['three_harmony', ['巳', '酉', '丑'], '金'],
    ['three_meeting', ['亥', '子', '丑'], '水'], ['three_meeting', ['寅', '卯', '辰'], '木'],
    ['three_meeting', ['巳', '午', '未'], '火'], ['three_meeting', ['申', '酉', '戌'], '金'],
  ];
  for (const [type, set, element] of triples) {
    if (set.every(branch => branches.includes(branch))) result.push({
      type, branches: set, involvesMonthBranch: set.includes(monthBranch),
      transformedElement: element, conclusion: 'detected_not_transformed',
    });
  }
  return result;
}

function relationToDayMaster(day: BaziElement, other: BaziElement): BaziRelationRole {
  if (day === other) return 'peer';
  if (GENERATES[other] === day) return 'resource';
  if (GENERATES[day] === other) return 'output';
  if (CONTROLS[day] === other) return 'wealth';
  return 'officer';
}

function relationLabel(relation: BaziRelationRole): string {
  return ({ peer: '同类比劫', resource: '印星生助', output: '食伤泄气', wealth: '财星耗身', officer: '官杀制身' })[relation];
}

function isSupport(relation: BaziRelationRole): boolean {
  return relation === 'peer' || relation === 'resource';
}

function requireStemElement(stem: string): BaziElement {
  const element = STEM_ELEMENTS[stem];
  if (!element) throw new Error(`无法识别天干五行：${stem}`);
  return element;
}

function findElement(predicate: (element: BaziElement) => boolean): BaziElement {
  const elements: BaziElement[] = ['木', '火', '土', '金', '水'];
  const found = elements.find(predicate);
  if (!found) throw new Error('五行生克关系不完整');
  return found;
}

function uniqueElements(elements: BaziElement[]): BaziElement[] {
  return [...new Set(elements)];
}
