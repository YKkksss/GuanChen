import { auditBaziHiddenStemTouchOccurrenceSet } from './hidden-stem-activation-engine';
import type { BaziHiddenStemActivationSegment } from './hidden-stem-activation-types';
import type { BaziMonthDayRelationResult } from './month-day-relation-types';
import {
  BAZI_MONTH_DAY_VISIBILITY_ENGINE_VERSION,
  BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY,
  BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY_VERSION,
} from './month-day-visibility-methodology';
import type {
  BaziMonthDayVisibilityResult,
  BaziMonthDayVisibilitySegment,
} from './month-day-visibility-types';
import {
  auditBaziTenGodRepeatSegment,
  buildBaziDynamicTenGodOccurrences,
  buildBaziNatalTenGodOccurrences,
} from './ten-god-repeat-engine';
import { auditBaziTransparencyRootOccurrenceSet } from './transparency-root-engine';
import type { BaziTransparencyRootSegment } from './transparency-root-types';
import type { BaziCalculationResult } from './types';

export function auditBaziMonthDayVisibilityConditions(
  chart: BaziCalculationResult,
  relation: BaziMonthDayRelationResult,
): BaziMonthDayVisibilityResult {
  const natalOccurrences = buildBaziNatalTenGodOccurrences(chart);
  const segments = relation.segments.map(segment => {
    const repeatAudit = auditBaziTenGodRepeatSegment({
      dayMasterStem: chart.dayMaster.stem,
      natalOccurrences,
      dynamicLayers: segment.layers,
      relationSegment: { segmentIndex: segment.segmentIndex, evidence: segment.evidence },
      segmentIndex: segment.segmentIndex,
      startAt: segment.startAt,
      endAtExclusive: segment.endAtExclusive,
      luckCycleIndex: segment.luckCycleIndex,
      luckCycleGanZhi: segment.luckCycleGanZhi,
      label: segment.label,
      focusLayers: ['month', 'day'],
    });
    const occurrences = [
      ...natalOccurrences,
      ...segment.layers.flatMap(buildBaziDynamicTenGodOccurrences),
    ];
    const transparency = auditBaziTransparencyRootOccurrenceSet({
      occurrences,
      repeatSegment: repeatAudit,
      focusLayers: ['month', 'day'],
    });
    const transparencyRootAudit: BaziTransparencyRootSegment = {
      segmentIndex: segment.segmentIndex,
      startAt: segment.startAt,
      endAtExclusive: segment.endAtExclusive,
      luckCycleIndex: segment.luckCycleIndex,
      luckCycleGanZhi: segment.luckCycleGanZhi,
      label: segment.label,
      ...transparency,
      boundary: '只保留有流月或流日参与的透出、严格同干根与同五行支持候选；不折算强弱。',
    };
    const hiddenTouch = auditBaziHiddenStemTouchOccurrenceSet({
      occurrences,
      relationSegment: { segmentIndex: segment.segmentIndex, evidence: segment.evidence },
      adjudicationSegment: { decisions: segment.decisions },
      repeatSegment: repeatAudit,
      transparencySegment: transparencyRootAudit,
      focusLayers: ['month', 'day'],
    });
    const hiddenStemTouchAudit: BaziHiddenStemActivationSegment = {
      segmentIndex: segment.segmentIndex,
      startAt: segment.startAt,
      endAtExclusive: segment.endAtExclusive,
      luckCycleIndex: segment.luckCycleIndex,
      luckCycleGanZhi: segment.luckCycleGanZhi,
      label: segment.label,
      ...hiddenTouch,
      boundary: '只保留流月或流日自身藏干，或被流月流日入口触达的藏干候选；不宣告已经发动。',
    };
    return buildSegment(segment, repeatAudit, transparencyRootAudit, hiddenStemTouchAudit);
  });
  const available = relation.status !== 'sequence_only_unavailable';
  return {
    methodologyVersion: BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY_VERSION,
    engineVersion: BAZI_MONTH_DAY_VISIBILITY_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    status: relation.status,
    capabilities: {
      monthDayRepeatAudit: available,
      monthDayTransparencyAudit: available,
      monthDayRootConditionAudit: available,
      monthDayHiddenStemTouchAudit: available,
      exactDaySegmentBoundary: available,
      transparencyEffectVerdict: false,
      rootStrengthVerdict: false,
      hiddenStemActivationVerdict: false,
      strengthEffectVerdict: false,
      fortuneInterpretation: false,
      eventPrediction: false,
    },
    source: {
      chartMethodologyVersion: chart.methodologyVersion,
      chartEngineVersion: chart.engineVersion,
      chartCompleteness: chart.completeness,
      monthDayRelationMethodologyVersion: relation.methodologyVersion,
      monthDayRelationEngineVersion: relation.engineVersion,
      monthDayRelationStatus: relation.status,
      targetYear: relation.source.targetYear,
      targetDate: relation.target.effectiveDate,
      lateZiPolicy: relation.source.lateZiPolicy,
    },
    target: {
      effectiveDate: relation.target.effectiveDate,
      dayGanZhi: relation.target.dayGanZhi,
      segmentCount: segments.length,
    },
    segments,
    counts: sumCounts(segments),
    rulesApplied: [...BAZI_MONTH_DAY_VISIBILITY_METHODOLOGY.deterministicOutputs],
    warnings: available ? [
      '重复簇只统计位置，同干或同十神同见不等于力量叠加。',
      '透出、严格同干根和同五行支持均为条件证据，不裁决有效性与强弱。',
      '藏干触达只表示命中已开放入口，不等于已经引动、发动或作用。',
      '跨节或跨运流日必须逐片段读取，不得把前后证据合并。',
      ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，时柱显隐位置与相关条件未参与审计。'] : []),
    ] : ['M9-15 未生成精确流日片段，M9-16 不补写显隐、透根或藏干触达证据。'],
    boundary: '本结果只审计流月、流日参与的显隐重复、透干通根与藏干触达条件；不得据此计算旺衰、格局成败、喜忌、吉凶或具体事件。',
  };
}

function buildSegment(
  source: BaziMonthDayRelationResult['segments'][number],
  repeatAudit: BaziMonthDayVisibilitySegment['repeatAudit'],
  transparencyRootAudit: BaziTransparencyRootSegment,
  hiddenStemTouchAudit: BaziHiddenStemActivationSegment,
): BaziMonthDayVisibilitySegment {
  const counts = {
    stemClusters: repeatAudit.counts.stemClusters,
    tenGodClusters: repeatAudit.counts.tenGodClusters,
    transparencyMatched: transparencyRootAudit.counts.transparencyMatched,
    exactSameStemRoots: transparencyRootAudit.counts.exactSameStemRoots,
    sameElementSupportOnly: transparencyRootAudit.counts.sameElementSupportOnly,
    touchedHiddenStems: hiddenStemTouchAudit.counts.touchedCandidates,
    multipleTouchConditions: hiddenStemTouchAudit.counts.multipleTouchConditions,
  };
  return {
    segmentIndex: source.segmentIndex,
    startAt: source.startAt,
    endAtExclusive: source.endAtExclusive,
    annualYear: source.annualYear,
    annualGanZhi: source.annualGanZhi,
    monthIndex: source.monthIndex,
    monthGanZhi: source.monthGanZhi,
    dayGanZhi: source.dayGanZhi,
    luckCycleIndex: source.luckCycleIndex,
    luckCycleGanZhi: source.luckCycleGanZhi,
    label: source.label,
    repeatAudit,
    transparencyRootAudit,
    hiddenStemTouchAudit,
    counts,
    boundary: '本片段的显隐、透根和触达候选均来自同一精确五层快照，不能跨片段累计。',
  };
}

function sumCounts(segments: BaziMonthDayVisibilitySegment[]): BaziMonthDayVisibilityResult['counts'] {
  return segments.reduce((total, segment) => ({
    segments: total.segments + 1,
    stemClusters: total.stemClusters + segment.counts.stemClusters,
    tenGodClusters: total.tenGodClusters + segment.counts.tenGodClusters,
    transparencyMatched: total.transparencyMatched + segment.counts.transparencyMatched,
    exactSameStemRoots: total.exactSameStemRoots + segment.counts.exactSameStemRoots,
    sameElementSupportOnly: total.sameElementSupportOnly + segment.counts.sameElementSupportOnly,
    touchedHiddenStems: total.touchedHiddenStems + segment.counts.touchedHiddenStems,
    multipleTouchConditions: total.multipleTouchConditions + segment.counts.multipleTouchConditions,
  }), {
    segments: 0,
    stemClusters: 0,
    tenGodClusters: 0,
    transparencyMatched: 0,
    exactSameStemRoots: 0,
    sameElementSupportOnly: 0,
    touchedHiddenStems: 0,
    multipleTouchConditions: 0,
  });
}
