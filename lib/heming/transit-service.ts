import { createHash } from 'node:crypto';
import { getConversation } from '@/lib/db/conversations';
import {
  getHemingTransitSnapshot,
  upsertHemingTransitSnapshot,
} from '@/lib/db/heming-transits';
import { buildAnnualTransitSnapshot, TRANSIT_ENGINE_VERSION } from '@/lib/transits/engine';
import type { AnnualTransitSnapshot } from '@/lib/transits/types';
import type { BirthInfo, ZiweiChart } from '@/lib/ziwei/types';
import { evaluateHeming } from './engine';
import { normalizePalaceName } from './facts';
import {
  getRelationshipDefinition,
  HEMING_METHODOLOGY_VERSION,
} from './methodology';
import type {
  ChartOwner,
  HemingRelationshipContext,
  RelationshipType,
} from './types';
import type {
  HemingAnnualDimensionView,
  HemingAnnualOwnerView,
  HemingAnnualPalaceActivation,
  HemingTransitSnapshotRecord,
} from './transit-types';

const DISCLAIMER = '年度触发只表示相关关系主题在所选年份更值得观察，不代表必然发生结婚、分手、签约、投资收益或其他确定事件。';

export function getOrCreateHemingAnnualTransit(
  conversationId: string,
  selectedYear: number,
): HemingTransitSnapshotRecord {
  const conversation = getConversation(conversationId);
  if (!conversation || conversation.type !== 'heming') throw new Error('合盘会话不存在');
  if (!conversation.chartSnapshotA || !conversation.chartSnapshotB || !conversation.relationshipType) {
    throw new Error('合盘会话缺少双命盘或关系类型');
  }

  const chartA = mergePersistedBirthInfo(conversation.chartSnapshotA, conversation.birthInfoA);
  const chartB = mergePersistedBirthInfo(conversation.chartSnapshotB, conversation.birthInfoB);
  const minYear = Math.max(chartA.birthInfo.year, chartB.birthInfo.year);
  const maxYear = Math.min(chartA.birthInfo.year + 130, chartB.birthInfo.year + 130, 2200);
  if (!Number.isInteger(selectedYear) || selectedYear < minYear || selectedYear > maxYear) {
    throw new Error(`年份必须在 ${minYear} 至 ${maxYear} 之间`);
  }

  const chartEngineVersion = conversation.engineVersion || 'ziwei-v1';
  const inputFingerprint = fingerprint({
    relationshipType: conversation.relationshipType,
    relationshipContext: conversation.relationshipContext,
    chartA,
    chartB,
  });
  const lookup = {
    conversationId,
    selectedYear,
    chartEngineVersion,
    transitEngineVersion: TRANSIT_ENGINE_VERSION,
    methodologyVersion: HEMING_METHODOLOGY_VERSION,
  };
  const cached = getHemingTransitSnapshot(lookup);
  if (cached?.snapshot.inputFingerprint === inputFingerprint) return cached;

  const transitA = buildAnnualTransitSnapshot(chartA, selectedYear);
  const transitB = buildAnnualTransitSnapshot(chartB, selectedYear);
  const selectedChartA = alignChartToTransit(chartA, transitA);
  const selectedChartB = alignChartToTransit(chartB, transitB);
  const evaluation = evaluateHeming({
    chartA: selectedChartA,
    chartB: selectedChartB,
    relationshipType: conversation.relationshipType,
    relationshipContext: conversation.relationshipContext,
    chartEngineVersion,
  });
  const definition = getRelationshipDefinition(conversation.relationshipType);
  const ownerA = buildOwnerView('A', evaluation.roles.A, transitA);
  const ownerB = buildOwnerView('B', evaluation.roles.B, transitB);
  const dimensions = definition.dimensions.map(dimension => buildDimensionView({
    dimensionId: dimension.id,
    label: dimension.label,
    description: dimension.description,
    ownerAPalaces: dimension.ownerAPalaces,
    ownerBPalaces: dimension.ownerBPalaces,
    ownerA,
    ownerB,
  }));
  const baselineResults = evaluation.dimensions.flatMap(dimension => dimension.baselineResults);
  const stageResults = evaluation.dimensions.flatMap(dimension => dimension.stageResults);

  return upsertHemingTransitSnapshot({
    ...lookup,
    snapshot: {
      schemaVersion: 1,
      selectedYear,
      targetDate: String(selectedYear),
      representativeDate: transitA.representativeDate,
      boundaryPolicy: 'annual-midyear-representative-date',
      inputFingerprint,
      chartEngineVersion,
      transitEngineVersion: TRANSIT_ENGINE_VERSION,
      methodologyVersion: HEMING_METHODOLOGY_VERSION,
      relationshipType: conversation.relationshipType,
      roles: evaluation.roles,
      ownerA,
      ownerB,
      dimensions,
      baselineResults,
      stageResults,
      warnings: [...new Set([
        ...evaluation.warnings,
        '年度分析采用当年 7 月 1 日作为统一代表日期，用于避免春节前后年界歧义。',
      ])],
      disclaimer: DISCLAIMER,
    },
  });
}

function buildOwnerView(
  owner: ChartOwner,
  role: string,
  transit: AnnualTransitSnapshot,
): HemingAnnualOwnerView {
  return {
    owner,
    role,
    transit,
    activatedPalaces: transit.keyPalaces.map(item => ({
      palace: normalizePalaceName(item.nativePalaceName) ?? item.nativePalaceName,
      branch: item.branch,
      reasons: item.reasons,
    })),
  };
}

function buildDimensionView(input: {
  dimensionId: string;
  label: string;
  description: string;
  ownerAPalaces: string[];
  ownerBPalaces: string[];
  ownerA: HemingAnnualOwnerView;
  ownerB: HemingAnnualOwnerView;
}): HemingAnnualDimensionView {
  const ownerAActivations = filterActivations(input.ownerA.activatedPalaces, input.ownerAPalaces);
  const ownerBActivations = filterActivations(input.ownerB.activatedPalaces, input.ownerBPalaces);
  const activation = ownerAActivations.length && ownerBActivations.length
    ? 'both'
    : ownerAActivations.length
      ? 'A'
      : ownerBActivations.length
        ? 'B'
        : 'none';
  const observation = activation === 'both'
    ? `双方在该年度都激活了与“${input.label}”相关的本命宫位，表示这个主题可能同时进入双方关注范围。`
    : activation === 'A'
      ? `该年度主要由甲方激活“${input.label}”相关主题，乙方是否同步需要结合现实互动确认。`
      : activation === 'B'
        ? `该年度主要由乙方激活“${input.label}”相关主题，甲方是否同步需要结合现实互动确认。`
        : `当前确定性年度证据未直接激活“${input.label}”的专题宫位，不代表该主题不会发生变化。`;
  return {
    dimensionId: input.dimensionId,
    label: input.label,
    description: input.description,
    ownerAActivations,
    ownerBActivations,
    activation,
    observation,
  };
}

function filterActivations(
  activations: HemingAnnualPalaceActivation[],
  palaceNames: string[],
): HemingAnnualPalaceActivation[] {
  const allowed = new Set(palaceNames);
  return activations.filter(item => allowed.has(item.palace));
}

export function alignChartToTransit(chart: ZiweiChart, transit: AnnualTransitSnapshot): ZiweiChart {
  // 指定年度不能回退到快照保存时的阶段，童限和缺失阶段保持空值。
  const stageIndex = chart.daXians.findIndex(item => item.palaceBranch === transit.decadal.palaceBranch
    && transit.nominalAge >= item.startAge && transit.nominalAge <= item.endAge);
  return {
    ...chart,
    currentAge: transit.nominalAge,
    currentDaXianIndex: stageIndex,
    palaces: chart.palaces.map(palace => ({
      ...palace, isCurrentDaXian: palace.branch === chart.daXians[stageIndex]?.palaceBranch,
    })),
  };
}

function mergePersistedBirthInfo(
  chart: ZiweiChart,
  birthInfo: BirthInfo | null,
): ZiweiChart {
  return birthInfo ? { ...chart, birthInfo: { ...chart.birthInfo, ...birthInfo } } : chart;
}

function fingerprint(input: {
  relationshipType: RelationshipType;
  relationshipContext: HemingRelationshipContext | null;
  chartA: ZiweiChart;
  chartB: ZiweiChart;
}): string {
  return createHash('sha256').update(JSON.stringify({ alignmentVersion: 2, ...input })).digest('hex');
}
