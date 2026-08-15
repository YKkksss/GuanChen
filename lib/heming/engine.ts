import { HEMING_METHODOLOGY, getRelationshipDefinition } from './methodology';
import { extractHemingFacts } from './facts';
import type {
  ChartOwner,
  HemingConfidence,
  HemingDimensionResult,
  HemingEvaluationInput,
  HemingEvaluationResult,
  HemingEvidence,
  HemingFactBundle,
  HemingRelationshipContext,
  HemingResultPhase,
  HemingRuleCondition,
  HemingRuleDefinition,
  HemingRuleResult,
  HemingSuppressedRule,
  PalaceName,
} from './types';

export interface HemingConditionEvaluationInput {
  facts: HemingFactBundle;
  relationshipContext?: HemingRelationshipContext | null;
  methodologyVersion: string;
  chartEngineVersion: string;
  ruleId: string;
  ruleVersion: number;
  confidence: HemingConfidence;
}

export interface HemingConditionEvaluation {
  matched: boolean;
  evidence: HemingEvidence[];
}

interface MatchedRuleCandidate {
  definition: HemingRuleDefinition;
  result: HemingRuleResult;
  evidence: HemingEvidence[];
}

export function evaluateHeming(input: HemingEvaluationInput): HemingEvaluationResult {
  const chartEngineVersion = input.chartEngineVersion?.trim() || 'ziwei-v1';
  const relationship = getRelationshipDefinition(input.relationshipType);
  const facts = extractHemingFacts(input.chartA, input.chartB);
  const applicableRules = HEMING_METHODOLOGY.rules.filter(rule => (
    rule.enabled && rule.relationshipTypes.includes(input.relationshipType)
  ));

  const candidates = applicableRules
    .map(rule => evaluateRule(rule, facts, input.relationshipContext, chartEngineVersion))
    .filter((candidate): candidate is MatchedRuleCandidate => candidate !== null)
    .sort(compareCandidates);
  const { winners, suppressedRules } = resolveConflicts(candidates);
  const degradedWinners = applyUnknownTimeDegradation(winners, facts);
  const matchedRules = degradedWinners.map(candidate => candidate.result);
  const evidenceIds = new Set(matchedRules.flatMap(result => result.evidenceIds));
  const evidence = dedupeEvidence(degradedWinners.flatMap(candidate => candidate.evidence))
    .filter(item => evidenceIds.has(item.id))
    .sort((left, right) => left.id.localeCompare(right.id, 'zh-CN'));

  return {
    methodologyVersion: HEMING_METHODOLOGY.version,
    chartEngineVersion,
    relationshipType: input.relationshipType,
    roles: {
      A: input.relationshipContext?.ownerARole || relationship.roles[0].label,
      B: input.relationshipContext?.ownerBRole || relationship.roles[1].label,
    },
    facts,
    evidence,
    dimensions: buildDimensions(relationship.dimensions, matchedRules, input.relationshipContext),
    matchedRules,
    suppressedRules,
    warnings: buildWarnings(facts, relationship.requiredRealityContext, input.relationshipContext),
  };
}

export function evaluateHemingCondition(
  condition: HemingRuleCondition,
  input: HemingConditionEvaluationInput,
): HemingConditionEvaluation {
  switch (condition.kind) {
    case 'star_overlap': {
      const left = input.facts[condition.left.owner].palaces[condition.left.palace];
      const right = input.facts[condition.right.owner].palaces[condition.right.palace];
      const leftNames = new Set(left.stars.filter(star => condition.starTypes.includes(star.type)).map(star => star.name));
      const overlaps = [...new Set(
        right.stars
          .filter(star => condition.starTypes.includes(star.type) && leftNames.has(star.name))
          .map(star => star.name),
      )].sort((a, b) => a.localeCompare(b, 'zh-CN'));
      if (overlaps.length < condition.minCount) return { matched: false, evidence: [] };
      const suffix = `star_overlap:${overlaps.join('+')}`;
      return {
        matched: true,
        evidence: [
          createPalaceEvidence(input, left.owner, left.palace, left.branch, suffix, `${ownerLabel(left.owner)}${left.palace}参与星曜重合`, overlaps),
          createPalaceEvidence(input, right.owner, right.palace, right.branch, suffix, `${ownerLabel(right.owner)}${right.palace}参与星曜重合`, overlaps),
        ],
      };
    }
    case 'star_category_count': {
      const palace = input.facts[condition.target.owner].palaces[condition.target.palace];
      const stars = palace.stars.filter(star => star.type === condition.category).map(star => star.name);
      if (!compareNumber(stars.length, condition.operator, condition.value)) return { matched: false, evidence: [] };
      return {
        matched: true,
        evidence: [createPalaceEvidence(
          input,
          palace.owner,
          palace.palace,
          palace.branch,
          `star_category:${condition.category}:${stars.length}`,
          `${ownerLabel(palace.owner)}${palace.palace}${condition.category}类星曜数量为 ${stars.length}`,
          stars,
          stars.length,
        )],
      };
    }
    case 'natal_sihua_present': {
      const palace = input.facts[condition.target.owner].palaces[condition.target.palace];
      const siHua = palace.stars
        .filter(star => star.siHua === condition.siHua)
        .map(star => ({ star: star.name, type: condition.siHua }));
      if (!siHua.length) return { matched: false, evidence: [] };
      return {
        matched: true,
        evidence: [createEvidence(input, {
          id: `${sourceForOwner(palace.owner)}:${input.ruleId}:palace:${palace.palace}:${palace.branchIndex}:natal_sihua:${condition.siHua}`,
          owner: palace.owner,
          source: sourceForOwner(palace.owner),
          factType: 'natal_sihua',
          label: `${ownerLabel(palace.owner)}${palace.palace}存在本命化${condition.siHua}`,
          palace: palace.palace,
          branch: palace.branch,
          siHua,
        })],
      };
    }
    case 'palace_empty': {
      const palace = input.facts[condition.target.owner].palaces[condition.target.palace];
      if (palace.isEmpty !== condition.expected) return { matched: false, evidence: [] };
      return {
        matched: true,
        evidence: [createEvidence(input, {
          id: `${sourceForOwner(palace.owner)}:${input.ruleId}:palace:${palace.palace}:${palace.branchIndex}:empty:${palace.isEmpty}`,
          owner: palace.owner,
          source: sourceForOwner(palace.owner),
          factType: 'palace_empty',
          label: `${ownerLabel(palace.owner)}${palace.palace}${palace.isEmpty ? '为空宫' : '不是空宫'}`,
          palace: palace.palace,
          branch: palace.branch,
          value: palace.isEmpty,
        })],
      };
    }
    case 'birth_time_known': {
      const known = input.facts[condition.owner].birthTimeKnown;
      if (known !== condition.expected) return { matched: false, evidence: [] };
      return {
        matched: true,
        evidence: [createEvidence(input, {
          id: `${sourceForOwner(condition.owner)}:${input.ruleId}:birth_time:${known ? 'known' : 'unknown'}`,
          owner: condition.owner,
          source: sourceForOwner(condition.owner),
          factType: 'birth_time_known',
          label: `${ownerLabel(condition.owner)}出生时间${known ? '已确认' : '未确认'}`,
          value: known,
        })],
      };
    }
    case 'stage_focus_in': {
      const stage = input.facts[condition.owner].currentStage;
      if (!stage || !condition.palaces.includes(stage.palace)) return { matched: false, evidence: [] };
      return {
        matched: true,
        evidence: [createEvidence(input, {
          id: `${sourceForOwner(condition.owner)}:${input.ruleId}:stage:${stage.palace}:${stage.branchIndex}:${stage.startAge}-${stage.endAge}`,
          owner: condition.owner,
          source: sourceForOwner(condition.owner),
          factType: 'current_daxian_palace',
          label: `${ownerLabel(condition.owner)}当前大限位于${stage.palace}`,
          palace: stage.palace,
          branch: stage.branch,
          value: { startAge: stage.startAge, endAge: stage.endAge },
        })],
      };
    }
    case 'confirmed_context_present': {
      const value = getConfirmedContextValue(input.relationshipContext, condition.field);
      if (!value) return { matched: false, evidence: [] };
      return {
        matched: true,
        evidence: [createEvidence(input, {
          id: `user_confirmed:${input.ruleId}:context:${condition.field}`,
          owner: 'interaction',
          source: 'user_confirmed',
          factType: 'confirmed_context',
          label: `用户已确认现实背景：${condition.field}`,
          value,
        })],
      };
    }
  }
}

function evaluateRule(
  rule: HemingRuleDefinition,
  facts: HemingFactBundle,
  relationshipContext: HemingRelationshipContext | null | undefined,
  chartEngineVersion: string,
): MatchedRuleCandidate | null {
  const conditionInput: HemingConditionEvaluationInput = {
    facts,
    relationshipContext,
    methodologyVersion: HEMING_METHODOLOGY.version,
    chartEngineVersion,
    ruleId: rule.id,
    ruleVersion: rule.version,
    confidence: rule.confidence,
  };
  const conditionResults = rule.conditions.map(condition => evaluateHemingCondition(condition, conditionInput));
  if (conditionResults.some(result => !result.matched)) return null;

  const conditionEvidence = dedupeEvidence(conditionResults.flatMap(result => result.evidence));
  const interactionEvidence = rule.evidenceOwners.includes('interaction')
    ? [createEvidence(conditionInput, {
        id: `rule_engine:interaction:${rule.id}:v${rule.version}`,
        owner: 'interaction',
        source: 'rule_engine',
        factType: 'rule_match',
        label: `规则触发：${rule.name}`,
        value: { conditionEvidenceIds: conditionEvidence.map(item => item.id), effect: rule.effect },
      })]
    : [];
  const evidence = [...conditionEvidence, ...interactionEvidence];

  return {
    definition: rule,
    evidence,
    result: {
      ruleId: rule.id,
      ruleVersion: rule.version,
      ruleName: rule.name,
      dimensionId: rule.dimensionId,
      phase: getRulePhase(rule),
      level: rule.effect,
      configuredConfidence: rule.confidence,
      confidence: rule.confidence,
      priority: rule.priority,
      evidenceIds: evidence.map(item => item.id).sort((a, b) => a.localeCompare(b, 'zh-CN')),
      degradedByRuleIds: [],
      conclusion: rule.conclusionTemplate,
      advice: rule.adviceTemplate,
      source: rule.source,
    },
  };
}

function resolveConflicts(candidates: MatchedRuleCandidate[]): {
  winners: MatchedRuleCandidate[];
  suppressedRules: HemingSuppressedRule[];
} {
  const winners: MatchedRuleCandidate[] = [];
  const suppressedRules: HemingSuppressedRule[] = [];
  for (const candidate of candidates) {
    const winner = winners.find(item => item.definition.conflictsWith.includes(candidate.definition.id));
    if (winner) {
      suppressedRules.push({
        ruleId: candidate.definition.id,
        suppressedByRuleId: winner.definition.id,
        reason: 'conflict_priority',
      });
      continue;
    }
    winners.push(candidate);
  }
  return {
    winners: winners.sort(compareCandidates),
    suppressedRules: suppressedRules.sort((a, b) => a.ruleId.localeCompare(b.ruleId)),
  };
}

function applyUnknownTimeDegradation(
  candidates: MatchedRuleCandidate[],
  facts: HemingFactBundle,
): MatchedRuleCandidate[] {
  const unknownOwners = (['A', 'B'] as const).filter(owner => !facts[owner].birthTimeKnown);
  const guardByOwner = new Map<ChartOwner, MatchedRuleCandidate>();
  for (const candidate of candidates) {
    if (candidate.result.level !== 'insufficient') continue;
    const owner = candidate.definition.evidenceOwners.find(item => item === 'A' || item === 'B');
    if (owner) guardByOwner.set(owner, candidate);
  }

  return candidates.map(candidate => {
    if (candidate.result.level === 'insufficient') return candidate;
    const affectedOwners = unknownOwners.filter(owner => candidate.definition.evidenceOwners.includes(owner));
    const guards = affectedOwners.map(owner => guardByOwner.get(owner)).filter((item): item is MatchedRuleCandidate => !!item);
    if (!guards.length) return candidate;
    const guardEvidence = guards.flatMap(guard => guard.evidence);
    return {
      ...candidate,
      evidence: dedupeEvidence([...candidate.evidence, ...guardEvidence]),
      result: {
        ...candidate.result,
        confidence: 'low',
        degradedByRuleIds: guards.map(guard => guard.result.ruleId).sort(),
        evidenceIds: [...new Set([
          ...candidate.result.evidenceIds,
          ...guardEvidence.map(item => item.id),
        ])].sort((a, b) => a.localeCompare(b, 'zh-CN')),
      },
    };
  });
}

function buildDimensions(
  definitions: ReturnType<typeof getRelationshipDefinition>['dimensions'],
  matchedRules: HemingRuleResult[],
  relationshipContext: HemingRelationshipContext | null | undefined,
): HemingDimensionResult[] {
  return definitions.map(dimension => {
    const dimensionRules = matchedRules.filter(result => result.dimensionId === dimension.id);
    return {
      dimensionId: dimension.id,
      label: dimension.label,
      description: dimension.description,
      requiredContextFields: [...dimension.requiredContextFields],
      missingContextFields: dimension.requiredContextFields.filter(field => !getConfirmedContextValue(relationshipContext, field)),
      baselineResults: dimensionRules.filter(result => result.phase !== 'stage'),
      stageResults: dimensionRules.filter(result => result.phase === 'stage'),
    };
  });
}

function buildWarnings(
  facts: HemingFactBundle,
  requiredContextFields: string[],
  relationshipContext: HemingRelationshipContext | null | undefined,
): string[] {
  const warnings: string[] = [];
  for (const owner of ['A', 'B'] as const) {
    if (!facts[owner].birthTimeKnown) warnings.push(`${owner} 方出生时间未确认，相关结论已降为低置信度`);
    if (!facts[owner].currentStage) warnings.push(`${owner} 方缺少当前大限信息，阶段规则不会触发`);
  }
  const missing = requiredContextFields.filter(field => !getConfirmedContextValue(relationshipContext, field));
  if (missing.length) warnings.push(`现实背景尚缺：${missing.join('、')}`);
  return warnings;
}

function compareCandidates(left: MatchedRuleCandidate, right: MatchedRuleCandidate): number {
  return Number(right.result.level === 'insufficient') - Number(left.result.level === 'insufficient')
    || evidenceCompleteness(right.definition) - evidenceCompleteness(left.definition)
    || bidirectionalScore(right.definition) - bidirectionalScore(left.definition)
    || Number(right.definition.relationshipTypes.length === 1) - Number(left.definition.relationshipTypes.length === 1)
    || right.result.priority - left.result.priority
    || left.result.ruleId.localeCompare(right.result.ruleId);
}

function evidenceCompleteness(rule: HemingRuleDefinition): number {
  return ['A', 'B', 'interaction'].filter(owner => rule.evidenceOwners.includes(owner as 'A' | 'B' | 'interaction')).length;
}

function bidirectionalScore(rule: HemingRuleDefinition): number {
  const directions = new Set(
    rule.conditions
      .filter(condition => condition.kind === 'star_overlap')
      .map(condition => condition.kind === 'star_overlap' ? `${condition.left.owner}->${condition.right.owner}` : ''),
  );
  return directions.has('A->B') && directions.has('B->A') ? 1 : 0;
}

function getRulePhase(rule: HemingRuleDefinition): HemingResultPhase {
  if (rule.effect === 'insufficient') return 'safety';
  if (rule.conditions.some(condition => condition.kind === 'stage_focus_in')) return 'stage';
  return 'natal';
}

function getConfirmedContextValue(
  context: HemingRelationshipContext | null | undefined,
  field: string,
): string | null {
  if (!context) return null;
  const primaryValues: Record<string, string | null> = {
    main_concern: context.mainConcern,
    custom_relationship_label: context.customRelationshipLabel,
    owner_a_role: context.ownerARole,
    owner_b_role: context.ownerBRole,
  };
  const value = primaryValues[field] ?? context.confirmedFacts[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function createPalaceEvidence(
  input: HemingConditionEvaluationInput,
  owner: ChartOwner,
  palace: PalaceName,
  branch: string,
  suffix: string,
  label: string,
  stars: string[],
  value?: unknown,
): HemingEvidence {
  const fact = input.facts[owner].palaces[palace];
  return createEvidence(input, {
    id: `${sourceForOwner(owner)}:${input.ruleId}:palace:${palace}:${fact.branchIndex}:${suffix}`,
    owner,
    source: sourceForOwner(owner),
    factType: suffix.split(':')[0],
    label,
    palace,
    branch,
    stars,
    value,
  });
}

function createEvidence(
  input: HemingConditionEvaluationInput,
  evidence: Omit<HemingEvidence, 'confidence' | 'methodologyVersion' | 'chartEngineVersion' | 'ruleId' | 'ruleVersion'>,
): HemingEvidence {
  return {
    ...evidence,
    confidence: input.confidence,
    methodologyVersion: input.methodologyVersion,
    chartEngineVersion: input.chartEngineVersion,
    ruleId: input.ruleId,
    ruleVersion: input.ruleVersion,
  };
}

function sourceForOwner(owner: ChartOwner): 'chart_a' | 'chart_b' {
  return owner === 'A' ? 'chart_a' : 'chart_b';
}

function ownerLabel(owner: ChartOwner): string {
  return owner === 'A' ? '甲方' : '乙方';
}

function compareNumber(actual: number, operator: 'gte' | 'lte' | 'eq', expected: number): boolean {
  if (operator === 'gte') return actual >= expected;
  if (operator === 'lte') return actual <= expected;
  return actual === expected;
}

function dedupeEvidence(evidence: HemingEvidence[]): HemingEvidence[] {
  return [...new Map(evidence.map(item => [item.id, item])).values()];
}
