import {
  BAZI_DYNAMIC_TEN_GOD_ENGINE_VERSION,
  BAZI_DYNAMIC_TEN_GOD_METHODOLOGY,
  BAZI_DYNAMIC_TEN_GOD_METHODOLOGY_VERSION,
} from './dynamic-ten-god-methodology';
import type {
  BaziDynamicDirectionLink,
  BaziDynamicTenGodLayerSnapshot,
  BaziDynamicTenGodResult,
  BaziDynamicTenGodRole,
  BaziDynamicTenGodSegment,
  BaziHiddenQiGrade,
  BaziTenGodName,
} from './dynamic-ten-god-types';
import type { BaziStemPolarity } from './luck-cycle-types';
import type { BaziRelationAuditResult, BaziRelationAuditSegment } from './relation-audit-types';
import type {
  BaziRelationAdjudicationResult,
  BaziRelationAdjudicationSegment,
} from './relation-adjudication-types';
import type { BaziCalculationResult, BaziElement } from './types';

const STEM_META: Record<string, { element: BaziElement; polarity: BaziStemPolarity }> = {
  甲: { element: '木', polarity: 'yang' }, 乙: { element: '木', polarity: 'yin' },
  丙: { element: '火', polarity: 'yang' }, 丁: { element: '火', polarity: 'yin' },
  戊: { element: '土', polarity: 'yang' }, 己: { element: '土', polarity: 'yin' },
  庚: { element: '金', polarity: 'yang' }, 辛: { element: '金', polarity: 'yin' },
  壬: { element: '水', polarity: 'yang' }, 癸: { element: '水', polarity: 'yin' },
};
const GENERATES: Record<BaziElement, BaziElement> = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
const CONTROLS: Record<BaziElement, BaziElement> = { 木: '土', 火: '金', 土: '水', 金: '木', 水: '火' };
const QI_GRADES: BaziHiddenQiGrade[] = ['main_qi', 'secondary_qi', 'residual_qi'];
const QI_LABELS: Record<BaziHiddenQiGrade, string> = { main_qi: '本气', secondary_qi: '中气', residual_qi: '余气' };

export function auditBaziDynamicTenGods(
  chart: BaziCalculationResult,
  relationAudit: BaziRelationAuditResult,
  relationAdjudication: BaziRelationAdjudicationResult,
): BaziDynamicTenGodResult {
  const dayMasterMeta = getStemMeta(chart.dayMaster.stem);
  const years = relationAudit.years.map(year => {
    const adjudicationYear = relationAdjudication.years.find(item => item.year === year.year);
    const segments = year.segments.map(segment => buildSegment(
      chart.dayMaster.stem,
      year.year,
      year.annualGanZhi,
      segment,
      adjudicationYear?.segments.find(item => item.segmentIndex === segment.segmentIndex) ?? null,
    ));
    return {
      year: year.year,
      annualGanZhi: year.annualGanZhi,
      segments,
      roleCount: segments.reduce((total, segment) => total + segment.counts.roles, 0),
      natalDirectionLinkCount: segments.reduce((total, segment) => total + segment.counts.natalDirectionLinks, 0),
      boundary: '十神角色以日主为唯一参照；同一流年跨运时必须按片段读取，方向链接不可跨片段复用。',
    };
  });
  return {
    methodologyVersion: BAZI_DYNAMIC_TEN_GOD_METHODOLOGY_VERSION,
    engineVersion: BAZI_DYNAMIC_TEN_GOD_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    status: relationAudit.status,
    capabilities: {
      dynamicTenGodRoles: true,
      hiddenStemRoles: true,
      evidenceBoundDirection: true,
      hiddenStemActivationVerdict: false,
      strengthEffectVerdict: false,
      fortuneInterpretation: false,
      eventPrediction: false,
    },
    source: {
      chartMethodologyVersion: chart.methodologyVersion,
      chartEngineVersion: chart.engineVersion,
      chartCompleteness: chart.completeness,
      annualTimelineStatus: relationAudit.source.annualTimelineStatus,
      relationAuditMethodologyVersion: relationAudit.methodologyVersion,
      relationAuditEngineVersion: relationAudit.engineVersion,
      relationAdjudicationMethodologyVersion: relationAdjudication.methodologyVersion,
      relationAdjudicationEngineVersion: relationAdjudication.engineVersion,
    },
    dayMaster: {
      stem: chart.dayMaster.stem,
      element: dayMasterMeta.element,
      polarity: dayMasterMeta.polarity,
    },
    range: { ...relationAudit.range },
    years,
    rulesApplied: [
      '所有十神均以原局日主天干为参照，不以年份、柱位或吉凶语义改名',
      '表层天干与地支藏干分别记录；藏干按本气、中气、余气顺序展示',
      '作用方向只提取 M9-6 同片段证据中的动态节点与原局柱位，不自行补算目标',
      '方向链接附带 M9-7 既有条件状态，不重新裁决合化或关系优先级',
      '跨运流年按真实时间片段分别生成',
    ],
    warnings: [
      '十神是天干相对日主的关系标签，不等于现实人物、事件或吉凶结论。',
      '藏干只表示地支所含天干及其顺序；当前不判断透出、引动、发动或实际作用。',
      '原局指向只表示上游干支关系证据同时包含该动态节点与该柱位，不表示力量、结果或优先级。',
      ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，所有时柱角色目标与关系方向均未参与审计。'] : []),
    ],
    boundary: '本结果只回答动态干支以什么十神角色出现，以及已有关系证据指向哪个原局柱位；不回答强弱变化、喜忌、吉凶或具体事件。',
  };
}

export function resolveBaziTenGod(dayMasterStem: string, otherStem: string): BaziTenGodName {
  const dayMaster = getStemMeta(dayMasterStem);
  const other = getStemMeta(otherStem);
  const samePolarity = dayMaster.polarity === other.polarity;
  if (dayMaster.element === other.element) return samePolarity ? '比肩' : '劫财';
  if (GENERATES[dayMaster.element] === other.element) return samePolarity ? '食神' : '伤官';
  if (CONTROLS[dayMaster.element] === other.element) return samePolarity ? '偏财' : '正财';
  if (GENERATES[other.element] === dayMaster.element) return samePolarity ? '偏印' : '正印';
  if (CONTROLS[other.element] === dayMaster.element) return samePolarity ? '七杀' : '正官';
  throw new Error(`无法判定十神：${dayMasterStem}/${otherStem}`);
}

function buildSegment(
  dayMasterStem: string,
  year: number,
  annualGanZhi: string,
  relationSegment: BaziRelationAuditSegment,
  adjudicationSegment: BaziRelationAdjudicationSegment | null,
): BaziDynamicTenGodSegment {
  const annual = buildLayerSnapshot({
    dayMasterStem,
    nodeId: `annual-${year}`,
    layer: 'annual',
    label: `${year}流年`,
    ganZhi: annualGanZhi,
    relationSegment,
    adjudicationSegment,
  });
  const luckCycle = relationSegment.luckCycleIndex && relationSegment.luckCycleGanZhi
    ? buildLayerSnapshot({
      dayMasterStem,
      nodeId: `luck-${relationSegment.luckCycleIndex}`,
      layer: 'luck_cycle',
      label: `第${relationSegment.luckCycleIndex}步大运`,
      ganZhi: relationSegment.luckCycleGanZhi,
      relationSegment,
      adjudicationSegment,
    })
    : null;
  const layers = [annual, ...(luckCycle ? [luckCycle] : [])];
  return {
    segmentIndex: relationSegment.segmentIndex,
    startAt: relationSegment.startAt,
    endAtExclusive: relationSegment.endAtExclusive,
    luckCycleIndex: relationSegment.luckCycleIndex,
    luckCycleGanZhi: relationSegment.luckCycleGanZhi,
    label: relationSegment.label,
    annual,
    luckCycle,
    counts: {
      roles: layers.reduce((total, item) => total + item.counts.roles, 0),
      hiddenStemRoles: layers.reduce((total, item) => total + item.counts.hiddenStemRoles, 0),
      natalDirectionLinks: layers.reduce((total, item) => total + item.counts.natalDirectionLinks, 0),
    },
  };
}

function buildLayerSnapshot(input: {
  dayMasterStem: string;
  nodeId: string;
  layer: 'annual' | 'luck_cycle';
  label: string;
  ganZhi: string;
  relationSegment: BaziRelationAuditSegment;
  adjudicationSegment: BaziRelationAdjudicationSegment | null;
}): BaziDynamicTenGodLayerSnapshot {
  const stem = input.ganZhi[0];
  const branch = input.ganZhi[1];
  getStemMeta(stem);
  const hiddenStems = BAZI_DYNAMIC_TEN_GOD_METHODOLOGY.hiddenStemOrder[branch];
  if (!hiddenStems) throw new Error(`无法识别动态地支藏干：${input.ganZhi}`);
  const roles = [
    createRole(input.dayMasterStem, input.nodeId, input.layer, 'surface_stem', stem, null, null),
    ...hiddenStems.map((hiddenStem, index) => createRole(
      input.dayMasterStem,
      input.nodeId,
      input.layer,
      'branch_hidden_stem',
      hiddenStem,
      branch,
      QI_GRADES[index],
    )),
  ];
  const directions = buildDirectionLinks(
    input.nodeId,
    input.layer,
    input.relationSegment,
    input.adjudicationSegment,
  );
  return {
    nodeId: input.nodeId,
    layer: input.layer,
    label: input.label,
    ganZhi: input.ganZhi,
    stem,
    branch,
    roles,
    directions,
    counts: {
      roles: roles.length,
      hiddenStemRoles: roles.filter(item => item.sourceKind === 'branch_hidden_stem').length,
      natalDirectionLinks: directions.length,
    },
    boundary: '表层天干十神与地支藏干十神分开记录；地支关系方向属于动态地支整体，不转嫁给某个藏干。',
  };
}

function createRole(
  dayMasterStem: string,
  nodeId: string,
  layer: 'annual' | 'luck_cycle',
  sourceKind: BaziDynamicTenGodRole['sourceKind'],
  stem: string,
  sourceBranch: string | null,
  hiddenQiGrade: BaziHiddenQiGrade | null,
): BaziDynamicTenGodRole {
  const meta = getStemMeta(stem);
  return {
    id: `${nodeId}-${sourceKind}-${stem}-${hiddenQiGrade ?? 'surface'}`,
    nodeId,
    layer,
    sourceKind,
    sourceBranch,
    stem,
    element: meta.element,
    polarity: meta.polarity,
    tenGod: resolveBaziTenGod(dayMasterStem, stem),
    hiddenQiGrade,
    hiddenQiLabel: hiddenQiGrade ? QI_LABELS[hiddenQiGrade] : null,
    boundary: sourceKind === 'surface_stem'
      ? '表层天干角色只说明相对日主的十神名称，不直接映射现实事件。'
      : '藏干角色只说明地支所含天干，不代表该藏干已经透出、引动或发生作用。',
  };
}

function buildDirectionLinks(
  nodeId: string,
  sourceLayer: 'annual' | 'luck_cycle',
  relationSegment: BaziRelationAuditSegment,
  adjudicationSegment: BaziRelationAdjudicationSegment | null,
): BaziDynamicDirectionLink[] {
  const links = new Map<string, BaziDynamicDirectionLink>();
  for (const evidence of relationSegment.evidence) {
    const source = evidence.participants.find(item => item.id === nodeId && item.layer === sourceLayer);
    if (!source) continue;
    const decision = adjudicationSegment?.decisions.find(item => item.sourceEvidenceId === evidence.id) ?? null;
    for (const target of evidence.participants.filter(item => item.layer === 'natal' && item.pillarKey !== null)) {
      const id = `${nodeId}-${evidence.domain}-${evidence.id}-${target.id}`;
      links.set(id, {
        id,
        sourceNodeId: nodeId,
        sourceLayer,
        sourceDomain: evidence.domain,
        sourceSymbol: source.symbol,
        targetPillarKey: target.pillarKey!,
        targetPillarLabel: target.label,
        targetSymbol: target.symbol,
        relationType: evidence.type,
        relationLabel: evidence.label,
        relationScope: evidence.scope,
        sourceEvidenceId: evidence.id,
        conditionDecisionId: decision?.id ?? null,
        conditionState: decision?.state ?? null,
        conditionStateLabel: decision?.stateLabel ?? null,
        boundary: '该指向仅表示同一条 M9-6 关系证据包含动态节点与原局柱位，不表示力量、结果或优先级。',
      });
    }
  }
  return [...links.values()].sort((left, right) =>
    `${left.sourceDomain}-${left.targetPillarKey}-${left.relationType}`.localeCompare(
      `${right.sourceDomain}-${right.targetPillarKey}-${right.relationType}`,
      'zh-CN',
    ));
}

function getStemMeta(stem: string): { element: BaziElement; polarity: BaziStemPolarity } {
  const meta = STEM_META[stem];
  if (!meta) throw new Error(`无法识别天干：${stem}`);
  return meta;
}
