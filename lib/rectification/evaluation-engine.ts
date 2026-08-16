import { randomUUID } from 'node:crypto';
import type { LifeEventCategory } from '@/lib/events/types';
import {
  RECTIFICATION_METHODOLOGY,
  RECTIFICATION_METHODOLOGY_VERSION,
  getRectificationTimeSlot,
} from './methodology';
import { convertCivilTimeToApparentSolar } from './time-service';
import type {
  RectificationCandidate,
  RectificationCandidateEvaluation,
  RectificationEvaluation,
  RectificationEventEvidence,
  RectificationEventMatrix,
  RectificationEventWithFacts,
  RectificationRuleDefinition,
  RectificationRuleHit,
  RectificationSessionDetail,
} from './types';

interface InternalHit extends Omit<RectificationRuleHit, 'id' | 'evaluationId' | 'createdAt'> {}

interface ScoredCandidate {
  candidateId: string;
  rawScore: number;
  rank: number;
  relativeEvidenceIndex: number;
  tiedForRank: boolean;
  eventContributions: Record<string, number>;
  categoryContributions: Partial<Record<LifeEventCategory, number>>;
  hits: InternalHit[];
}

interface EvaluationBuildInput {
  id: string;
  version: number;
  inputFingerprint: string;
  evaluatedAt: number;
  session: RectificationSessionDetail;
  matrix: RectificationEventMatrix;
}

const SCORE_EPSILON = 1e-9;
const STRONG_TIME_SOURCES = new Set(['birth_certificate', 'hospital_record', 'household_record']);
export const RECTIFICATION_EVALUATION_ENGINE_VERSION = 'rectification-evaluation-v1';

export function buildRectificationEvaluation(input: EvaluationBuildInput): RectificationEvaluation {
  const primaryCandidates = input.session.candidates.filter(candidate => !candidate.duplicateOfCandidateId);
  const eligibleEvents = input.matrix.events.filter(event => event.scoreEligible);
  const rawHits = buildRawHits(input.session, primaryCandidates, eligibleEvents);
  const scored = scoreCandidates(primaryCandidates, rawHits, new Set(eligibleEvents.map(event => event.id)));
  const looRates = calculateLeaveOneOutRates(primaryCandidates, rawHits, eligibleEvents);
  const discriminatingRuleCount = countDiscriminatingGroups(scored);
  const sortedPrimary = [...scored].sort((a, b) => b.rawScore - a.rawScore || a.candidateId.localeCompare(b.candidateId));
  const topCandidates = sortedPrimary.filter(item => Math.abs(item.rawScore - sortedPrimary[0].rawScore) <= SCORE_EPSILON);
  const topMarginRatio = calculateTopMarginRatio(sortedPrimary, eligibleEvents.length);
  const topRate = topCandidates.length === 1 ? (looRates.get(topCandidates[0].candidateId) ?? null) : null;
  const hasEnoughForStability = eligibleEvents.length >= RECTIFICATION_METHODOLOGY.scorePolicy.leaveOneEventOutMinimumEvents;
  const stable = input.matrix.readiness.meetsMinimum
    && hasEnoughForStability
    && topCandidates.length === 1
    && discriminatingRuleCount > 0
    && topMarginRatio !== null
    && topMarginRatio >= RECTIFICATION_METHODOLOGY.scorePolicy.minimumTopMarginRatio
    && topRate !== null
    && topRate >= RECTIFICATION_METHODOLOGY.scorePolicy.stableTopCandidateRate;
  const indistinguishable = discriminatingRuleCount === 0
    || topCandidates.length > 1
    || topMarginRatio === null
    || topMarginRatio < RECTIFICATION_METHODOLOGY.scorePolicy.minimumTopMarginRatio;
  const warnings = buildWarnings(input, eligibleEvents.length, discriminatingRuleCount, topCandidates.length, topMarginRatio, topRate);
  const safetyRuleHits = buildSafetyHits(input.session, input.matrix, primaryCandidates, indistinguishable);
  const primaryEvaluations = scored.map(item => toCandidateEvaluation(
    item,
    input,
    looRates.get(item.candidateId) ?? null,
    stable && item.rank === 1 && topCandidates.length === 1 ? 'medium' : 'low',
    safetyRuleHits.get(item.candidateId) ?? [],
  ));
  const primaryById = new Map(primaryEvaluations.map(item => [item.candidateId, item]));
  const allEvaluations = input.session.candidates.map(candidate => {
    if (!candidate.duplicateOfCandidateId) return primaryById.get(candidate.id)!;
    const source = primaryById.get(candidate.duplicateOfCandidateId);
    if (!source) throw new Error('重复候选缺少对应的原始候选');
    return {
      ...source,
      candidateId: candidate.id,
      equivalentToCandidateId: candidate.duplicateOfCandidateId,
      tiedForRank: true,
      confidence: 'low' as const,
      ruleHits: [],
    };
  });

  return {
    id: input.id,
    sessionId: input.session.id,
    version: input.version,
    inputFingerprint: input.inputFingerprint,
    methodologyVersion: RECTIFICATION_METHODOLOGY_VERSION,
    evaluationEngineVersion: RECTIFICATION_EVALUATION_ENGINE_VERSION,
    evaluatedAt: input.evaluatedAt,
    candidates: allEvaluations.sort((a, b) => a.rank - b.rank || a.candidateId.localeCompare(b.candidateId)),
    readiness: input.matrix.readiness,
    discriminatingRuleCount,
    topMarginRatio,
    stable,
    warnings,
    disclaimer: '相对证据指数仅表示当前候选集合在既定传统命理规则下的相对差异，不是出生时辰正确概率，也不能确定真实出生时辰。',
  };
}

function buildRawHits(
  session: RectificationSessionDetail,
  candidates: RectificationCandidate[],
  events: RectificationEventWithFacts[],
): Map<string, InternalHit[]> {
  const result = new Map<string, InternalHit[]>();
  for (const candidate of candidates) {
    const hits: InternalHit[] = [buildReportedTimeHit(session, candidate)];
    for (const event of events) hits.push(...buildEventHits(session.id, candidate, event));
    result.set(candidate.id, hits);
  }
  return result;
}

function buildReportedTimeHit(session: RectificationSessionDetail, candidate: RectificationCandidate): InternalHit {
  const rule = findRule('reported-window-contains');
  const window = resolveReportedWindow(session);
  let outcome: InternalHit['outcome'] = 'insufficient';
  if (window.slotKeys) {
    if (window.slotKeys.has(candidate.slotKey)) outcome = 'support';
    else if (window.allowConflict) outcome = 'conflict';
    else outcome = 'neutral';
  }
  const rawWeight = rule.baseWeight * RECTIFICATION_METHODOLOGY.scorePolicy.outcomeScores[outcome];
  return {
    sessionId: session.id,
    candidateId: candidate.id,
    sessionEventId: null,
    lifeEventId: null,
    category: null,
    ruleId: rule.id,
    ruleVersion: rule.version,
    outcome,
    rawWeight: round6(rawWeight),
    adjustedWeight: round6(rawWeight),
    discriminating: false,
    evidence: {
      candidateSlotKey: candidate.slotKey,
      candidateSlotLabel: getRectificationTimeSlot(candidate.slotKey).label,
      reportedSource: session.reportedTimeEvidence.source,
      reportedPrecision: session.reportedTimeEvidence.precision,
      acceptedSlotKeys: window.slotKeys ? [...window.slotKeys] : [],
      allowConflict: window.allowConflict,
      reason: window.reason,
    },
    methodologyVersion: RECTIFICATION_METHODOLOGY_VERSION,
  };
}

function buildEventHits(
  sessionId: string,
  candidate: RectificationCandidate,
  event: RectificationEventWithFacts,
): InternalHit[] {
  const facts = event.facts.filter(fact => fact.candidateId === candidate.id);
  const layerMatches = {
    decadal: facts.filter(fact => fact.snapshot.topicFact.decadalMatches.length > 0),
    annualFlow: facts.filter(fact => fact.snapshot.topicFact.annualFlowMatches.length > 0),
    annualKeyPalace: facts.filter(fact => fact.snapshot.topicFact.annualKeyPalaceMatches.length > 0),
    annualTransformation: facts.filter(fact => fact.snapshot.topicFact.annualTransformationMatches.length > 0),
  };
  const matchedLayerCount = Object.values(layerMatches).filter(items => items.length > 0).length;
  return [
    createEventRuleHit(sessionId, candidate, event, findRule('decadal-topic-focus'), layerMatches.decadal, layerMatches.decadal.length > 0),
    createEventRuleHit(sessionId, candidate, event, findRule('annual-flow-topic-focus'), layerMatches.annualFlow, layerMatches.annualFlow.length > 0),
    createEventRuleHit(sessionId, candidate, event, findRule('annual-key-palace-topic-focus'), layerMatches.annualKeyPalace, layerMatches.annualKeyPalace.length > 0),
    createEventRuleHit(sessionId, candidate, event, findRule('annual-transformation-topic-focus'), layerMatches.annualTransformation, layerMatches.annualTransformation.length > 0),
    createEventRuleHit(
      sessionId,
      candidate,
      event,
      findRule('multi-layer-convergence'),
      facts,
      matchedLayerCount >= 2,
      { matchedLayerCount, matchedLayers: Object.entries(layerMatches).filter(([, items]) => items.length > 0).map(([key]) => key) },
    ),
  ];
}

function createEventRuleHit(
  sessionId: string,
  candidate: RectificationCandidate,
  event: RectificationEventWithFacts,
  rule: RectificationRuleDefinition,
  matchedFacts: RectificationEventWithFacts['facts'],
  matched: boolean,
  extraEvidence: Record<string, unknown> = {},
): InternalHit {
  const outcome = matched ? rule.outcome : 'neutral';
  const policy = RECTIFICATION_METHODOLOGY.scorePolicy;
  const qualityWeight = policy.eventQualityWeights[event.evidenceQuality];
  const datePrecisionWeight = policy.datePrecisionWeights[event.snapshot.datePrecision];
  const impactMultiplier = policy.impactMultipliers[event.snapshot.impactLevel];
  const distinctYears = new Set(event.facts.map(fact => fact.eventYear)).size;
  const rangeDecay = event.snapshot.datePrecision === 'range'
    ? Math.max(policy.rangeYearDecayFloor, 1 / Math.sqrt(Math.max(distinctYears, 1)))
    : 1;
  const rawWeight = rule.baseWeight * policy.outcomeScores[outcome]
    * qualityWeight * datePrecisionWeight * impactMultiplier * rangeDecay;
  return {
    sessionId,
    candidateId: candidate.id,
    sessionEventId: event.id,
    lifeEventId: event.lifeEventId,
    category: event.snapshot.category,
    ruleId: rule.id,
    ruleVersion: rule.version,
    outcome,
    rawWeight: round6(rawWeight),
    adjustedWeight: round6(rawWeight),
    discriminating: false,
    evidence: {
      eventTitle: event.snapshot.title,
      eventYears: [...new Set(event.facts.map(fact => fact.eventYear))],
      matchedYears: [...new Set(matchedFacts.map(fact => fact.eventYear))],
      evidenceQuality: event.evidenceQuality,
      qualityWeight,
      datePrecision: event.snapshot.datePrecision,
      datePrecisionWeight,
      impactLevel: event.snapshot.impactLevel,
      impactMultiplier,
      rangeDecay: round6(rangeDecay),
      ...extraEvidence,
    },
    methodologyVersion: RECTIFICATION_METHODOLOGY_VERSION,
  };
}

function scoreCandidates(
  candidates: RectificationCandidate[],
  rawHitsByCandidate: Map<string, InternalHit[]>,
  includedEventIds: Set<string>,
): ScoredCandidate[] {
  const hitsByCandidate = new Map<string, InternalHit[]>();
  for (const candidate of candidates) {
    const hits = (rawHitsByCandidate.get(candidate.id) ?? [])
      .filter(hit => hit.sessionEventId === null || includedEventIds.has(hit.sessionEventId))
      .map(hit => ({ ...hit, evidence: { ...hit.evidence } }));
    hitsByCandidate.set(candidate.id, hits);
  }
  applyDiscriminatingFilter(candidates, hitsByCandidate);
  for (const candidate of candidates) {
    const hits = hitsByCandidate.get(candidate.id)!;
    applyPerEventCap(hits);
    applyCategoryCap(hits);
  }
  const scores = candidates.map(candidate => {
    const hits = hitsByCandidate.get(candidate.id)!;
    const eventContributions: Record<string, number> = {};
    const categoryContributions: Partial<Record<LifeEventCategory, number>> = {};
    for (const hit of hits) {
      if (!hit.sessionEventId) continue;
      eventContributions[hit.sessionEventId] = round6((eventContributions[hit.sessionEventId] ?? 0) + hit.adjustedWeight);
      if (hit.category) categoryContributions[hit.category] = round6((categoryContributions[hit.category] ?? 0) + hit.adjustedWeight);
    }
    return {
      candidateId: candidate.id,
      rawScore: round6(hits.reduce((sum, hit) => sum + hit.adjustedWeight, 0)),
      rank: 0,
      relativeEvidenceIndex: 0,
      tiedForRank: false,
      eventContributions,
      categoryContributions,
      hits,
    };
  });
  assignRanksAndIndices(scores);
  return scores;
}

function applyDiscriminatingFilter(
  candidates: RectificationCandidate[],
  hitsByCandidate: Map<string, InternalHit[]>,
) {
  const groupKeys = new Set<string>();
  for (const hits of hitsByCandidate.values()) {
    for (const hit of hits) groupKeys.add(`${hit.sessionEventId ?? 'time'}:${hit.ruleId}`);
  }
  for (const groupKey of groupKeys) {
    const group = candidates.map(candidate => hitsByCandidate.get(candidate.id)!
      .find(hit => `${hit.sessionEventId ?? 'time'}:${hit.ruleId}` === groupKey)!);
    const signatures = new Set(group.map(hit => hit.outcome));
    const discriminating = signatures.size > 1;
    for (const hit of group) {
      hit.discriminating = discriminating;
      hit.adjustedWeight = discriminating ? hit.rawWeight : 0;
    }
  }
}

function applyPerEventCap(hits: InternalHit[]) {
  const eventIds = new Set(hits.flatMap(hit => hit.sessionEventId ? [hit.sessionEventId] : []));
  for (const eventId of eventIds) {
    const eventHits = hits.filter(hit => hit.sessionEventId === eventId);
    const total = eventHits.reduce((sum, hit) => sum + hit.adjustedWeight, 0);
    const cap = RECTIFICATION_METHODOLOGY.scorePolicy.perEventAbsoluteCap;
    if (Math.abs(total) <= cap || Math.abs(total) <= SCORE_EPSILON) continue;
    const scale = cap / Math.abs(total);
    for (const hit of eventHits) hit.adjustedWeight = round6(hit.adjustedWeight * scale);
  }
}

function applyCategoryCap(hits: InternalHit[]) {
  const eventHits = hits.filter(hit => hit.sessionEventId && hit.category);
  const totalPositive = eventHits.reduce((sum, hit) => sum + Math.max(hit.adjustedWeight, 0), 0);
  if (totalPositive <= SCORE_EPSILON) return;
  const cap = totalPositive * RECTIFICATION_METHODOLOGY.scorePolicy.perCategoryShareCap;
  const categories = new Set(eventHits.flatMap(hit => hit.category ? [hit.category] : []));
  for (const category of categories) {
    const categoryHits = eventHits.filter(hit => hit.category === category && hit.adjustedWeight > 0);
    const categoryTotal = categoryHits.reduce((sum, hit) => sum + hit.adjustedWeight, 0);
    if (categoryTotal <= cap || categoryTotal <= SCORE_EPSILON) continue;
    const scale = cap / categoryTotal;
    for (const hit of categoryHits) hit.adjustedWeight = round6(hit.adjustedWeight * scale);
  }
}

function assignRanksAndIndices(scores: ScoredCandidate[]) {
  const values = scores.map(item => item.rawScore);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const ordered = [...scores].sort((a, b) => b.rawScore - a.rawScore || a.candidateId.localeCompare(b.candidateId));
  let previousScore: number | null = null;
  let previousRank = 0;
  ordered.forEach((item, index) => {
    if (previousScore === null || Math.abs(item.rawScore - previousScore) > SCORE_EPSILON) {
      previousRank = index + 1;
      previousScore = item.rawScore;
    }
    item.rank = previousRank;
  });
  const rankCounts = new Map<number, number>();
  for (const item of scores) rankCounts.set(item.rank, (rankCounts.get(item.rank) ?? 0) + 1);
  for (const item of scores) {
    item.tiedForRank = (rankCounts.get(item.rank) ?? 0) > 1;
    item.relativeEvidenceIndex = Math.abs(max - min) <= SCORE_EPSILON
      ? 50
      : round6((item.rawScore - min) / (max - min) * RECTIFICATION_METHODOLOGY.scorePolicy.displayScale);
  }
}

function calculateLeaveOneOutRates(
  candidates: RectificationCandidate[],
  rawHits: Map<string, InternalHit[]>,
  events: RectificationEventWithFacts[],
): Map<string, number> {
  if (events.length < RECTIFICATION_METHODOLOGY.scorePolicy.leaveOneEventOutMinimumEvents) return new Map();
  const topCounts = new Map(candidates.map(candidate => [candidate.id, 0]));
  for (const omitted of events) {
    const included = new Set(events.filter(event => event.id !== omitted.id).map(event => event.id));
    const scored = scoreCandidates(candidates, rawHits, included);
    const best = Math.max(...scored.map(item => item.rawScore));
    for (const candidate of scored.filter(item => Math.abs(item.rawScore - best) <= SCORE_EPSILON)) {
      topCounts.set(candidate.candidateId, (topCounts.get(candidate.candidateId) ?? 0) + 1);
    }
  }
  return new Map([...topCounts].map(([candidateId, count]) => [candidateId, round6(count / events.length)]));
}

function calculateTopMarginRatio(sorted: ScoredCandidate[], eventCount: number): number | null {
  if (sorted.length < 2) return null;
  const margin = sorted[0].rawScore - sorted[1].rawScore;
  const timeRule = findRule('reported-window-contains');
  const maximumPossibleDifference = timeRule.baseWeight * 2
    + eventCount * RECTIFICATION_METHODOLOGY.scorePolicy.perEventAbsoluteCap;
  return round6(margin / Math.max(maximumPossibleDifference, 1));
}

function countDiscriminatingGroups(scores: ScoredCandidate[]): number {
  const keys = new Set<string>();
  for (const candidate of scores) {
    for (const hit of candidate.hits) {
      if (hit.discriminating && Math.abs(hit.adjustedWeight) > SCORE_EPSILON) {
        keys.add(`${hit.sessionEventId ?? 'time'}:${hit.ruleId}`);
      }
    }
  }
  return keys.size;
}

function buildSafetyHits(
  session: RectificationSessionDetail,
  matrix: RectificationEventMatrix,
  candidates: RectificationCandidate[],
  indistinguishable: boolean,
): Map<string, InternalHit[]> {
  const insufficientRule = findRule('insufficient-event-guard');
  const indistinguishableRule = findRule('indistinguishable-candidate-guard');
  return new Map(candidates.map(candidate => [candidate.id, [
    createSafetyHit(session.id, candidate.id, insufficientRule, matrix.readiness.meetsMinimum ? 'neutral' : 'insufficient', {
      readiness: matrix.readiness,
    }),
    createSafetyHit(session.id, candidate.id, indistinguishableRule, indistinguishable ? 'insufficient' : 'neutral', {
      indistinguishable,
    }),
  ]]));
}

function createSafetyHit(
  sessionId: string,
  candidateId: string,
  rule: RectificationRuleDefinition,
  outcome: InternalHit['outcome'],
  evidence: Record<string, unknown>,
): InternalHit {
  return {
    sessionId,
    candidateId,
    sessionEventId: null,
    lifeEventId: null,
    category: null,
    ruleId: rule.id,
    ruleVersion: rule.version,
    outcome,
    rawWeight: 0,
    adjustedWeight: 0,
    discriminating: false,
    evidence,
    methodologyVersion: RECTIFICATION_METHODOLOGY_VERSION,
  };
}

function toCandidateEvaluation(
  scored: ScoredCandidate,
  input: EvaluationBuildInput,
  leaveOneEventOutTopRate: number | null,
  confidence: 'low' | 'medium',
  safetyHits: InternalHit[],
): RectificationCandidateEvaluation {
  const hits = [...scored.hits, ...safetyHits].map(hit => ({
    ...hit,
    id: randomUUID(),
    evaluationId: input.id,
    createdAt: input.evaluatedAt,
  }));
  return {
    candidateId: scored.candidateId,
    equivalentToCandidateId: null,
    rank: scored.rank,
    tiedForRank: scored.tiedForRank,
    rawScore: scored.rawScore,
    relativeEvidenceIndex: scored.relativeEvidenceIndex,
    confidence,
    supportCount: hits.filter(hit => (hit.outcome === 'support' || hit.outcome === 'weak_support') && hit.adjustedWeight > 0).length,
    conflictCount: hits.filter(hit => hit.outcome === 'conflict' && hit.adjustedWeight < 0).length,
    insufficientCount: hits.filter(hit => hit.outcome === 'insufficient').length,
    leaveOneEventOutTopRate,
    eventContributions: scored.eventContributions,
    categoryContributions: scored.categoryContributions,
    ruleHits: hits,
  };
}

function resolveReportedWindow(session: RectificationSessionDetail): {
  slotKeys: Set<RectificationCandidate['slotKey']> | null;
  allowConflict: boolean;
  reason: string;
} {
  const evidence = session.reportedTimeEvidence;
  if (evidence.precision === 'unknown' || !evidence.reportedStartLocal) {
    return { slotKeys: null, allowConflict: false, reason: '没有可用于比较的出生时间记录。' };
  }
  const allowConflict = STRONG_TIME_SOURCES.has(evidence.source) && evidence.precision !== 'approximate';
  if ((evidence.precision === 'exact' || evidence.precision === 'approximate') && session.timeConversion) {
    return {
      slotKeys: new Set([session.timeConversion.slotKey]),
      allowConflict,
      reason: '使用 M5-1 已保存的真太阳时换算时段。',
    };
  }
  if ((evidence.precision !== 'range' && evidence.precision !== 'period')
    || !evidence.reportedEndLocal || !evidence.timezoneId || evidence.longitude === null) {
    return { slotKeys: null, allowConflict: false, reason: '时间范围缺少时区、经度或结束时间，无法形成排除证据。' };
  }
  try {
    const baseDate = formatDate(session.baseBirthInfo.year, session.baseBirthInfo.month, session.baseBirthInfo.day);
    const overnight = evidence.reportedEndLocal <= evidence.reportedStartLocal;
    const endDate = overnight ? addDays(baseDate, 1) : baseDate;
    const start = convertCivilTimeToApparentSolar({
      date: baseDate,
      time: evidence.reportedStartLocal,
      timeZoneId: evidence.timezoneId,
      longitude: evidence.longitude,
    });
    const end = convertCivilTimeToApparentSolar({
      date: endDate,
      time: evidence.reportedEndLocal,
      timeZoneId: evidence.timezoneId,
      longitude: evidence.longitude,
    });
    const startAbs = start.dayOffset * 1440 + start.apparentSolarMinutes;
    const inputDayOffset = overnight ? 1 : 0;
    let endAbs = inputDayOffset * 1440 + end.dayOffset * 1440 + end.apparentSolarMinutes;
    if (endAbs < startAbs) endAbs += 1440;
    const slotKeys = new Set<RectificationCandidate['slotKey']>();
    for (const slot of RECTIFICATION_METHODOLOGY.timePolicy.slots) {
      const slotStart = parseClockMinutes(slot.apparentSolarStart);
      const slotEnd = parseClockMinutes(slot.apparentSolarEnd) + 1;
      if ([-1440, 0, 1440, 2880].some(shift => intervalsOverlap(startAbs, endAbs, slotStart + shift, slotEnd + shift))) {
        slotKeys.add(slot.key);
      }
    }
    return { slotKeys, allowConflict, reason: '时间范围已按历史时区、经度和均时差换算为真太阳时窗口。' };
  } catch (error) {
    return {
      slotKeys: null,
      allowConflict: false,
      reason: error instanceof Error ? error.message : '时间范围换算失败。',
    };
  }
}

function buildWarnings(
  input: EvaluationBuildInput,
  eventCount: number,
  discriminatingRuleCount: number,
  topCount: number,
  topMarginRatio: number | null,
  topRate: number | null,
): string[] {
  const policy = RECTIFICATION_METHODOLOGY.scorePolicy;
  const warnings = [...input.matrix.readiness.warnings];
  if (eventCount < policy.leaveOneEventOutMinimumEvents) warnings.push(`至少需要 ${policy.leaveOneEventOutMinimumEvents} 个可评分事件才能执行留一事件稳定性检查。`);
  if (discriminatingRuleCount === 0) warnings.push('当前规则在候选之间没有产生有效区分，所有候选应并列看待。');
  if (topCount > 1) warnings.push('第一名存在并列候选，不能强行确定单一时辰。');
  if (topMarginRatio !== null && topMarginRatio < policy.minimumTopMarginRatio) warnings.push('前两名差距不足，候选暂不可区分。');
  if (topRate !== null && topRate < policy.stableTopCandidateRate) warnings.push('留一事件检查显示第一候选不稳定，结果依赖个别事件。');
  if (input.session.candidates.some(candidate => candidate.duplicateOfCandidateId)) warnings.push('存在结构完全相同的重复候选，重复候选不重复参与排名。');
  warnings.push('V1 权重尚未经过真实样本盲测校准，结果只能作为传统文化研究中的当前工作假设。');
  return [...new Set(warnings)];
}

function findRule(id: string): RectificationRuleDefinition {
  const rule = RECTIFICATION_METHODOLOGY.rules.find(item => item.id === id && item.enabled);
  if (!rule) throw new Error(`缺少启用的校时规则：${id}`);
  return rule;
}

function parseClockMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.max(aStart, bStart) < Math.min(aEnd, bEnd);
}

function formatDate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return formatDate(result.getUTCFullYear(), result.getUTCMonth() + 1, result.getUTCDate());
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
