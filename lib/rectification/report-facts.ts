import { createHash } from 'node:crypto';
import { LIFE_EVENT_CATEGORY_LABELS } from '@/lib/events/types';
import { BRANCHES } from '@/lib/ziwei/constants';
import type { RectificationReportBuildResult, RectificationReportEvidenceDraft } from './report-types';
import type {
  RectificationCandidate,
  RectificationEvaluation,
  RectificationEventMatrix,
  RectificationSelection,
  RectificationSessionDetail,
  RectificationTimeSlotKey,
} from './types';

const SLOT_LABELS: Record<RectificationTimeSlotKey, string> = {
  early_zi: '早子时', chou: '丑时', yin: '寅时', mao: '卯时', chen: '辰时', si: '巳时',
  wu: '午时', wei: '未时', shen: '申时', you: '酉时', xu: '戌时', hai: '亥时', late_zi: '晚子时',
};

export function buildRectificationReportFacts(input: {
  session: RectificationSessionDetail;
  evaluation: RectificationEvaluation;
  matrix: RectificationEventMatrix;
  selection: RectificationSelection | null;
}): RectificationReportBuildResult {
  const { session, evaluation, matrix, selection } = input;
  const candidatesById = new Map(session.candidates.map(candidate => [candidate.id, candidate]));
  const candidateEvaluations = evaluation.candidates
    .filter(item => !item.equivalentToCandidateId)
    .sort((a, b) => a.rank - b.rank || b.relativeEvidenceIndex - a.relativeEvidenceIndex);
  const candidates = candidateEvaluations.map(item => {
    const candidate = candidatesById.get(item.candidateId);
    if (!candidate) throw new Error('评估中的候选命盘已经不存在');
    const mingPalace = candidate.chartSnapshot.palaces.find(palace => palace.branch === candidate.chartSnapshot.mingGongBranch);
    const shenPalace = candidate.chartSnapshot.palaces.find(palace => palace.branch === candidate.chartSnapshot.shenGongBranch);
    return {
      candidateId: candidate.id,
      slotKey: candidate.slotKey,
      slotLabel: SLOT_LABELS[candidate.slotKey],
      rank: item.rank,
      tiedForRank: item.tiedForRank,
      relativeEvidenceIndex: item.relativeEvidenceIndex,
      confidence: item.confidence,
      supportCount: item.supportCount,
      conflictCount: item.conflictCount,
      leaveOneEventOutTopRate: item.leaveOneEventOutTopRate,
      chartFingerprint: candidate.chartFingerprint,
      chartDate: candidate.chartDate,
      mingGong: `${BRANCHES[candidate.chartSnapshot.mingGongBranch]}宫`,
      shenGong: `${shenPalace?.name ?? BRANCHES[candidate.chartSnapshot.shenGongBranch]}（${BRANCHES[candidate.chartSnapshot.shenGongBranch]}宫）`,
      wuxingJu: candidate.chartSnapshot.wuxingJuName,
      mingGongMajorStars: mingPalace?.stars.filter(star => star.type === 'major').map(star => star.name) ?? [],
    };
  });

  const factPack = {
    schemaVersion: 1 as const,
    sessionId: session.id,
    sessionTitle: session.title,
    evaluationId: evaluation.id,
    evaluationVersion: evaluation.version,
    methodologyVersion: evaluation.methodologyVersion,
    evaluationEngineVersion: evaluation.evaluationEngineVersion,
    evaluatedAt: evaluation.evaluatedAt,
    stable: evaluation.stable,
    topMarginRatio: evaluation.topMarginRatio,
    readiness: evaluation.readiness,
    readinessChecks: {
      minimumEventCountSatisfied: evaluation.readiness.confirmedEligibleEvents >= evaluation.readiness.minimumRequiredEvents,
      recommendedEventCountSatisfied: evaluation.readiness.confirmedEligibleEvents >= evaluation.readiness.recommendedEvents,
      minimumCategoryCountSatisfied: evaluation.readiness.distinctScoreableCategories >= evaluation.readiness.minimumRequiredCategories,
      recommendedCategoryCountSatisfied: evaluation.readiness.distinctScoreableCategories >= evaluation.readiness.recommendedCategories,
    },
    selectedCandidateId: selection?.candidateId ?? null,
    selectionId: selection?.id ?? null,
    selectionNote: selection?.note ?? null,
    candidates,
    warnings: evaluation.warnings,
    disclaimer: evaluation.disclaimer,
  };

  const evidence: RectificationReportEvidenceDraft[] = [
    {
      evidenceKey: 'evaluation:summary',
      kind: 'evaluation_summary',
      label: `规则评估 V${evaluation.version}`,
      facts: factPack,
    },
    {
      evidenceKey: 'evaluation:stability',
      kind: 'stability',
      label: evaluation.stable ? '留一事件检验稳定' : '留一事件检验尚不稳定',
      facts: {
        stable: evaluation.stable,
        topMarginRatio: evaluation.topMarginRatio,
        discriminatingRuleCount: evaluation.discriminatingRuleCount,
        readiness: evaluation.readiness,
        warnings: evaluation.warnings,
      },
    },
  ];

  for (const candidate of candidates) {
    evidence.push({
      evidenceKey: `candidate:${candidate.candidateId}`,
      kind: 'candidate_summary',
      label: `${candidate.slotLabel} · 第 ${candidate.rank} 位`,
      facts: candidate,
    });
    const evaluationItem = evaluation.candidates.find(item => item.candidateId === candidate.candidateId)!;
    for (const hit of evaluationItem.ruleHits.filter(item => item.discriminating || item.outcome === 'conflict')) {
      evidence.push({
        evidenceKey: `rule:${hit.id}`,
        kind: 'rule_hit',
        label: `${candidate.slotLabel} · ${hit.ruleId} · ${hit.outcome}`,
        facts: {
          candidateId: hit.candidateId,
          slotLabel: candidate.slotLabel,
          ruleId: hit.ruleId,
          outcome: hit.outcome,
          adjustedWeight: hit.adjustedWeight,
          category: hit.category,
          sessionEventId: hit.sessionEventId,
          evidence: hit.evidence,
        },
      });
    }
  }

  for (const event of matrix.events.filter(item => item.userConfirmed && item.scoreEligible)) {
    evidence.push({
      evidenceKey: `event:${event.id}`,
      kind: 'confirmed_event',
      label: `已确认事件：${event.snapshot.title}`,
      facts: {
        eventId: event.id,
        title: event.snapshot.title,
        category: event.snapshot.category,
        categoryLabel: LIFE_EVENT_CATEGORY_LABELS[event.snapshot.category],
        startDate: event.snapshot.startDate,
        endDate: event.snapshot.endDate,
        datePrecision: event.snapshot.datePrecision,
        impactLevel: event.snapshot.impactLevel,
        evidenceQuality: event.evidenceQuality,
      },
    });
  }

  if (selection) {
    const selected = candidates.find(item => item.candidateId === selection.candidateId);
    evidence.push({
      evidenceKey: `selection:${selection.id}`,
      kind: 'selection',
      label: `人工选定：${selected?.slotLabel ?? '候选命盘'}`,
      facts: {
        selectionId: selection.id,
        candidateId: selection.candidateId,
        evaluationId: selection.evaluationId,
        rank: selection.rank,
        relativeEvidenceIndex: selection.relativeEvidenceIndex,
        confidence: selection.confidence,
        stable: selection.stable,
        note: selection.note,
        createdAt: selection.createdAt,
      },
    });
  }

  return { factPack, evidence, candidateEvaluations };
}

export function buildRectificationReportInputFingerprint(input: {
  evaluationId: string;
  evaluationInputFingerprint: string;
  selectionId: string | null;
}): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

export function candidateForSelection(
  session: RectificationSessionDetail,
  selection: RectificationSelection,
): RectificationCandidate {
  const candidate = session.candidates.find(item => item.id === selection.candidateId);
  if (!candidate) throw new Error('已选候选命盘不存在');
  return candidate;
}
