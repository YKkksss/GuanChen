import { createHash, randomUUID } from 'node:crypto';
import { getLifeEvent } from '@/lib/db/events';
import {
  deleteRectificationEvent,
  findRectificationEventByDeduplicationKey,
  getRectificationEvent,
  insertRectificationEventWithFacts,
  listRectificationEvents,
  updateRectificationEventEvidence,
} from '@/lib/db/rectification-events';
import { getRectificationSession } from '@/lib/db/rectifications';
import { getEventYears } from '@/lib/events/service';
import type { LifeEvent, LifeEventInput } from '@/lib/events/types';
import { parseLifeEventInput } from '@/lib/events/validation';
import { buildAnnualTransitSnapshot, TRANSIT_ENGINE_VERSION } from '@/lib/transits/engine';
import type { AnnualTransitSnapshot } from '@/lib/transits/types';
import {
  RECTIFICATION_METHODOLOGY,
  RECTIFICATION_METHODOLOGY_VERSION,
  getRectificationTopicMapping,
} from './methodology';
import type {
  AttachRectificationEventInput,
  RectificationCandidate,
  RectificationCandidateEventFact,
  RectificationCandidateEventFactSnapshot,
  RectificationEventEvidence,
  RectificationEventEvidenceQuality,
  RectificationEventMatrix,
  RectificationEventSnapshot,
  RectificationEventWithFacts,
  RectificationEventYearRelationship,
  RectificationEvidenceReadiness,
  RectificationTopicFact,
} from './types';

const MAX_RECTIFICATION_EVENT_YEARS = 30;
const VALID_EVIDENCE_QUALITIES = new Set<RectificationEventEvidenceQuality>([
  'documented', 'corroborated_memory', 'single_person_memory',
  'conversation_extracted', 'unconfirmed',
]);

export function attachRectificationEvent(
  sessionId: string,
  input: AttachRectificationEventInput,
): RectificationEventWithFacts {
  const session = getRectificationSession(sessionId);
  if (!session) throw new Error('校时会话不存在');
  assertEvidenceQuality(input.evidenceQuality);
  if (Boolean(input.lifeEventId) === Boolean(input.event)) {
    throw new Error('lifeEventId 和 event 必须且只能提供一个');
  }

  let lifeEventId: string | null = null;
  let sourceEventUpdatedAt: number | null = null;
  let snapshot: RectificationEventSnapshot;
  let sourceConfirmed = false;
  if (input.lifeEventId) {
    const sourceEvent = getLifeEvent(input.lifeEventId);
    if (!sourceEvent) throw new Error('人生事件不存在');
    if (session.sourceConversationId && sourceEvent.conversationId !== session.sourceConversationId) {
      throw new Error('人生事件不属于该校时会话关联的对话');
    }
    lifeEventId = sourceEvent.id;
    sourceEventUpdatedAt = sourceEvent.updatedAt;
    snapshot = snapshotLifeEvent(sourceEvent);
    sourceConfirmed = sourceEvent.confirmedByUser;
  } else {
    snapshot = snapshotLifeEventInput(input.event!);
    sourceConfirmed = input.event!.confirmedByUser !== false;
  }

  validateSnapshotYears(session.baseBirthInfo.year, snapshot);
  const userConfirmed = input.userConfirmed ?? sourceConfirmed;
  const deduplicationKey = buildEventDeduplicationKey(snapshot);
  if (findRectificationEventByDeduplicationKey(sessionId, deduplicationKey)) {
    throw new Error('该校时会话中已经存在相同事件，不能重复关联或重复计入');
  }

  const eventId = randomUUID();
  const now = Date.now();
  const event: RectificationEventEvidence = {
    id: eventId,
    sessionId,
    lifeEventId,
    deduplicationKey,
    snapshot,
    evidenceQuality: input.evidenceQuality,
    userConfirmed,
    scoreEligible: isScoreEligible(snapshot, input.evidenceQuality, userConfirmed),
    methodologyVersion: RECTIFICATION_METHODOLOGY_VERSION,
    sourceEventUpdatedAt,
    createdAt: now,
    updatedAt: now,
  };
  const facts = buildCandidateEventFacts(event, session.candidates, now);
  return insertRectificationEventWithFacts({ event, facts });
}

export function findRectificationEventMatrix(sessionId: string): RectificationEventMatrix {
  const session = getRectificationSession(sessionId);
  if (!session) throw new Error('校时会话不存在');
  const candidateOrder = new Map(session.candidates.map((candidate, index) => [candidate.id, index]));
  const events = listRectificationEvents(sessionId).map(event => ({
    ...event,
    facts: [...event.facts].sort((a, b) => (
      a.eventYear - b.eventYear
      || (candidateOrder.get(a.candidateId) ?? 999) - (candidateOrder.get(b.candidateId) ?? 999)
    )),
  }));
  return {
    sessionId,
    methodologyVersion: RECTIFICATION_METHODOLOGY_VERSION,
    readiness: buildEvidenceReadiness(events),
    events,
  };
}

export function findRectificationEvents(sessionId: string): RectificationEventWithFacts[] {
  if (!getRectificationSession(sessionId)) throw new Error('校时会话不存在');
  return listRectificationEvents(sessionId);
}

export function reviseRectificationEventEvidence(input: {
  sessionId: string;
  eventId: string;
  evidenceQuality: RectificationEventEvidenceQuality;
  userConfirmed: boolean;
}): RectificationEventWithFacts | null {
  assertEvidenceQuality(input.evidenceQuality);
  const existing = getRectificationEvent(input.sessionId, input.eventId);
  if (!existing) return null;
  return updateRectificationEventEvidence({
    ...input,
    scoreEligible: isScoreEligible(existing.snapshot, input.evidenceQuality, input.userConfirmed),
  });
}

export function removeRectificationEvent(sessionId: string, eventId: string): boolean {
  return deleteRectificationEvent(sessionId, eventId);
}

export function buildEvidenceReadiness(
  events: RectificationEventEvidence[],
): RectificationEvidenceReadiness {
  const policy = RECTIFICATION_METHODOLOGY.scorePolicy;
  const eligible = events.filter(event => event.scoreEligible);
  const categories = new Set(eligible.map(event => event.snapshot.category));
  const meetsMinimum = eligible.length >= policy.minimumConfirmedEvents
    && categories.size >= policy.minimumDistinctCategories;
  const meetsRecommended = eligible.length >= policy.recommendedConfirmedEvents
    && categories.size >= policy.recommendedDistinctCategories;
  const warnings: string[] = [];
  if (eligible.length < policy.minimumConfirmedEvents) {
    warnings.push(`至少需要 ${policy.minimumConfirmedEvents} 个已确认且可评分的事件，当前为 ${eligible.length} 个。`);
  }
  if (categories.size < policy.minimumDistinctCategories) {
    warnings.push(`至少需要覆盖 ${policy.minimumDistinctCategories} 个可评分事件类别，当前为 ${categories.size} 个。`);
  }
  if (events.some(event => !event.userConfirmed)) warnings.push('存在未由用户确认的事件，不会进入后续评分。');
  if (events.some(event => event.snapshot.datePrecision === 'unknown')) warnings.push('存在日期不详事件，只保存证据，不生成年度事实。');
  if (events.some(event => event.snapshot.category === 'custom')) warnings.push('未映射的自定义事件不能参与评分。');
  return {
    totalEvents: events.length,
    confirmedEligibleEvents: eligible.length,
    distinctScoreableCategories: categories.size,
    minimumRequiredEvents: policy.minimumConfirmedEvents,
    minimumRequiredCategories: policy.minimumDistinctCategories,
    recommendedEvents: policy.recommendedConfirmedEvents,
    recommendedCategories: policy.recommendedDistinctCategories,
    meetsMinimum,
    meetsRecommended,
    warnings,
  };
}

function buildCandidateEventFacts(
  event: RectificationEventEvidence,
  candidates: RectificationCandidate[],
  now: number,
): RectificationCandidateEventFact[] {
  const years = getEventYears(event.snapshot);
  if (years.length > MAX_RECTIFICATION_EVENT_YEARS) {
    throw new Error(`校时事件日期范围不能超过 ${MAX_RECTIFICATION_EVENT_YEARS} 年，请改用关键起止事件`);
  }
  const relationships = buildYearRelationships(years, event.snapshot.datePrecision === 'range');
  const facts: RectificationCandidateEventFact[] = [];
  for (const candidate of candidates) {
    for (const [index, eventYear] of years.entries()) {
      const relationship = relationships[index];
      const annualTransit = buildAnnualTransitSnapshot(candidate.chartSnapshot, eventYear);
      const snapshot: RectificationCandidateEventFactSnapshot = {
        eventYear,
        relationship,
        annualTransit,
        topicFact: buildTopicFact(event.snapshot.category, annualTransit),
      };
      facts.push({
        id: randomUUID(),
        sessionEventId: event.id,
        candidateId: candidate.id,
        eventYear,
        relationship,
        candidateChartFingerprint: candidate.chartFingerprint,
        transitEngineVersion: TRANSIT_ENGINE_VERSION,
        methodologyVersion: RECTIFICATION_METHODOLOGY_VERSION,
        inputFingerprint: buildFactInputFingerprint(event, candidate, eventYear),
        snapshot,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return facts;
}

function buildTopicFact(category: RectificationEventSnapshot['category'], transit: AnnualTransitSnapshot): RectificationTopicFact {
  const mapping = getRectificationTopicMapping(category);
  const allTopicPalaces = new Set([...mapping.primaryPalaces, ...mapping.secondaryPalaces]);
  const matchingPalace = (name: string | null): name is RectificationTopicFact['primaryPalaces'][number] => (
    name !== null && allTopicPalaces.has(name as RectificationTopicFact['primaryPalaces'][number])
  );
  const decadalMatches = matchingPalace(transit.decadal.nativePalaceName)
    ? [transit.decadal.nativePalaceName]
    : [];
  const annualFlowMatches = matchingPalace(transit.flowYear.nativePalaceName)
    ? [transit.flowYear.nativePalaceName]
    : [];
  const annualKeyPalaceMatches = [...new Set(
    transit.keyPalaces.map(item => item.nativePalaceName).filter(matchingPalace),
  )];
  const annualTransformationMatches = transit.transformations.flatMap(item => (
    matchingPalace(item.natalPalaceName)
      ? [{ palace: item.natalPalaceName, starName: item.starName, type: item.type }]
      : []
  ));
  return {
    category,
    scoreable: mapping.scoreable,
    primaryPalaces: mapping.primaryPalaces,
    secondaryPalaces: mapping.secondaryPalaces,
    decadalMatches,
    annualFlowMatches,
    annualKeyPalaceMatches,
    annualTransformationMatches,
  };
}

function snapshotLifeEvent(event: LifeEvent): RectificationEventSnapshot {
  return {
    title: event.title,
    category: event.category,
    customCategory: event.customCategory,
    startDate: event.startDate,
    endDate: event.endDate,
    datePrecision: event.datePrecision,
    description: event.description,
    impactLevel: event.impactLevel,
    source: event.source,
  };
}

function snapshotLifeEventInput(event: LifeEventInput): RectificationEventSnapshot {
  const validated = parseLifeEventInput(event as unknown as Record<string, unknown>);
  return {
    title: validated.title,
    category: validated.category,
    customCategory: validated.customCategory ?? null,
    startDate: validated.startDate,
    endDate: validated.endDate ?? null,
    datePrecision: validated.datePrecision,
    description: validated.description ?? null,
    impactLevel: validated.impactLevel,
    source: event.source ?? 'user_input',
  };
}

function buildEventDeduplicationKey(event: RectificationEventSnapshot): string {
  const normalizedTitle = event.title.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]/gu, '');
  const raw = [event.category, event.customCategory ?? '', event.startDate, event.endDate ?? '', normalizedTitle].join('|');
  return createHash('sha256').update(raw).digest('hex');
}

function buildFactInputFingerprint(
  event: RectificationEventEvidence,
  candidate: RectificationCandidate,
  eventYear: number,
): string {
  return createHash('sha256').update(JSON.stringify({
    eventKey: event.deduplicationKey,
    eventYear,
    candidateChartFingerprint: candidate.chartFingerprint,
    transitEngineVersion: TRANSIT_ENGINE_VERSION,
    methodologyVersion: RECTIFICATION_METHODOLOGY_VERSION,
  })).digest('hex');
}

function buildYearRelationships(
  years: number[],
  isRange: boolean,
): RectificationEventYearRelationship[] {
  return years.map((_, index) => {
    if (!isRange || years.length === 1) return 'occurs_in';
    if (index === 0) return 'starts_in';
    if (index === years.length - 1) return 'ends_in';
    return 'continues_in';
  });
}

function isScoreEligible(
  snapshot: RectificationEventSnapshot,
  quality: RectificationEventEvidenceQuality,
  userConfirmed: boolean,
): boolean {
  return userConfirmed
    && quality !== 'unconfirmed'
    && snapshot.datePrecision !== 'unknown'
    && getRectificationTopicMapping(snapshot.category).scoreable;
}

function validateSnapshotYears(birthYear: number, event: RectificationEventSnapshot) {
  const years = getEventYears(event);
  const latestYear = Math.min(birthYear + 130, 2200);
  const invalid = years.find(year => year < birthYear || year > latestYear);
  if (invalid !== undefined) throw new Error(`校时事件年份必须在 ${birthYear} 至 ${latestYear} 之间`);
}

function assertEvidenceQuality(value: RectificationEventEvidenceQuality) {
  if (!VALID_EVIDENCE_QUALITIES.has(value)) throw new Error('事件证据质量无效');
}
