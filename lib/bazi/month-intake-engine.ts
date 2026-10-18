import type { BaziPatternConditionResult } from './pattern-condition-types';
import type { BaziReadingEvidence } from './reading-types';
import type { BaziCalculationResult, BaziElement, BaziPillar } from './types';
import {
  ENTRY_LABELS,
  MONTH_INTAKE_CLASHES,
  MONTH_INTAKE_CONTROLS,
  MONTH_INTAKE_GROUPS,
  MONTH_INTAKE_MAIN_QI,
  MONTH_INTAKE_SIX_COMBINES,
  MONTH_INTAKE_SOURCES,
  MONTH_INTAKE_STEM_COMBINES,
  SOURCE_QI_LABELS,
  TRANSPARENCY_LABELS,
} from './month-intake-rules';
import {
  BAZI_MONTH_INTAKE_POLICY,
  BAZI_MONTH_INTAKE_VERSION,
  type BaziMonthIntakeMeeting,
  type BaziMonthIntakeObstruction,
  type BaziMonthIntakeReview,
  type BaziMonthIntakeRoute,
  type BaziMonthIntakeSixCombine,
  type BaziMonthIntakeSourceQi,
} from './month-intake-types';

const BOUNDARIES = [
  '只按已保存四柱的实际表干与月支藏干建立入口位置；不重排四柱、不补藏干、不改动原月令格局候选。',
  '本气、透干与会支是并列入口，不是取用裁决；入口条数、透出次数和会支组数都不用于排名或选唯一用神。',
  '透干只匹配年、月、时天干；日干同干单列参照，不计为新增透出位置。',
  '含月支的三合、三会必须三支齐见才列为会支入口；缺字组、六合、六冲、天干五合和五行相克只作条件单列。',
  '会支只记录组合所指向的五行，不指定阴阳天干；指向五行不等于已经合化、成局或可以替代月令本气。',
  '出生时辰未知时，未见位置不能判为全盘缺失；十神不输出全日唯一值，入口候选整体降级。',
  '不裁定合化、去留、解冲、破局、最终旺衰、格局成败或唯一喜忌，也不扩展为力量评分、应期或现实事件。',
];

const STEM_ELEMENTS: Record<string, BaziElement> = {
  甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水',
};

function stemElement(stem: string): BaziElement {
  const element = STEM_ELEMENTS[stem];
  if (!element) throw new Error(`无法识别天干五行：${stem}`);
  return element;
}

function sourceQiFor(stem: string, index: number, mainQiStem: string): BaziMonthIntakeSourceQi {
  if (stem === mainQiStem) return 'main_qi';
  return index === 1 ? 'secondary_qi' : 'residual_qi';
}

function transparencyFor(count: number): BaziMonthIntakeRoute['transparency'] {
  return count === 0 ? 'not_transparent' : count === 1 ? 'single_transparent' : 'multiple_transparent';
}

function routeEntry(sourceQi: BaziMonthIntakeSourceQi, transparent: boolean): BaziMonthIntakeRoute['entry'] {
  if (sourceQi === 'main_qi') return 'main_qi_entry';
  return transparent ? 'transparency_entry' : 'hidden_candidate';
}

function combinesStem(left: string, right: string) {
  return MONTH_INTAKE_STEM_COMBINES.some(pair => (pair[0] === left && pair[1] === right) || (pair[0] === right && pair[1] === left));
}

function controls(left: BaziElement, right: BaziElement) {
  return MONTH_INTAKE_CONTROLS[left] === right || MONTH_INTAKE_CONTROLS[right] === left;
}

export function buildBaziMonthIntakeReview(chart: BaziCalculationResult, patterns?: BaziPatternConditionResult): BaziMonthIntakeReview {
  const unknownTime = chart.input.unknownTime || chart.completeness === 'partial_unknown_time' || !chart.pillars.time;
  const pillars = [chart.pillars.year, chart.pillars.month, chart.pillars.day, chart.pillars.time].filter((pillar): pillar is BaziPillar => pillar !== null);
  const month = chart.pillars.month;
  const hidden = month.hiddenStems;
  const mainQiStem = MONTH_INTAKE_MAIN_QI[month.branch] ?? hidden[0]?.stem ?? '';
  const mainQiHidden = hidden.find(item => item.stem === mainQiStem) ?? hidden[0];
  const mainQiElement = mainQiHidden?.element ?? stemElement(mainQiStem);
  const surface = pillars.filter(pillar => pillar.key !== 'day');
  const branchSet = new Set(pillars.map(pillar => pillar.branch));

  const routes: BaziMonthIntakeRoute[] = hidden.map((item, index) => {
    const sourceQi = sourceQiFor(item.stem, index, mainQiStem);
    const positions = surface.filter(pillar => pillar.stem === item.stem).map(pillar => `${pillar.label}${pillar.stem}`);
    const transparency = transparencyFor(positions.length);
    const dayMasterSameStem = chart.dayMaster.stem === item.stem;
    const entry = routeEntry(sourceQi, positions.length > 0);
    const pending: string[] = [];
    if (!positions.length) pending.push(sourceQi === 'main_qi' ? '本气未在年、月、时天干透出，仍保留本气入口。' : '未透，仅作保留候选，不升级为透干入口。');
    if (dayMasterSameStem) pending.push('日主同干只作参照，不计为新增透出位置。');
    if (unknownTime) pending.push('时柱未知，未见透出位置不能判全盘缺失。');
    if (positions.length && sourceQi !== 'main_qi') pending.push('透出位置已见，但仍不自动成为取用结论。');
    return {
      id: `hidden-${index + 1}-${sourceQi}`,
      sourceQi,
      sourceQiLabel: SOURCE_QI_LABELS[sourceQi],
      stem: item.stem,
      element: item.element,
      tenGod: unknownTime ? null : item.tenGod,
      entry,
      entryLabel: ENTRY_LABELS[entry],
      transparency,
      transparencyLabel: TRANSPARENCY_LABELS[transparency],
      positions,
      dayMasterSameStem,
      patternCandidates: patterns?.candidates.filter(candidate => candidate.sourceStem === item.stem).map(candidate => ({ id: candidate.id, label: candidate.label })) ?? [],
      pending,
      note: sourceQi === 'main_qi'
        ? '本气入口始终保留；是否透出只影响透干路径，不删除本气。'
        : positions.length
          ? '他藏透出单列入口；单透与多透只记录位置，不按次数加权。'
          : '他藏未透，保留候选与月藏原文，不补造透干。',
      evidenceId: `pattern:month-intake:route:hidden-${index + 1}-${sourceQi}`,
    };
  });

  const meetings: BaziMonthIntakeMeeting[] = [];
  const incompleteMeetings: BaziMonthIntakeMeeting[] = [];
  for (const group of MONTH_INTAKE_GROUPS) {
    if (!group.branches.includes(month.branch)) continue;
    const observedBranches = group.branches.filter(branch => branchSet.has(branch));
    const complete = observedBranches.length === group.branches.length;
    if (!complete && observedBranches.length < 2) continue;
    const missingBranches = group.branches.filter(branch => !branchSet.has(branch));
    const meeting: BaziMonthIntakeMeeting = {
      id: group.id,
      type: group.type,
      typeLabel: group.type === 'three_harmony' ? '三合' : '三会',
      branches: [...group.branches],
      label: group.label,
      targetElement: group.element,
      complete,
      entry: complete,
      observedBranches,
      missingBranches,
      conclusion: 'target_element_only_not_transformed',
      note: complete
        ? `三支齐见只说明${group.label}结构出现；只记录指向${group.element}，不判合化、成局、去留或效力。`
        : `缺${missingBranches.join('、')}，不构成完整${group.type === 'three_harmony' ? '三合' : '三会'}，仅作缺字条件保留。`,
      evidenceId: `pattern:month-intake:meeting:${group.id}`,
    };
    (complete ? meetings : incompleteMeetings).push(meeting);
  }

  const sixCombines: BaziMonthIntakeSixCombine[] = [];
  for (const pair of MONTH_INTAKE_SIX_COMBINES) {
    if (!pair.branches.includes(month.branch)) continue;
    const partner = pair.branches[0] === month.branch ? pair.branches[1] : pair.branches[0];
    if (!branchSet.has(partner)) continue;
    sixCombines.push({
      id: pair.id,
      branches: [...pair.branches],
      partner,
      label: `${pair.branches.join('')}六合`,
      note: '六合单列，不作为三合或三会入口；不判合绊、合去或解冲。',
      evidenceId: `pattern:month-intake:six-combine:${pair.id}`,
    });
  }

  const obstructions: BaziMonthIntakeObstruction[] = [];
  const seenObstructions = new Set<string>();
  const pushObstruction = (item: Omit<BaziMonthIntakeObstruction, 'status' | 'evidenceId'>, key: string) => {
    if (seenObstructions.has(key)) return;
    seenObstructions.add(key);
    obstructions.push({ ...item, status: 'condition_pending', evidenceId: `pattern:month-intake:obstruction:${obstructions.length + 1}` });
  };

  for (const clash of MONTH_INTAKE_CLASHES) {
    if (!clash.branches.includes(month.branch)) continue;
    const partner = clash.branches[0] === month.branch ? clash.branches[1] : clash.branches[0];
    if (!branchSet.has(partner)) continue;
    pushObstruction({
      id: clash.id,
      kind: 'month_branch_clash',
      label: `月支${month.branch}与${partner}六冲并见`,
      detail: '相冲与入口并见只作相反条件记录；不据此解合、破局、裁决去留或推定作用结果。',
      relatedRouteIds: [],
      relatedMeetingIds: [...meetings, ...incompleteMeetings].filter(meeting => meeting.observedBranches.includes(month.branch) && meeting.observedBranches.includes(partner)).map(meeting => meeting.id),
    }, clash.id);
  }

  for (const route of routes.filter(item => item.positions.length > 0)) {
    for (const pillar of pillars) {
      if (pillar.stem === route.stem || !combinesStem(route.stem, pillar.stem)) continue;
      pushObstruction({
        id: `stem-combine-${route.stem}-${pillar.stem}`,
        kind: 'surface_stem_combine',
        label: `${route.stem}透出与${pillar.label}${pillar.stem}相合`,
        detail: '天干相合只作条件并列；不裁合去、合化、争合或解除，也不改变入口位置。',
        relatedRouteIds: [route.id],
        relatedMeetingIds: [],
      }, `stem-combine-${route.stem}-${pillar.stem}`);
    }
  }

  const transparentRoutes = routes.filter(route => route.positions.length > 0);
  for (const meeting of meetings) {
    const compared: Array<{ element: BaziElement; routeId: string | null; label: string }> = [
      { element: mainQiElement, routeId: null, label: `月令本气${mainQiStem}${mainQiElement}` },
      ...transparentRoutes.map(route => ({ element: route.element, routeId: route.id, label: `${route.stem}${route.element}透干` })),
    ];
    for (const item of compared) {
      if (item.element === meeting.targetElement || !controls(item.element, meeting.targetElement)) continue;
      const meetingControls = MONTH_INTAKE_CONTROLS[meeting.targetElement] === item.element;
      pushObstruction({
        id: `opposition-${meeting.id}-${item.routeId ?? 'main-qi'}`,
        kind: 'element_opposition',
        label: `${meeting.label}与${item.label}五行相克`,
        detail: `${meetingControls ? `会支指向的${meeting.targetElement}克${item.label}` : `${item.label}克会支指向的${meeting.targetElement}`}；并见不等于去留、合化或成败，未裁优先级。`,
        relatedRouteIds: item.routeId ? [item.routeId] : [],
        relatedMeetingIds: [meeting.id],
      }, `opposition-${meeting.id}-${item.routeId ?? 'main-qi'}`);
    }
  }

  const counts = {
    hiddenRoutes: routes.length,
    mainQiTransparent: routes.some(route => route.sourceQi === 'main_qi' && route.positions.length > 0),
    singleTransparent: routes.filter(route => route.transparency === 'single_transparent').length,
    multipleTransparent: routes.filter(route => route.transparency === 'multiple_transparent').length,
    notTransparent: routes.filter(route => route.transparency === 'not_transparent').length,
    completeMeetings: meetings.length,
    incompleteMeetings: incompleteMeetings.length,
    sixCombines: sixCombines.length,
    obstructions: obstructions.length,
  };

  const label = unknownTime ? '缺时柱，入口候选降级' : '本气、透干与会支入口并列';
  const detail = `月支${month.branch}本气${mainQiStem}${mainQiElement}；单透${counts.singleTransparent}个、多透${counts.multipleTransparent}个、未透候选${counts.notTransparent}个；完整会支${counts.completeMeetings}组、缺字${counts.incompleteMeetings}组、六合${counts.sixCombines}组、并列条件${counts.obstructions}条。全部候选并列保留，不排名、不裁去留。${unknownTime ? '时柱未知，年、月、日之外的透出位置与会支组合可能不全；未见不得判缺失，十神不列全日唯一值。' : ''}`;

  return {
    version: BAZI_MONTH_INTAKE_VERSION,
    policy: BAZI_MONTH_INTAKE_POLICY,
    policyLabel: '《子平真诠》用神变化与杂气取用 · 窄条目',
    status: unknownTime ? 'partial_unknown_time' : 'complete',
    label,
    detail,
    monthBranch: month.branch,
    unknownTime,
    dayMasterStem: chart.dayMaster.stem,
    dayMasterElement: chart.dayMaster.element,
    monthMainQiStem: mainQiStem,
    monthMainQiElement: mainQiElement,
    monthHiddenStems: hidden.map(item => ({ stem: item.stem, element: item.element, tenGod: unknownTime ? null : item.tenGod })),
    routes,
    meetings,
    incompleteMeetings,
    sixCombines,
    obstructions,
    counts,
    sources: MONTH_INTAKE_SOURCES.map(item => ({ ...item })),
    boundaries: [...BOUNDARIES],
  };
}

export function describeBaziMonthIntakeReview(review: BaziMonthIntakeReview): string {
  const routeText = review.routes.map(route => `${route.sourceQiLabel}${route.stem}${route.element}（${route.entryLabel}/${route.transparencyLabel}；表层${route.positions.join('、') || '未见'}${route.dayMasterSameStem ? '；日干同干参照' : ''}${review.unknownTime ? '；十神待核' : `；十神${route.tenGod ?? '未定'}`}）`).join('；');
  const meetingText = review.meetings.map(meeting => `${meeting.label}→${meeting.targetElement}（只指五行，未化）`).join('；') || '本清单未见完整三合或三会';
  const conditionalText = [
    ...review.incompleteMeetings.map(meeting => `${meeting.label}缺${meeting.missingBranches.join('、')}`),
    ...review.sixCombines.map(item => item.label),
    ...review.obstructions.map(item => item.label),
  ].join('；') || '本清单未见缺字、六合或相反条件';
  return `【月令取用入口复核】${review.version}；${review.policyLabel}；${review.label}。${review.detail}
透干入口：${routeText}
会支入口：${meetingText}
单列条件：${conditionalText}
规则边界：${review.boundaries.join(' ')}`;
}

export function baziMonthIntakeEvidence(review: BaziMonthIntakeReview): BaziReadingEvidence[] {
  const sourceUrl = review.sources[0]?.url;
  const evidence: BaziReadingEvidence[] = [{
    id: 'pattern:month-intake:overview',
    label: '月令取用入口：本气、透干、会支与条件并列',
    details: describeBaziMonthIntakeReview(review),
    family: 'pattern',
    sourceUrl,
  }];
  for (const route of review.routes) evidence.push({
    id: route.evidenceId,
    label: `${route.sourceQiLabel}${route.stem}的${route.entryLabel}`,
    details: `${route.stem}${route.element}；${route.entryLabel}，${route.transparencyLabel}；年、月、时同干位置${route.positions.join('、') || '未见'}${route.dayMasterSameStem ? '；日主同干仅参照' : ''}；十神${review.unknownTime ? '时辰未知，不列全日唯一值' : route.tenGod ?? '未定'}；同源格局候选${route.patternCandidates.map(item => item.label).join('、') || '无'}。${route.pending.join('；')}${route.note}`,
    family: 'pattern',
    sourceUrl,
  });
  for (const meeting of [...review.meetings, ...review.incompleteMeetings]) evidence.push({
    id: meeting.evidenceId,
    label: meeting.complete ? `${meeting.label}（完整会支入候）` : `${meeting.label}（缺字条件）`,
    details: `类型${meeting.typeLabel}；已见${meeting.observedBranches.join('、')}${meeting.missingBranches.length ? `；缺${meeting.missingBranches.join('、')}` : ''}；目标只到${meeting.targetElement}，不指定阴阳天干，不称已化。${meeting.note}`,
    family: 'pattern',
    sourceUrl,
  });
  for (const item of review.sixCombines) evidence.push({ id: item.evidenceId, label: `${item.label}条件`, details: item.note, family: 'pattern', sourceUrl });
  for (const item of review.obstructions) evidence.push({ id: item.evidenceId, label: item.label, details: item.detail, family: 'pattern', sourceUrl });
  return evidence;
}
