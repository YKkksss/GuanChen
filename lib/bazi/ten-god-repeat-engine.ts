import type { BaziDynamicTenGodLayerSnapshot, BaziDynamicTenGodResult, BaziTenGodName } from './dynamic-ten-god-types';
import { resolveBaziTenGod } from './dynamic-ten-god-engine';
import {
  BAZI_TEN_GOD_REPEAT_ENGINE_VERSION,
  BAZI_TEN_GOD_REPEAT_METHODOLOGY,
  BAZI_TEN_GOD_REPEAT_METHODOLOGY_VERSION,
} from './ten-god-repeat-methodology';
import type {
  BaziStemRepeatCluster,
  BaziTenGodOccurrence,
  BaziTenGodRepeatConnection,
  BaziTenGodRepeatPattern,
  BaziTenGodRepeatResult,
  BaziTenGodRepeatSegment,
  BaziTenGodRoleRepeatCluster,
} from './ten-god-repeat-types';
import type { BaziRelationAuditResult, BaziRelationAuditSegment, BaziRelationLayer } from './relation-audit-types';
import type { BaziCalculationResult, BaziPillar } from './types';

const LAYER_ORDER: Record<BaziRelationLayer, number> = { natal: 0, luck_cycle: 1, annual: 2 };
const QI_LABELS = { main_qi: '本气', secondary_qi: '中气', residual_qi: '余气' } as const;

export function auditBaziTenGodRepeats(
  chart: BaziCalculationResult,
  dynamicTenGod: BaziDynamicTenGodResult,
  relationAudit: BaziRelationAuditResult,
): BaziTenGodRepeatResult {
  const natalOccurrences = buildNatalOccurrences(chart);
  const years = dynamicTenGod.years.map(year => {
    const relationYear = relationAudit.years.find(item => item.year === year.year);
    const segments = year.segments.map(segment => {
      const relationSegment = relationYear?.segments.find(item => item.segmentIndex === segment.segmentIndex);
      if (!relationSegment) throw new Error(`${year.year} 年片段 ${segment.segmentIndex} 缺少 M9-6 关系证据`);
      return buildSegment(chart.dayMaster.stem, natalOccurrences, segment, relationSegment);
    });
    return {
      year: year.year,
      annualGanZhi: year.annualGanZhi,
      segments,
      stemClusterCount: segments.reduce((total, item) => total + item.counts.stemClusters, 0),
      tenGodClusterCount: segments.reduce((total, item) => total + item.counts.tenGodClusters, 0),
      connectedClusterCount: segments.reduce((total, item) => total + item.counts.connectedClusters, 0),
      boundary: '同一流年跨越交运边界时，前后片段分别聚类；重复位置和证据连接不得跨片段合并。',
    };
  });
  return {
    methodologyVersion: BAZI_TEN_GOD_REPEAT_METHODOLOGY_VERSION,
    engineVersion: BAZI_TEN_GOD_REPEAT_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    status: dynamicTenGod.status,
    capabilities: {
      sameStemClusters: true,
      sameTenGodClusters: true,
      visibilitySeparation: true,
      evidenceConnections: true,
      transparencyVerdict: false,
      rootVerdict: false,
      strengthEffectVerdict: false,
      fortuneInterpretation: false,
      eventPrediction: false,
    },
    source: {
      chartMethodologyVersion: chart.methodologyVersion,
      chartEngineVersion: chart.engineVersion,
      chartCompleteness: chart.completeness,
      dynamicTenGodMethodologyVersion: dynamicTenGod.methodologyVersion,
      dynamicTenGodEngineVersion: dynamicTenGod.engineVersion,
      relationAuditMethodologyVersion: relationAudit.methodologyVersion,
      relationAuditEngineVersion: relationAudit.engineVersion,
    },
    dayMaster: { stem: chart.dayMaster.stem, tenGodReferenceLabel: '日主参照' },
    range: { ...dynamicTenGod.range },
    years,
    rulesApplied: [
      '原局、大运、流年的表层天干、藏干和日主参照保持独立位置记录',
      '同干簇允许纳入日主参照；同十神簇只纳入已经确定的十神角色',
      '重复簇至少包含两个位置，且必须至少包含一个大运或流年动态位置',
      '跨层表层同干、显隐同见、跨层藏干同见和流年大运同见分别标记',
      '证据连接只来自 M9-6 天干关系中的精确表层参与节点',
    ],
    warnings: [
      '重复计数是位置计数，不是力量、权重、旺衰或吉凶分数。',
      '表层与藏干出现相同天干只记为显隐同见，不等于透干、通根或藏干引动。',
      '藏干没有作为 M9-6 表层关系参与节点时，不会获得证据连接。',
      '同十神重复只说明传统关系标签相同，不等于人物或事件重复发生。',
      ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，所有时柱表层与藏干位置均未参与重复审计。'] : []),
    ],
    boundary: '本结果只审计同一天干和同一十神在哪些显隐位置重复，以及表层位置之间是否有上游关系证据连接；不裁决透干、通根、引动、强弱、吉凶或事件。',
  };
}

function buildSegment(
  dayMasterStem: string,
  natalOccurrences: BaziTenGodOccurrence[],
  dynamicSegment: BaziDynamicTenGodResult['years'][number]['segments'][number],
  relationSegment: BaziRelationAuditSegment,
): BaziTenGodRepeatSegment {
  const dynamicOccurrences = [
    ...buildDynamicOccurrences(dynamicSegment.annual),
    ...(dynamicSegment.luckCycle ? buildDynamicOccurrences(dynamicSegment.luckCycle) : []),
  ];
  const occurrences = [...natalOccurrences, ...dynamicOccurrences];
  const stemClusters = buildStemClusters(dayMasterStem, occurrences, relationSegment);
  const tenGodClusters = buildTenGodClusters(occurrences, relationSegment);
  return {
    segmentIndex: dynamicSegment.segmentIndex,
    startAt: dynamicSegment.startAt,
    endAtExclusive: dynamicSegment.endAtExclusive,
    luckCycleIndex: dynamicSegment.luckCycleIndex,
    luckCycleGanZhi: dynamicSegment.luckCycleGanZhi,
    label: dynamicSegment.label,
    stemClusters,
    tenGodClusters,
    counts: {
      stemClusters: stemClusters.length,
      tenGodClusters: tenGodClusters.length,
      connectedClusters: stemClusters.filter(item => item.connections.length > 0).length,
      surfaceHiddenClusters: stemClusters.filter(item => item.patterns.includes('surface_hidden_coexistence')).length,
    },
    boundary: '同干和同十神是两个审计视图，可能指向相同位置；计数不可相加为力量分数。',
  };
}

function buildNatalOccurrences(chart: BaziCalculationResult): BaziTenGodOccurrence[] {
  return [chart.pillars.year, chart.pillars.month, chart.pillars.day, chart.pillars.time]
    .filter((pillar): pillar is BaziPillar => pillar !== null)
    .flatMap(pillar => {
      const isDayMaster = pillar.key === 'day';
      const surface: BaziTenGodOccurrence = {
        id: `natal-${pillar.key}-surface-${pillar.stem}`,
        nodeId: `natal-${pillar.key}`,
        layer: 'natal',
        label: isDayMaster ? `原局${pillar.label}${pillar.stem}（日主参照）` : `原局${pillar.label}天干${pillar.stem}`,
        pillarKey: pillar.key,
        sourceKind: isDayMaster ? 'day_master_reference' : 'surface_stem',
        visibility: isDayMaster ? 'reference' : 'surface',
        stem: pillar.stem,
        tenGod: isDayMaster ? null : resolveBaziTenGod(chart.dayMaster.stem, pillar.stem),
        sourceBranch: null,
        hiddenQiGrade: null,
        hiddenQiLabel: null,
        boundary: isDayMaster
          ? '日柱天干只作为十神计算参照，不把命主自身计为比肩角色。'
          : '原局表层天干位置只用于显隐和跨层重复审计。',
      };
      const hidden = pillar.hiddenStems.map((item, index): BaziTenGodOccurrence => {
        const grade = index === 0 ? 'main_qi' as const : index === 1 ? 'secondary_qi' as const : 'residual_qi' as const;
        return {
          id: `natal-${pillar.key}-hidden-${item.stem}-${grade}`,
          nodeId: `natal-${pillar.key}`,
          layer: 'natal',
          label: `原局${pillar.label}${pillar.branch}藏${item.stem}（${QI_LABELS[grade]}）`,
          pillarKey: pillar.key,
          sourceKind: 'branch_hidden_stem',
          visibility: 'hidden',
          stem: item.stem,
          tenGod: resolveBaziTenGod(chart.dayMaster.stem, item.stem),
          sourceBranch: pillar.branch,
          hiddenQiGrade: grade,
          hiddenQiLabel: QI_LABELS[grade],
          boundary: '原局藏干位置只表示地支内含，不等于透干、通根或引动。',
        };
      });
      return [surface, ...hidden];
    });
}

function buildDynamicOccurrences(layer: BaziDynamicTenGodLayerSnapshot): BaziTenGodOccurrence[] {
  return layer.roles.map(role => ({
    id: `${role.id}-occurrence`,
    nodeId: role.nodeId,
    layer: role.layer,
    label: role.sourceKind === 'surface_stem'
      ? `${layer.label}天干${role.stem}`
      : `${layer.label}${role.sourceBranch}藏${role.stem}（${role.hiddenQiLabel}）`,
    pillarKey: null,
    sourceKind: role.sourceKind,
    visibility: role.sourceKind === 'surface_stem' ? 'surface' : 'hidden',
    stem: role.stem,
    tenGod: role.tenGod,
    sourceBranch: role.sourceBranch,
    hiddenQiGrade: role.hiddenQiGrade,
    hiddenQiLabel: role.hiddenQiLabel,
    boundary: role.sourceKind === 'surface_stem'
      ? '动态表层天干只用于跨层重复与证据连接审计。'
      : '动态藏干只表示地支内含，不等于透干、通根或引动。',
  }));
}

function buildStemClusters(
  dayMasterStem: string,
  occurrences: BaziTenGodOccurrence[],
  relationSegment: BaziRelationAuditSegment,
): BaziStemRepeatCluster[] {
  const groups = groupOccurrences(occurrences, item => item.stem);
  return [...groups.entries()].filter(([, items]) => qualifies(items)).map(([stem, items]) => {
    const sorted = sortOccurrences(items);
    const patterns = resolvePatterns(sorted);
    return {
      id: `stem-repeat-${relationSegment.segmentIndex}-${stem}`,
      stem,
      dynamicTenGod: resolveBaziTenGod(dayMasterStem, stem),
      occurrences: sorted,
      layers: resolveLayers(sorted),
      patterns,
      connections: buildConnections(sorted, relationSegment),
      counts: {
        surface: sorted.filter(item => item.visibility === 'surface').length,
        hidden: sorted.filter(item => item.visibility === 'hidden').length,
        reference: sorted.filter(item => item.visibility === 'reference').length,
        total: sorted.length,
      },
      boundary: '同干重复只说明字符与位置相同；显隐同见不等于透干或通根，重复次数不表示力量。',
    };
  }).sort((left, right) => left.stem.localeCompare(right.stem, 'zh-CN'));
}

function buildTenGodClusters(
  occurrences: BaziTenGodOccurrence[],
  relationSegment: BaziRelationAuditSegment,
): BaziTenGodRoleRepeatCluster[] {
  const roleOccurrences = occurrences.filter((item): item is BaziTenGodOccurrence & { tenGod: BaziTenGodName } => item.tenGod !== null);
  const groups = groupOccurrences(roleOccurrences, item => item.tenGod);
  return [...groups.entries()].filter(([, items]) => qualifies(items)).map(([tenGod, items]) => {
    const sorted = sortOccurrences(items);
    return {
      id: `ten-god-repeat-${relationSegment.segmentIndex}-${tenGod}`,
      tenGod,
      stems: [...new Set(sorted.map(item => item.stem))],
      occurrences: sorted,
      layers: resolveLayers(sorted),
      patterns: resolvePatterns(sorted),
      connections: buildConnections(sorted, relationSegment),
      counts: {
        surface: sorted.filter(item => item.visibility === 'surface').length,
        hidden: sorted.filter(item => item.visibility === 'hidden').length,
        total: sorted.length,
      },
      boundary: '同十神重复只说明相对日主的关系标签相同，不映射人物、领域、吉凶或事件。',
    };
  }).sort((left, right) => left.tenGod.localeCompare(right.tenGod, 'zh-CN'));
}

function buildConnections(
  occurrences: BaziTenGodOccurrence[],
  relationSegment: BaziRelationAuditSegment,
): BaziTenGodRepeatConnection[] {
  const connections: BaziTenGodRepeatConnection[] = [];
  for (const evidence of relationSegment.evidence.filter(item => item.domain === 'stem')) {
    const matched = occurrences.filter(occurrence =>
      occurrence.visibility !== 'hidden'
      && evidence.participants.some(participant =>
        participant.id === occurrence.nodeId
        && participant.layer === occurrence.layer
        && participant.symbol === occurrence.stem,
      ));
    if (matched.length < 2) continue;
    connections.push({
      id: `repeat-connection-${evidence.id}`,
      sourceEvidenceId: evidence.id,
      relationType: evidence.type,
      relationLabel: evidence.label,
      relationScope: evidence.scope,
      occurrenceIds: matched.map(item => item.id),
      participantLabels: matched.map(item => item.label),
      boundary: '证据连接只确认这些表层位置共同参与 M9-6 天干关系，不表示力量、作用结果或优先级。',
    });
  }
  return connections;
}

function qualifies(occurrences: BaziTenGodOccurrence[]): boolean {
  return occurrences.length >= 2 && occurrences.some(item => item.layer === 'annual' || item.layer === 'luck_cycle');
}

function resolvePatterns(occurrences: BaziTenGodOccurrence[]): BaziTenGodRepeatPattern[] {
  const patterns: BaziTenGodRepeatPattern[] = [];
  const surfaceLike = occurrences.filter(item => item.visibility !== 'hidden');
  const hidden = occurrences.filter(item => item.visibility === 'hidden');
  if (new Set(surfaceLike.map(item => item.layer)).size >= 2) patterns.push('surface_cross_layer_repeat');
  if (surfaceLike.length > 0 && hidden.length > 0) patterns.push('surface_hidden_coexistence');
  if (new Set(hidden.map(item => item.layer)).size >= 2) patterns.push('hidden_cross_layer_repeat');
  if (occurrences.some(item => item.layer === 'annual') && occurrences.some(item => item.layer === 'luck_cycle')) patterns.push('annual_luck_repeat');
  return patterns;
}

function resolveLayers(occurrences: BaziTenGodOccurrence[]): BaziRelationLayer[] {
  return [...new Set(occurrences.map(item => item.layer))].sort((left, right) => LAYER_ORDER[left] - LAYER_ORDER[right]);
}

function sortOccurrences<T extends BaziTenGodOccurrence>(occurrences: T[]): T[] {
  return [...occurrences].sort((left, right) => {
    const layerDifference = LAYER_ORDER[left.layer] - LAYER_ORDER[right.layer];
    if (layerDifference) return layerDifference;
    const visibilityOrder = { reference: 0, surface: 1, hidden: 2 } as const;
    const visibilityDifference = visibilityOrder[left.visibility] - visibilityOrder[right.visibility];
    return visibilityDifference || left.label.localeCompare(right.label, 'zh-CN');
  });
}

function groupOccurrences<T extends BaziTenGodOccurrence, K extends string>(
  occurrences: T[],
  key: (item: T) => K,
): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const occurrence of occurrences) {
    const value = key(occurrence);
    groups.set(value, [...(groups.get(value) ?? []), occurrence]);
  }
  return groups;
}
