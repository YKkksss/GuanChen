import {
  BAZI_PATTERN_CONDITION_ENGINE_VERSION,
  BAZI_PATTERN_CONDITION_METHODOLOGY,
  BAZI_PATTERN_CONDITION_METHODOLOGY_VERSION,
} from './pattern-condition-methodology';
import type { BaziTenGodName } from './dynamic-ten-god-types';
import type { BaziBranchInteraction, BaziInterpretationResult, BaziPatternCandidate } from './interpretation-types';
import type {
  BaziPatternArchetype,
  BaziPatternCandidateConditionAudit,
  BaziPatternConditionCheck,
  BaziPatternConditionEvidence,
  BaziPatternConditionKind,
  BaziPatternConditionResult,
  BaziPatternConditionStatus,
  BaziPatternReviewFlag,
} from './pattern-condition-types';
import type { BaziStrengthCompositeResult } from './strength-composite-types';
import type { BaziCalculationResult, BaziPillar } from './types';

type RoleMatchMode = 'any_role' | 'all_roles' | 'absence' | 'stem_combine' | 'month_relation_rescue';
type VisibilityPolicy = 'surface_required' | 'surface_or_hidden';

interface RuleDefinition {
  id: string;
  label: string;
  detail: string;
  roles: BaziTenGodName[];
  match: RoleMatchMode;
  visibility: VisibilityPolicy;
  linkedBreakingRuleIds?: string[];
}

interface RuleSet {
  formation: RuleDefinition[];
  breaking: RuleDefinition[];
  rescue: RuleDefinition[];
}

interface NatalRoleOccurrence extends BaziPatternConditionEvidence {
  tenGod: BaziTenGodName;
}

const STEM_COMBINE_PARTNER: Record<string, string> = {
  甲: '己', 己: '甲', 乙: '庚', 庚: '乙', 丙: '辛', 辛: '丙', 丁: '壬', 壬: '丁', 戊: '癸', 癸: '戊',
};
const YANG_BLADE_BRANCH: Record<string, string> = { 甲: '卯', 丙: '午', 戊: '午', 庚: '酉', 壬: '子' };
const WEALTH: BaziTenGodName[] = ['正财', '偏财'];
const SEAL: BaziTenGodName[] = ['正印', '偏印'];
const OUTPUT: BaziTenGodName[] = ['食神', '伤官'];
const OFFICER_KILL: BaziTenGodName[] = ['正官', '七杀'];
const PEER_ROB: BaziTenGodName[] = ['比肩', '劫财'];

const RULES: Record<BaziPatternArchetype, RuleSet> = {
  direct_officer: {
    formation: [
      role('official-formation-wealth', '财星生官支持条件', '检查原局是否见财星表层角色，作为官格成格路径的一项支持条件。', WEALTH),
      role('official-formation-seal', '印星护官支持条件', '检查原局是否见印星表层角色，作为官格成格路径的一项支持条件。', SEAL),
    ],
    breaking: [
      role('official-break-hurting', '伤官克官风险条件', '检查伤官是否与正官候选并见；这里只标记风险入口。', ['伤官'], 'surface_or_hidden'),
      role('official-break-seven-killings', '官杀混杂风险条件', '检查七杀是否在表层与正官候选并见。', ['七杀']),
    ],
    rescue: [
      rescueRole('official-rescue-seal', '印星制伤救应候选', '伤官风险出现时，检查印星是否提供可继续复核的救应入口。', SEAL, ['official-break-hurting']),
      rescueCombine('official-rescue-combine-kill', '合杀留官救应候选', '七杀风险出现时，检查原局表层是否存在与七杀天干相合的位置条件。', ['七杀'], ['official-break-seven-killings']),
      rescueRelation('official-rescue-month-relation', '会合解月支结构救应候选', '月支参与结构关系时，检查是否另见六合、三合或三会位置；不裁决是否真正解冲。'),
    ],
  },
  wealth: {
    formation: [
      role('wealth-formation-output', '食伤生财支持条件', '检查食神或伤官是否在表层出现，作为财格生发路径的支持条件。', OUTPUT),
      role('wealth-formation-officer', '财生官支持条件', '检查正官是否在表层出现，作为财格另一条成格支持路径。', ['正官']),
    ],
    breaking: [
      role('wealth-break-peer-rob', '比劫夺财风险条件', '检查比肩、劫财是否与财格候选并见；不比较数量和力量。', PEER_ROB, 'surface_or_hidden'),
      role('wealth-break-seven-killings', '财格露杀风险条件', '检查七杀是否在表层出现；是否形成实质破格仍待制化复核。', ['七杀']),
    ],
    rescue: [
      rescueRole('wealth-rescue-output', '食伤化劫生财救应候选', '比劫风险出现时，检查食伤是否提供通向财星的救应入口。', OUTPUT, ['wealth-break-peer-rob']),
      rescueRole('wealth-rescue-officer', '生官制劫救应候选', '比劫风险出现时，检查正官是否提供制劫候选入口。', ['正官'], ['wealth-break-peer-rob']),
      rescueRole('wealth-rescue-food-controls-kill', '食神制杀护财救应候选', '七杀风险出现时，检查食神表层是否提供制杀候选入口。', ['食神'], ['wealth-break-seven-killings']),
      rescueCombine('wealth-rescue-combine-kill', '合杀存财救应候选', '七杀风险出现时，检查与七杀天干相合的位置条件。', ['七杀'], ['wealth-break-seven-killings']),
      rescueRelation('wealth-rescue-month-relation', '会合解月支结构救应候选', '月支结构风险出现时，检查并见的会合位置条件。'),
    ],
  },
  seal: {
    formation: [
      role('seal-formation-officer-kill', '官杀生印支持条件', '检查官杀是否在表层出现，作为印格的一条支持路径。', OFFICER_KILL),
      role('seal-formation-output', '食伤泄秀支持条件', '检查食伤是否在表层出现；是否适用仍依身印条件复核。', OUTPUT),
    ],
    breaking: [
      role('seal-break-wealth', '财星破印风险条件', '检查财星是否与印格候选并见；不裁决财印力量和位置优先。', WEALTH, 'surface_or_hidden'),
    ],
    rescue: [
      rescueRole('seal-rescue-peer-rob', '比劫解财护印救应候选', '财星风险出现时，检查比劫是否提供制财候选入口。', PEER_ROB, ['seal-break-wealth']),
      rescueCombine('seal-rescue-combine-wealth', '合财存印救应候选', '财星风险出现时，检查与财星天干相合的位置条件。', WEALTH, ['seal-break-wealth']),
      rescueRelation('seal-rescue-month-relation', '会合解月支结构救应候选', '月支结构风险出现时，检查并见的会合位置条件。'),
    ],
  },
  food_god: {
    formation: [
      role('food-formation-wealth', '食神生财支持条件', '检查财星是否在表层承接食神，作为食神格的一条支持路径。', WEALTH),
      role('food-formation-kill', '食神制杀支持条件', '检查七杀是否在表层出现，形成可继续复核的食神制杀路径。', ['七杀']),
    ],
    breaking: [
      role('food-break-indirect-seal', '枭神夺食风险条件', '检查偏印是否与食神候选并见。', ['偏印'], 'surface_or_hidden'),
      allRoles('food-break-wealth-kill', '生财露杀并见风险条件', '财星与七杀同时出现时，记录为需要继续核对制化的风险组合。', ['正财', '偏财', '七杀']),
    ],
    rescue: [
      rescueRole('food-rescue-wealth', '财星护食救应候选', '偏印风险出现时，检查财星是否提供制枭护食候选入口。', WEALTH, ['food-break-indirect-seal']),
      rescueRole('food-rescue-follow-kill', '就杀成局救应候选', '偏印风险出现时，检查七杀是否形成另一条待复核路径；不直接称弃食就杀成立。', ['七杀'], ['food-break-indirect-seal']),
      rescueRelation('food-rescue-month-relation', '会合解月支结构救应候选', '月支结构风险出现时，检查并见的会合位置条件。'),
    ],
  },
  seven_killings: {
    formation: [
      role('kill-formation-output-control', '食伤制杀支持条件', '检查食神或伤官是否在表层出现，作为制杀路径入口。', OUTPUT),
      role('kill-formation-seal', '印星化杀支持条件', '检查印星是否在表层出现，作为化杀路径入口。', SEAL),
    ],
    breaking: [
      role('kill-break-wealth', '财星生杀风险条件', '检查财星是否与七杀候选并见；是否无制仍需结合食伤和位置复核。', WEALTH, 'surface_or_hidden'),
      allRoles('kill-break-output-seal', '食制与印护杀并见风险条件', '食伤和印星同时出现时，只记录制化路径可能相互牵制。', ['食神', '伤官', '正印', '偏印']),
    ],
    rescue: [
      rescueRole('kill-rescue-output', '食伤制杀救应候选', '财星生杀风险出现时，检查食伤表层是否提供制杀入口。', OUTPUT, ['kill-break-wealth']),
      rescueRole('kill-rescue-wealth-removes-seal', '财星去印存食救应候选', '食制与印星并见风险出现时，检查财星是否形成去印存食候选；不裁决真实作用。', WEALTH, ['kill-break-output-seal']),
      rescueRelation('kill-rescue-month-relation', '会合解月支结构救应候选', '月支结构风险出现时，检查并见的会合位置条件。'),
    ],
  },
  hurting_officer: {
    formation: [
      role('hurting-formation-wealth', '伤官生财支持条件', '检查财星是否在表层承接伤官。', WEALTH),
      role('hurting-formation-seal', '伤官佩印支持条件', '检查印星是否在表层出现；伤印力量与根气仍待复核。', SEAL),
      role('hurting-formation-kill', '伤官驾杀支持条件', '检查七杀是否在表层出现，形成可继续复核的制杀路径。', ['七杀']),
    ],
    breaking: [
      role('hurting-break-officer', '伤官见官风险条件', '检查正官是否与伤官候选并见；金水伤官等例外仍单独待校。', ['正官'], 'surface_or_hidden'),
      allRoles('hurting-break-wealth-kill', '生财带杀并见风险条件', '财星和七杀同时出现时，记录为需要合杀等救应复核的组合。', ['正财', '偏财', '七杀']),
    ],
    rescue: [
      rescueCombine('hurting-rescue-combine-kill', '合杀救应候选', '生财带杀风险出现时，检查与七杀天干相合的位置条件。', ['七杀'], ['hurting-break-wealth-kill']),
      rescueRelation('hurting-rescue-month-relation', '会合解月支结构救应候选', '月支结构风险出现时，检查并见的会合位置条件。'),
    ],
  },
  yang_blade: {
    formation: [
      role('blade-formation-officer-kill', '官杀制刃支持条件', '检查正官或七杀是否在表层出现，作为阳刃格路径的重要支持条件。', OFFICER_KILL),
      role('blade-formation-wealth-seal', '财印辅助条件', '检查财星或印星是否在表层出现；具体辅助关系仍须结合官杀复核。', [...WEALTH, ...SEAL]),
    ],
    breaking: [
      absence('blade-break-no-officer-kill', '官杀未见风险条件', '在当前可见原局中未找到官杀角色时，记录为阳刃路径的缺项风险。', OFFICER_KILL),
      role('blade-break-output', '食伤制官杀风险条件', '官杀路径下食伤并见时，记录为需要印星护官杀的风险入口。', OUTPUT, 'surface_or_hidden'),
    ],
    rescue: [
      rescueRole('blade-rescue-seal', '印星护官杀救应候选', '食伤风险出现时，检查印星是否提供护官杀候选入口。', SEAL, ['blade-break-output']),
      rescueRelation('blade-rescue-month-relation', '会合解月支结构救应候选', '月支结构风险出现时，检查并见的会合位置条件。'),
    ],
  },
  build_prosperity: buildProsperityRules('build'),
  month_robbery: buildProsperityRules('robbery'),
};

export function auditBaziPatternConditions(
  chart: BaziCalculationResult,
  interpretation: BaziInterpretationResult,
  strengthComposite: BaziStrengthCompositeResult,
): BaziPatternConditionResult {
  const occurrences = collectNatalRoleOccurrences(chart);
  const candidates = interpretation.pattern.candidates.map((candidate, index) => auditCandidate({
    chart, interpretation, strengthComposite, occurrences, candidate, index,
  }));
  return {
    methodologyVersion: BAZI_PATTERN_CONDITION_METHODOLOGY_VERSION,
    engineVersion: BAZI_PATTERN_CONDITION_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    status: chart.completeness,
    capabilities: {
      formationConditionEvidence: true, breakingRiskEvidence: true, rescueCandidateEvidence: true,
      visibilitySeparation: true, finalPatternSuccessFailure: false, patternRank: false,
      usefulGodVerdict: false, fortuneInterpretation: false, eventPrediction: false,
    },
    source: {
      chartMethodologyVersion: chart.methodologyVersion, chartEngineVersion: chart.engineVersion,
      chartCompleteness: chart.completeness,
      interpretationMethodologyVersion: interpretation.methodologyVersion,
      interpretationEngineVersion: interpretation.engineVersion,
      strengthCompositeMethodologyVersion: strengthComposite.methodologyVersion,
      strengthCompositeEngineVersion: strengthComposite.engineVersion,
    },
    monthCommand: {
      branch: interpretation.pattern.monthBranch,
      isStorageMonth: interpretation.pattern.isStorageMonth,
      candidateCount: candidates.length,
      interactionCount: interpretation.pattern.interactions.length,
    },
    strengthContext: {
      assessment: strengthComposite.staticBaseline.assessment,
      label: strengthComposite.staticBaseline.label,
      boundary: '仅引用 M9-12 静态证据标签作为待复核上下文，不把它改写成最终身强身弱或格局承载结论。',
    },
    candidates,
    rulesApplied: BAZI_PATTERN_CONDITION_METHODOLOGY.deterministicOutputs,
    warnings: [
      '成格支持、破格风险和救应候选都是条件证据，不是格局成败判决。',
      '表层与藏干严格分开；仅藏未透不会冒充表层条件已经齐备。',
      '五合、六合、三合、三会只记位置条件，不宣告合去、解冲或救应完成。',
      ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，所有依赖“未见”的条件均已降级为未知。'] : []),
    ],
    boundary: 'M9-13 只对原局月令格局候选建立成格支持、破格风险与救应候选矩阵；不输出成格、破格、格局高低、最终用神、岁运吉凶或事件。',
  };
}

function auditCandidate(input: {
  chart: BaziCalculationResult;
  interpretation: BaziInterpretationResult;
  strengthComposite: BaziStrengthCompositeResult;
  occurrences: NatalRoleOccurrence[];
  candidate: BaziPatternCandidate;
  index: number;
}): BaziPatternCandidateConditionAudit {
  const { chart, interpretation, strengthComposite, occurrences, candidate, index } = input;
  const archetype = resolveArchetype(chart, candidate);
  const rules = RULES[archetype];
  const commonFormation = [candidateSnapshotCheck(candidate), strengthContextCheck(strengthComposite)];
  const commonBreaking = [monthInteractionCheck(interpretation.pattern.interactions)];
  const formationSupport = [...commonFormation, ...rules.formation.map(rule => evaluateRule(rule, 'formation_support', chart, occurrences, interpretation.pattern.interactions))];
  const breakingRisks = [...commonBreaking, ...rules.breaking.map(rule => evaluateRule(rule, 'breaking_risk', chart, occurrences, interpretation.pattern.interactions))];
  const riskMap = new Map(breakingRisks.map(item => [item.ruleId, item.status]));
  const rescueCandidates = rules.rescue.map(rule => {
    const linked = rule.linkedBreakingRuleIds ?? ['common-month-interaction'];
    const applicable = linked.some(ruleId => ['evidence_present', 'requires_manual_review', 'unknown_due_to_missing_time'].includes(riskMap.get(ruleId) ?? ''));
    if (!applicable) return notApplicableRescue(rule);
    return evaluateRule(rule, 'rescue_candidate', chart, occurrences, interpretation.pattern.interactions);
  });
  const allChecks = [...formationSupport, ...breakingRisks, ...rescueCandidates];
  const reviewFlags = resolveReviewFlags(chart, interpretation, candidate, archetype, allChecks);
  return {
    id: `pattern-condition-${index}-${candidate.sourceStem}-${candidate.sourceQi}`,
    label: candidate.label,
    tenGod: candidate.tenGod as BaziTenGodName,
    archetype,
    archetypeLabel: BAZI_PATTERN_CONDITION_METHODOLOGY.archetypeLabels[archetype],
    sourceStem: candidate.sourceStem,
    sourceQi: candidate.sourceQi,
    transparentAt: candidate.transparentAt,
    upstreamStatus: candidate.status,
    formationSupport,
    breakingRisks,
    rescueCandidates,
    reviewFlags,
    counts: {
      formationEvidencePresent: formationSupport.filter(item => item.status === 'evidence_present').length,
      breakingRiskEvidencePresent: breakingRisks.filter(item => item.status === 'evidence_present').length,
      rescueEvidencePresent: rescueCandidates.filter(item => item.status === 'evidence_present').length,
      manualReview: allChecks.filter(item => item.status === 'requires_manual_review').length,
      notObserved: allChecks.filter(item => item.status === 'not_observed').length,
      unknown: allChecks.filter(item => item.status === 'unknown_due_to_missing_time').length,
    },
    conclusion: 'condition_matrix_only_no_success_failure_verdict',
    boundary: '该卡片只审计当前候选的条件矩阵；支持条件出现不等于成格，风险条件出现不等于破格，救应候选出现不等于救应完成。',
  };
}

function evaluateRule(
  rule: RuleDefinition,
  kind: BaziPatternConditionKind,
  chart: BaziCalculationResult,
  occurrences: NatalRoleOccurrence[],
  interactions: BaziBranchInteraction[],
): BaziPatternConditionCheck {
  if (rule.match === 'month_relation_rescue') return evaluateMonthRelationRescue(rule, interactions);
  if (rule.match === 'stem_combine') return evaluateStemCombine(rule, chart, occurrences);
  const matches = occurrences.filter(item => rule.roles.includes(item.tenGod));
  if (rule.match === 'absence') {
    const status: BaziPatternConditionStatus = matches.length
      ? 'not_observed'
      : chart.completeness === 'partial_unknown_time' ? 'unknown_due_to_missing_time' : 'evidence_present';
    return makeCheck(rule, kind, status, matches, matches.length
      ? `已见${matches.map(item => item.label).join('、')}，因此“未见${rule.roles.join('／')}”风险条件未观察到。`
      : chart.completeness === 'partial_unknown_time'
        ? `当前三柱未见${rule.roles.join('／')}，但时柱未知，不能认定原局确实缺失。`
        : `完整四柱中未见${rule.roles.join('／')}，只记录这一缺项风险证据。`);
  }
  if (rule.match === 'all_roles') {
    const presentRoles = new Set(matches.map(item => item.tenGod));
    const groups = normalizeRequiredRoleGroups(rule.roles);
    const allPresent = groups.every(group => group.some(roleName => presentRoles.has(roleName)));
    if (!allPresent) {
      return makeCheck(rule, kind, chart.completeness === 'partial_unknown_time' ? 'unknown_due_to_missing_time' : 'not_observed', matches,
        chart.completeness === 'partial_unknown_time' ? '组合角色尚未齐见且时柱未知，保持未知。' : '当前完整四柱未同时观察到该组合所需角色。');
    }
  }
  const surface = matches.filter(item => item.visibility === 'surface');
  if (!matches.length) {
    return makeCheck(rule, kind, chart.completeness === 'partial_unknown_time' ? 'unknown_due_to_missing_time' : 'not_observed', [],
      chart.completeness === 'partial_unknown_time' ? '当前三柱未观察到相关角色，时柱未知，保持未知。' : '当前完整四柱未观察到相关角色。');
  }
  if (rule.visibility === 'surface_required' && !surface.length) {
    return makeCheck(rule, kind, 'requires_manual_review', matches, `只在藏干观察到${matches.map(item => item.label).join('、')}，未满足表层透出条件。`);
  }
  return makeCheck(rule, kind, 'evidence_present', rule.visibility === 'surface_required' ? surface : matches,
    `观察到${(rule.visibility === 'surface_required' ? surface : matches).map(item => item.label).join('、')}。${rule.detail}`);
}

function evaluateStemCombine(rule: RuleDefinition, chart: BaziCalculationResult, occurrences: NatalRoleOccurrence[]): BaziPatternConditionCheck {
  const allPillars = getPillars(chart);
  const roleSurface = occurrences.filter(item => item.visibility === 'surface' && rule.roles.includes(item.tenGod));
  const evidence: BaziPatternConditionEvidence[] = [];
  for (const occurrence of roleSurface) {
    const partner = occurrence.stem ? STEM_COMBINE_PARTNER[occurrence.stem] : null;
    if (!partner) continue;
    const partnerPillar = allPillars.find(pillar => pillar.stem === partner && pillar.key !== occurrence.pillarKey);
    if (!partnerPillar) continue;
    evidence.push(occurrence, {
      id: `m9-13-combine-partner-${partnerPillar.key}-${partner}`,
      visibility: 'structural', label: `${partnerPillar.label}天干${partner}`,
      detail: `${partner}与${occurrence.stem}构成天干五合位置条件；是否合去、化气或完成救应仍未裁决。`,
      pillarKey: partnerPillar.key, stem: partner, branch: partnerPillar.branch, tenGod: toTenGod(partnerPillar.stemTenGod), sourceStage: 'M9-13',
    });
  }
  if (evidence.length) return makeCheck(rule, 'rescue_candidate', 'requires_manual_review', uniqueEvidence(evidence), '检测到天干五合位置，但五合效果和关系优先级仍需人工复核。');
  return makeCheck(rule, 'rescue_candidate', chart.completeness === 'partial_unknown_time' ? 'unknown_due_to_missing_time' : 'not_observed', roleSurface,
    chart.completeness === 'partial_unknown_time' ? '当前三柱未发现相合位置，时柱未知。' : '当前完整四柱未发现对应天干五合位置。');
}

function evaluateMonthRelationRescue(rule: RuleDefinition, interactions: BaziBranchInteraction[]): BaziPatternConditionCheck {
  const combinations = interactions.filter(item => item.involvesMonthBranch && ['six_combine', 'three_harmony', 'three_meeting'].includes(item.type));
  const evidence = combinations.map((item, index): BaziPatternConditionEvidence => ({
    id: `m9-13-month-rescue-${item.type}-${index}`,
    visibility: 'structural', label: `${relationLabel(item.type)}：${item.branches.join('')}`,
    detail: '只记录与月支相关的会合位置；不能据此宣告解冲、合化或救应完成。',
    pillarKey: 'month', stem: null, branch: item.branches.join(''), tenGod: null, sourceStage: 'M9-3',
  }));
  return makeCheck(rule, 'rescue_candidate', evidence.length ? 'requires_manual_review' : 'not_observed', evidence,
    evidence.length ? '检测到月支会合位置，作用结果与优先次序仍未裁决。' : '未观察到可列入本项的月支会合位置。');
}

function candidateSnapshotCheck(candidate: BaziPatternCandidate): BaziPatternConditionCheck {
  const rule = role('candidate-preserved', '月令候选入口', '原样保留 M9-3 候选，不重新取格。', []);
  return makeCheck(rule, 'formation_support', 'evidence_present', [{
    id: `m9-3-candidate-${candidate.sourceStem}-${candidate.sourceQi}`,
    visibility: 'upstream_context', label: `${candidate.label}（${candidate.sourceStem}，${qiLabel(candidate.sourceQi)}）`,
    detail: `${candidate.reasons.join('；')}上游状态：${candidate.status}。`,
    pillarKey: 'month', stem: candidate.sourceStem, branch: null, tenGod: candidate.tenGod as BaziTenGodName, sourceStage: 'M9-3',
  }], 'M9-3 已建立月令候选入口；这不是成格结论。');
}

function strengthContextCheck(result: BaziStrengthCompositeResult): BaziPatternConditionCheck {
  const rule = role('strength-context-review', '身用承载上下文待复核', '引用 M9-12 静态标签，但不把它当作最终强弱。', []);
  return makeCheck(rule, 'formation_support', 'requires_manual_review', [{
    id: 'm9-12-static-strength-context', visibility: 'upstream_context',
    label: result.staticBaseline.label, detail: result.staticBaseline.boundary,
    pillarKey: null, stem: null, branch: null, tenGod: null, sourceStage: 'M9-12',
  }], '格局条件常涉及身与用的承载关系；当前只提供 M9-12 静态证据标签，必须保留人工复核。');
}

function monthInteractionCheck(interactions: BaziBranchInteraction[]): BaziPatternConditionCheck {
  const rule = role('common-month-interaction', '月支刑冲会合风险条件', '月支参与结构关系时，只记录风险入口。', []);
  const evidence = interactions.filter(item => item.involvesMonthBranch).map((item, index): BaziPatternConditionEvidence => ({
    id: `m9-3-month-interaction-${item.type}-${index}`,
    visibility: 'structural', label: `${relationLabel(item.type)}：${item.branches.join('')}`,
    detail: 'M9-3 只检测关系，不认定合化、解冲、破格或关系优先级。',
    pillarKey: 'month', stem: null, branch: item.branches.join(''), tenGod: null, sourceStage: 'M9-3',
  }));
  return makeCheck(rule, 'breaking_risk', evidence.length ? 'evidence_present' : 'not_observed', evidence,
    evidence.length ? `月支参与${evidence.map(item => item.label).join('、')}，作为格局风险条件待复核。` : '当前未观察到 M9-3 已开放的月支刑冲会合关系。');
}

function collectNatalRoleOccurrences(chart: BaziCalculationResult): NatalRoleOccurrence[] {
  const result: NatalRoleOccurrence[] = [];
  for (const pillar of getPillars(chart)) {
    if (pillar.key !== 'day') {
      const tenGod = toTenGod(pillar.stemTenGod);
      if (tenGod) result.push({
        id: `natal-${pillar.key}-surface-${pillar.stem}`, visibility: 'surface',
        label: `${pillar.label}天干${pillar.stem}（${tenGod}）`, detail: '原局表层天干角色。',
        pillarKey: pillar.key, stem: pillar.stem, branch: pillar.branch, tenGod, sourceStage: 'M9-13',
      });
    }
    pillar.hiddenStems.forEach((hidden, index) => {
      const tenGod = toTenGod(hidden.tenGod);
      if (!tenGod) return;
      result.push({
        id: `natal-${pillar.key}-hidden-${hidden.stem}-${index}`, visibility: 'hidden',
        label: `${pillar.label}${pillar.branch}藏${hidden.stem}（${tenGod}，${index === 0 ? '本气' : index === 1 ? '中气' : '余气'}）`,
        detail: '原局实际藏干角色；藏而未透不得冒充表层条件。',
        pillarKey: pillar.key, stem: hidden.stem, branch: pillar.branch, tenGod, sourceStage: 'M9-13',
      });
    });
  }
  return result;
}

function resolveArchetype(chart: BaziCalculationResult, candidate: BaziPatternCandidate): BaziPatternArchetype {
  if (candidate.tenGod === '正官') return 'direct_officer';
  if (candidate.tenGod === '正财' || candidate.tenGod === '偏财') return 'wealth';
  if (candidate.tenGod === '正印' || candidate.tenGod === '偏印') return 'seal';
  if (candidate.tenGod === '食神') return 'food_god';
  if (candidate.tenGod === '七杀') return 'seven_killings';
  if (candidate.tenGod === '伤官') return 'hurting_officer';
  if (candidate.tenGod === '比肩') return 'build_prosperity';
  if (candidate.tenGod === '劫财' && candidate.sourceQi === 'main_qi' && YANG_BLADE_BRANCH[chart.dayMaster.stem] === chart.pillars.month.branch) return 'yang_blade';
  return 'month_robbery';
}

function resolveReviewFlags(
  chart: BaziCalculationResult,
  interpretation: BaziInterpretationResult,
  candidate: BaziPatternCandidate,
  archetype: BaziPatternArchetype,
  checks: BaziPatternConditionCheck[],
): BaziPatternReviewFlag[] {
  const flags: BaziPatternReviewFlag[] = ['strength_context_not_final'];
  if (chart.completeness === 'partial_unknown_time') flags.push('unknown_time');
  if (interpretation.pattern.isStorageMonth) flags.push('storage_month');
  if (interpretation.pattern.candidates.length > 1) flags.push('multiple_month_candidates');
  if (candidate.status === 'review_required') flags.push('upstream_candidate_review_required');
  if (interpretation.pattern.interactions.length) flags.push('month_branch_interaction');
  if (checks.some(item => item.status === 'requires_manual_review' && item.evidence.some(evidence => evidence.visibility === 'hidden'))) flags.push('hidden_role_not_surface');
  if (checks.some(item => item.ruleId.includes('combine') && item.status === 'requires_manual_review')) flags.push('combination_effect_unresolved');
  if (archetype === 'yang_blade') flags.push('yang_blade_variant');
  if (archetype === 'hurting_officer' && chart.dayMaster.element === '金' && ['壬', '癸'].includes(candidate.sourceStem)) flags.push('metal_water_hurting_officer_exception_pending');
  return [...new Set(flags)];
}

function makeCheck(
  rule: RuleDefinition,
  kind: BaziPatternConditionKind,
  status: BaziPatternConditionStatus,
  evidence: BaziPatternConditionEvidence[],
  detail: string,
): BaziPatternConditionCheck {
  return {
    id: `${kind}-${rule.id}`,
    ruleId: rule.id,
    kind,
    label: rule.label,
    status,
    statusLabel: statusLabel(status),
    detail,
    requiredRoles: rule.roles,
    evidence,
    linkedBreakingRuleIds: rule.linkedBreakingRuleIds ?? [],
    boundary: kind === 'formation_support'
      ? '支持条件出现不等于格局已经成立。'
      : kind === 'breaking_risk'
        ? '风险条件出现不等于格局已经破败。'
        : '救应候选出现不等于救应已经完成。',
  };
}

function notApplicableRescue(rule: RuleDefinition): BaziPatternConditionCheck {
  return makeCheck(rule, 'rescue_candidate', 'not_applicable', [], '对应破格风险当前未观察到，本项救应候选暂不展开。');
}

function role(id: string, label: string, detail: string, roles: BaziTenGodName[], visibility: VisibilityPolicy = 'surface_required'): RuleDefinition {
  return { id, label, detail, roles, match: 'any_role', visibility };
}

function allRoles(id: string, label: string, detail: string, roles: BaziTenGodName[]): RuleDefinition {
  return { id, label, detail, roles, match: 'all_roles', visibility: 'surface_required' };
}

function absence(id: string, label: string, detail: string, roles: BaziTenGodName[]): RuleDefinition {
  return { id, label, detail, roles, match: 'absence', visibility: 'surface_or_hidden' };
}

function rescueRole(id: string, label: string, detail: string, roles: BaziTenGodName[], linkedBreakingRuleIds: string[]): RuleDefinition {
  return { id, label, detail, roles, match: 'any_role', visibility: 'surface_required', linkedBreakingRuleIds };
}

function rescueCombine(id: string, label: string, detail: string, roles: BaziTenGodName[], linkedBreakingRuleIds: string[]): RuleDefinition {
  return { id, label, detail, roles, match: 'stem_combine', visibility: 'surface_required', linkedBreakingRuleIds };
}

function rescueRelation(id: string, label: string, detail: string): RuleDefinition {
  return { id, label, detail, roles: [], match: 'month_relation_rescue', visibility: 'surface_or_hidden', linkedBreakingRuleIds: ['common-month-interaction'] };
}

function buildProsperityRules(prefix: 'build' | 'robbery'): RuleSet {
  return {
    formation: [
      role(`${prefix}-formation-officer`, '透官支持条件', '建禄月劫另取财官煞食时，检查正官表层入口。', ['正官']),
      role(`${prefix}-formation-wealth`, '透财支持条件', '检查财星表层入口。', WEALTH),
      role(`${prefix}-formation-kill`, '透杀支持条件', '检查七杀表层入口；仍须制化复核。', ['七杀']),
      role(`${prefix}-formation-output`, '食伤泄秀支持条件', '检查食伤表层入口。', OUTPUT),
    ],
    breaking: [
      absence(`${prefix}-break-no-use-path`, '财官煞食未见风险条件', '完整原局若未见财官煞食表层或藏干角色，只记录取用路径缺项风险。', [...WEALTH, ...OFFICER_KILL, ...OUTPUT]),
      allRoles(`${prefix}-break-kill-seal`, '杀印并透风险条件', '七杀与印星同时出现时，记录为需要制化复核的风险组合。', ['七杀', '正印', '偏印']),
      allRoles(`${prefix}-break-officer-hurting`, '用官逢伤风险条件', '正官与伤官同时出现时，记录用官路径受伤风险。', ['正官', '伤官']),
      allRoles(`${prefix}-break-wealth-kill`, '用财带杀风险条件', '财星与七杀同时出现时，记录用财路径带杀风险。', ['正财', '偏财', '七杀']),
    ],
    rescue: [
      rescueCombine(`${prefix}-rescue-combine-hurting`, '合伤存官救应候选', '用官逢伤风险出现时，检查伤官天干相合位置。', ['伤官'], [`${prefix}-break-officer-hurting`]),
      rescueCombine(`${prefix}-rescue-combine-kill`, '合杀存财救应候选', '用财带杀风险出现时，检查七杀天干相合位置。', ['七杀'], [`${prefix}-break-wealth-kill`]),
      rescueRelation(`${prefix}-rescue-month-relation`, '会合解月支结构救应候选', '月支结构风险出现时，检查并见的会合位置条件。'),
    ],
  };
}

function normalizeRequiredRoleGroups(roles: BaziTenGodName[]): BaziTenGodName[][] {
  const groups: BaziTenGodName[][] = [];
  if (roles.some(roleName => WEALTH.includes(roleName))) groups.push(WEALTH);
  if (roles.some(roleName => SEAL.includes(roleName))) groups.push(SEAL);
  if (roles.some(roleName => OUTPUT.includes(roleName))) groups.push(OUTPUT);
  if (roles.includes('正官')) groups.push(['正官']);
  if (roles.includes('七杀')) groups.push(['七杀']);
  if (roles.some(roleName => PEER_ROB.includes(roleName))) groups.push(PEER_ROB);
  return groups;
}

function getPillars(chart: BaziCalculationResult): BaziPillar[] {
  return [chart.pillars.year, chart.pillars.month, chart.pillars.day, chart.pillars.time]
    .filter((pillar): pillar is BaziPillar => pillar !== null);
}

function toTenGod(value: string): BaziTenGodName | null {
  return ['比肩', '劫财', '食神', '伤官', '偏财', '正财', '七杀', '正官', '偏印', '正印'].includes(value)
    ? value as BaziTenGodName
    : null;
}

function uniqueEvidence(evidence: BaziPatternConditionEvidence[]): BaziPatternConditionEvidence[] {
  return [...new Map(evidence.map(item => [item.id, item])).values()];
}

function statusLabel(status: BaziPatternConditionStatus): string {
  return ({
    evidence_present: '观察到条件证据', not_observed: '当前未观察到',
    requires_manual_review: '已见入口，需人工复核', unknown_due_to_missing_time: '时柱未知，条件未定',
    not_applicable: '对应风险未出现',
  } as Record<BaziPatternConditionStatus, string>)[status];
}

function relationLabel(type: BaziBranchInteraction['type']): string {
  return ({ clash: '六冲', six_combine: '六合', three_harmony: '三合', three_meeting: '三会' } as Record<BaziBranchInteraction['type'], string>)[type];
}

function qiLabel(qi: BaziPatternCandidate['sourceQi']): string {
  return ({ main_qi: '本气', secondary_qi: '中气', residual_qi: '余气' } as const)[qi];
}
