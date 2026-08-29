import type { BaziDynamicTenGodResult, BaziTenGodName } from './dynamic-ten-god-types';
import {
  buildBaziDynamicTenGodOccurrences,
  buildBaziNatalTenGodOccurrences,
} from './ten-god-repeat-engine';
import {
  BAZI_TRANSPARENCY_ROOT_ENGINE_VERSION,
  BAZI_TRANSPARENCY_ROOT_METHODOLOGY_VERSION,
} from './transparency-root-methodology';
import type {
  BaziRootCandidate,
  BaziTransparencyCandidate,
  BaziTransparencyRootConditionCheck,
  BaziTransparencyRootResult,
  BaziTransparencyRootSegment,
} from './transparency-root-types';
import type { BaziTenGodOccurrence, BaziTenGodRepeatResult, BaziTenGodRepeatSegment } from './ten-god-repeat-types';
import type { BaziCalculationResult, BaziElement } from './types';

const STEM_ELEMENTS: Record<string, BaziElement> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};
const LAYER_ORDER = { natal: 0, luck_cycle: 1, annual: 2 } as const;

export function auditBaziTransparencyRoots(
  chart: BaziCalculationResult,
  dynamicTenGod: BaziDynamicTenGodResult,
  tenGodRepeat: BaziTenGodRepeatResult,
): BaziTransparencyRootResult {
  const natalOccurrences = buildBaziNatalTenGodOccurrences(chart);
  const years = dynamicTenGod.years.map(dynamicYear => {
    const repeatYear = tenGodRepeat.years.find(item => item.year === dynamicYear.year);
    if (!repeatYear) throw new Error(`${dynamicYear.year} 年缺少 M9-9 显隐重复版本`);
    const segments = dynamicYear.segments.map(dynamicSegment => {
      const repeatSegment = repeatYear.segments.find(item => item.segmentIndex === dynamicSegment.segmentIndex);
      if (!repeatSegment) throw new Error(`${dynamicYear.year} 年片段 ${dynamicSegment.segmentIndex} 缺少 M9-9 显隐重复片段`);
      const occurrences = [
        ...natalOccurrences,
        ...buildBaziDynamicTenGodOccurrences(dynamicSegment.annual),
        ...(dynamicSegment.luckCycle ? buildBaziDynamicTenGodOccurrences(dynamicSegment.luckCycle) : []),
      ];
      return buildSegment(dynamicSegment, occurrences, repeatSegment);
    });
    return {
      year: dynamicYear.year,
      annualGanZhi: dynamicYear.annualGanZhi,
      segments,
      counts: sumCounts(segments),
      boundary: '同一流年跨越交运边界时，透出与根气条件分别按实际片段审计，后段大运不得倒灌到前段。',
    };
  });
  return {
    methodologyVersion: BAZI_TRANSPARENCY_ROOT_METHODOLOGY_VERSION,
    engineVersion: BAZI_TRANSPARENCY_ROOT_ENGINE_VERSION,
    calculatedAt: new Date().toISOString(),
    status: dynamicTenGod.status,
    capabilities: {
      transparencyConditionAudit: true,
      strictSameStemRootAudit: true,
      sameElementSupportSeparation: true,
      selfSeatLocationAudit: true,
      transparencyEffectVerdict: false,
      rootStrengthVerdict: false,
      hiddenStemActivationVerdict: false,
      fortuneInterpretation: false,
      eventPrediction: false,
    },
    source: {
      chartMethodologyVersion: chart.methodologyVersion,
      chartEngineVersion: chart.engineVersion,
      chartCompleteness: chart.completeness,
      dynamicTenGodMethodologyVersion: dynamicTenGod.methodologyVersion,
      dynamicTenGodEngineVersion: dynamicTenGod.engineVersion,
      tenGodRepeatMethodologyVersion: tenGodRepeat.methodologyVersion,
      tenGodRepeatEngineVersion: tenGodRepeat.engineVersion,
    },
    dayMaster: { stem: chart.dayMaster.stem, element: chart.dayMaster.element },
    range: { ...dynamicTenGod.range },
    years,
    rulesApplied: [
      '透出条件只检查同一实际片段内藏干与表层天干是否完全同干',
      '原局月支藏干单列为月令透出匹配，其他藏干保留为广义同干透出匹配',
      '通根严格候选要求表层天干与实际藏干完全同干，仅同五行不同干另列为支持参照',
      '坐支同干位置要求表层与藏干属于同一节点且完全同干',
      '每个候选必须至少包含一个大运或流年动态位置，并回指 M9-9 同干簇',
    ],
    warnings: [
      '“条件匹配”是结构证据，不等于透干有效、得力、成格或发生作用。',
      '完全同干根与同五行支持均不折算强弱；本气、中气、余气只保留位置标签。',
      '坐支同干只描述同柱位置，不自动称为强根、真根或坐根有力。',
      '藏干在岁运中同见不等于已经引动、发动或对应现实事件。',
      ...(chart.completeness === 'partial_unknown_time' ? ['时柱未知，时柱表层和藏干均未进入条件审计。'] : []),
    ],
    boundary: '本结果只审计岁运相关的完全同干透出条件、严格同干根、同五行支持和坐支位置；不裁决有效性、强弱、真假根、格局、喜忌、吉凶或事件。',
  };
}

function buildSegment(
  dynamicSegment: BaziDynamicTenGodResult['years'][number]['segments'][number],
  occurrences: BaziTenGodOccurrence[],
  repeatSegment: BaziTenGodRepeatSegment,
): BaziTransparencyRootSegment {
  const transparencyCandidates = buildTransparencyCandidates(occurrences, repeatSegment);
  const rootCandidates = buildRootCandidates(occurrences, repeatSegment);
  return {
    segmentIndex: dynamicSegment.segmentIndex,
    startAt: dynamicSegment.startAt,
    endAtExclusive: dynamicSegment.endAtExclusive,
    luckCycleIndex: dynamicSegment.luckCycleIndex,
    luckCycleGanZhi: dynamicSegment.luckCycleGanZhi,
    label: dynamicSegment.label,
    transparencyCandidates,
    rootCandidates,
    counts: countCandidates(transparencyCandidates, rootCandidates),
    boundary: '本片段只比较实际共存的位置；同干匹配与同五行支持分开记录，不跨片段累计或折算力量。',
  };
}

function buildTransparencyCandidates(
  occurrences: BaziTenGodOccurrence[],
  repeatSegment: BaziTenGodRepeatSegment,
): BaziTransparencyCandidate[] {
  const surfaces = occurrences.filter(item => item.visibility !== 'hidden');
  const hidden = occurrences.filter(item => item.visibility === 'hidden');
  return hidden.flatMap(hiddenOccurrence => {
    const surfaceMatches = sortOccurrences(surfaces.filter(item =>
      item.stem === hiddenOccurrence.stem
      && (hiddenOccurrence.layer !== 'natal' || item.layer !== 'natal'),
    ));
    const hasDynamicOccurrence = hiddenOccurrence.layer !== 'natal'
      || surfaceMatches.some(item => item.layer !== 'natal');
    if (!hasDynamicOccurrence) return [];
    const repeatCluster = surfaceMatches.length
      ? repeatSegment.stemClusters.find(item => item.stem === hiddenOccurrence.stem) ?? null
      : null;
    if (surfaceMatches.length && !repeatCluster) {
      throw new Error(`${hiddenOccurrence.label}存在动态同干表层匹配，但缺少 M9-9 同干簇`);
    }
    const scope = hiddenOccurrence.layer === 'natal' && hiddenOccurrence.pillarKey === 'month'
      ? 'month_command_hidden_stem' as const
      : 'general_hidden_stem' as const;
    const conditionChecks: BaziTransparencyRootConditionCheck[] = [
      makeCheck('hidden_occurrence_present', '片段内存在实际藏干', 'met', [hiddenOccurrence.id], hiddenOccurrence.label),
      makeCheck(
        'exact_surface_same_segment',
        '同片段存在完全同干表层',
        surfaceMatches.length ? 'met' : 'missing',
        surfaceMatches.map(item => item.id),
        surfaceMatches.length ? surfaceMatches.map(item => item.label).join('；') : `未找到表层${hiddenOccurrence.stem}`,
      ),
      makeCheck(
        'upstream_repeat_cluster',
        'M9-9 同干簇可追溯',
        surfaceMatches.length ? 'met' : 'not_applicable',
        repeatCluster ? [repeatCluster.id] : [],
        repeatCluster ? `回指 ${repeatCluster.id}` : '没有完全同干表层时不适用',
      ),
    ];
    return [{
      id: `transparency-${repeatSegment.segmentIndex}-${hiddenOccurrence.id}`,
      stem: hiddenOccurrence.stem,
      element: requireStemElement(hiddenOccurrence.stem),
      tenGod: hiddenOccurrence.tenGod as BaziTenGodName,
      scope,
      hiddenOccurrence,
      surfaceMatches,
      status: surfaceMatches.length ? 'exact_surface_matched' as const : 'exact_surface_missing' as const,
      repeatClusterId: repeatCluster?.id ?? null,
      conditionChecks,
      boundary: scope === 'month_command_hidden_stem'
        ? '月令藏干出现完全同干表层时，只记“月令透出条件匹配”；不判断清浊、有情、格局成败或力量。'
        : '非月令藏干只记广义同干透出位置条件；不替代月令取格规则，也不判断藏干引动。',
    }];
  }).sort((left, right) => compareOccurrence(left.hiddenOccurrence, right.hiddenOccurrence));
}

function buildRootCandidates(
  occurrences: BaziTenGodOccurrence[],
  repeatSegment: BaziTenGodRepeatSegment,
): BaziRootCandidate[] {
  const surfaces = occurrences.filter(item => item.visibility !== 'hidden');
  const hidden = occurrences.filter(item => item.visibility === 'hidden');
  return surfaces.flatMap(surfaceOccurrence => {
    const element = requireStemElement(surfaceOccurrence.stem);
    const exactRootMatches = sortOccurrences(hidden.filter(item =>
      item.stem === surfaceOccurrence.stem
      && (surfaceOccurrence.layer !== 'natal' || item.layer !== 'natal'),
    ));
    const sameElementSupportMatches = sortOccurrences(hidden.filter(item =>
      item.stem !== surfaceOccurrence.stem
      && requireStemElement(item.stem) === element
      && (surfaceOccurrence.layer !== 'natal' || item.layer !== 'natal'),
    ));
    const hasDynamicOccurrence = surfaceOccurrence.layer !== 'natal'
      || exactRootMatches.some(item => item.layer !== 'natal')
      || sameElementSupportMatches.some(item => item.layer !== 'natal');
    if (!hasDynamicOccurrence) return [];
    const repeatCluster = exactRootMatches.length
      ? repeatSegment.stemClusters.find(item => item.stem === surfaceOccurrence.stem) ?? null
      : null;
    if (exactRootMatches.length && !repeatCluster) {
      throw new Error(`${surfaceOccurrence.label}存在动态同干藏干匹配，但缺少 M9-9 同干簇`);
    }
    const selfSeatExactRoot = exactRootMatches.some(item => item.nodeId === surfaceOccurrence.nodeId);
    const status = exactRootMatches.length
      ? 'exact_same_stem_root' as const
      : sameElementSupportMatches.length
        ? 'same_element_support_only' as const
        : 'hidden_support_missing' as const;
    const conditionChecks: BaziTransparencyRootConditionCheck[] = [
      makeCheck('surface_occurrence_present', '片段内存在表层天干', 'met', [surfaceOccurrence.id], surfaceOccurrence.label),
      makeCheck(
        'exact_hidden_same_segment',
        '同片段存在完全同干藏干',
        exactRootMatches.length ? 'met' : 'missing',
        exactRootMatches.map(item => item.id),
        exactRootMatches.length ? exactRootMatches.map(item => item.label).join('；') : `未找到藏干${surfaceOccurrence.stem}`,
      ),
      makeCheck(
        'same_element_hidden_same_segment',
        '同片段存在同五行藏干',
        exactRootMatches.length || sameElementSupportMatches.length ? 'met' : 'missing',
        [...exactRootMatches, ...sameElementSupportMatches].map(item => item.id),
        sameElementSupportMatches.length ? sameElementSupportMatches.map(item => item.label).join('；') : exactRootMatches.length ? '完全同干藏干同时满足同五行' : `未找到${element}藏干`,
      ),
      makeCheck(
        'same_node_exact_hidden',
        '同节点坐支完全同干',
        selfSeatExactRoot ? 'met' : 'missing',
        exactRootMatches.filter(item => item.nodeId === surfaceOccurrence.nodeId).map(item => item.id),
        selfSeatExactRoot ? '表层与完全同干藏干位于同一柱／动态节点' : '没有同节点完全同干藏干',
      ),
      makeCheck(
        'upstream_repeat_cluster',
        'M9-9 同干簇可追溯',
        exactRootMatches.length ? 'met' : 'not_applicable',
        repeatCluster ? [repeatCluster.id] : [],
        repeatCluster ? `回指 ${repeatCluster.id}` : '没有完全同干藏干时不适用',
      ),
    ];
    return [{
      id: `root-${repeatSegment.segmentIndex}-${surfaceOccurrence.id}`,
      stem: surfaceOccurrence.stem,
      element,
      tenGod: surfaceOccurrence.tenGod,
      surfaceOccurrence,
      exactRootMatches,
      sameElementSupportMatches,
      status,
      selfSeatExactRoot,
      repeatClusterId: repeatCluster?.id ?? null,
      conditionChecks,
      boundary: status === 'exact_same_stem_root'
        ? '完全同干藏干只记为严格同干根候选；不评价远近、强弱、真假或是否得用。'
        : status === 'same_element_support_only'
          ? '同五行但不同干只记为根气支持参照，不冒充严格同干根。'
          : '未找到同片段实际藏干支持；不据此单独裁决天干无力或吉凶。',
    }];
  }).sort((left, right) => compareOccurrence(left.surfaceOccurrence, right.surfaceOccurrence));
}

function countCandidates(
  transparencyCandidates: BaziTransparencyCandidate[],
  rootCandidates: BaziRootCandidate[],
): BaziTransparencyRootSegment['counts'] {
  return {
    transparencyMatched: transparencyCandidates.filter(item => item.status === 'exact_surface_matched').length,
    transparencyMissing: transparencyCandidates.filter(item => item.status === 'exact_surface_missing').length,
    monthCommandMatched: transparencyCandidates.filter(item => item.scope === 'month_command_hidden_stem' && item.status === 'exact_surface_matched').length,
    exactSameStemRoots: rootCandidates.filter(item => item.status === 'exact_same_stem_root').length,
    sameElementSupportOnly: rootCandidates.filter(item => item.status === 'same_element_support_only').length,
    hiddenSupportMissing: rootCandidates.filter(item => item.status === 'hidden_support_missing').length,
    selfSeatExactRoots: rootCandidates.filter(item => item.selfSeatExactRoot).length,
  };
}

function sumCounts(segments: BaziTransparencyRootSegment[]): BaziTransparencyRootSegment['counts'] {
  return segments.reduce((total, segment) => ({
    transparencyMatched: total.transparencyMatched + segment.counts.transparencyMatched,
    transparencyMissing: total.transparencyMissing + segment.counts.transparencyMissing,
    monthCommandMatched: total.monthCommandMatched + segment.counts.monthCommandMatched,
    exactSameStemRoots: total.exactSameStemRoots + segment.counts.exactSameStemRoots,
    sameElementSupportOnly: total.sameElementSupportOnly + segment.counts.sameElementSupportOnly,
    hiddenSupportMissing: total.hiddenSupportMissing + segment.counts.hiddenSupportMissing,
    selfSeatExactRoots: total.selfSeatExactRoots + segment.counts.selfSeatExactRoots,
  }), {
    transparencyMatched: 0,
    transparencyMissing: 0,
    monthCommandMatched: 0,
    exactSameStemRoots: 0,
    sameElementSupportOnly: 0,
    hiddenSupportMissing: 0,
    selfSeatExactRoots: 0,
  });
}

function makeCheck(
  code: BaziTransparencyRootConditionCheck['code'],
  label: string,
  state: BaziTransparencyRootConditionCheck['state'],
  evidenceOccurrenceIds: string[],
  detail: string,
): BaziTransparencyRootConditionCheck {
  return { code, label, state, evidenceOccurrenceIds, detail };
}

function requireStemElement(stem: string): BaziElement {
  const element = STEM_ELEMENTS[stem];
  if (!element) throw new Error(`未知天干五行：${stem}`);
  return element;
}

function sortOccurrences<T extends BaziTenGodOccurrence>(occurrences: T[]): T[] {
  return [...occurrences].sort(compareOccurrence);
}

function compareOccurrence(left: BaziTenGodOccurrence, right: BaziTenGodOccurrence): number {
  const layerDifference = LAYER_ORDER[left.layer] - LAYER_ORDER[right.layer];
  if (layerDifference) return layerDifference;
  const visibilityOrder = { reference: 0, surface: 1, hidden: 2 } as const;
  const visibilityDifference = visibilityOrder[left.visibility] - visibilityOrder[right.visibility];
  return visibilityDifference || left.label.localeCompare(right.label, 'zh-CN');
}
