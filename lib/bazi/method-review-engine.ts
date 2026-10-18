import { BAZI_ELEMENTS, type BaziCalculationResult, type BaziElement, type BaziPillar } from './types';
import type { BaziClimateAnalysis, BaziElementPosition } from './reading-types';
import type { BaziInterpretationResult } from './interpretation-types';
import type { BaziPatternConditionCheck, BaziPatternConditionResult } from './pattern-condition-types';
import type { BaziFineReview } from './fine-reading-types';
import type { BaziNatalEffectReview } from './natal-effect-types';
import type { BaziMethodCondition, BaziMethodReview } from './method-review-types';
import { BAZI_METHOD_REVIEW_VERSION, ELEMENT_CONTROLS, ELEMENT_GENERATES, METHOD_CONDITION_LABELS, METHOD_REVIEW_SOURCES } from './method-review-rules';
import { NATAL_STEM_ELEMENT } from './natal-effect-rules';

/** 日干在取用位置中只作参照；通关的对峙对象观察才纳入日干。位置不表示力量。 */
export function locateBaziMethodElement(chart: BaziCalculationResult, element: BaziElement, includeDay = false): BaziElementPosition {
  const pillars = Object.values(chart.pillars).filter((p): p is BaziPillar => p !== null);
  const surface = pillars.filter(p => (includeDay || p.key !== 'day') && p.stemElement === element).map(p => `${p.label}${p.stem}`);
  const hidden = pillars.flatMap(p => p.hiddenStems.filter(s => s.element === element).map(s => `${p.label}${p.branch}藏${s.stem}`));
  return { element, surface, hidden, status: surface.length ? 'surface_present' : hidden.length ? 'hidden_only' : chart.completeness === 'partial_unknown_time' ? 'unknown_time' : 'not_observed' };
}
function condition(id: string, label: string, seen: boolean, detail: string, absenceUnknown = false): BaziMethodCondition {
  return { id, label, status: seen ? 'observed' : absenceUnknown ? 'pending' : 'not_observed', detail };
}
function pending(id: string, label: string, detail: string): BaziMethodCondition { return { id, label, status: 'pending', detail }; }
function patternCheck(item: BaziPatternConditionCheck): BaziMethodCondition {
  return { id: item.id, label: item.label, status: item.status === 'evidence_present' ? 'observed' : item.status === 'not_observed' ? 'not_observed' : item.status === 'not_applicable' ? 'not_applicable' : 'pending', detail: `${item.statusLabel}；${item.detail}；${item.evidence.map(e => e.detail).join('；') || '无已记录位置证据'}。${item.boundary}` };
}
export function buildBaziMethodReview(input: {
  chart: BaziCalculationResult; interpretation: BaziInterpretationResult; patterns: BaziPatternConditionResult;
  climate: BaziClimateAnalysis; fine: BaziFineReview; natal: BaziNatalEffectReview;
}): BaziMethodReview {
  const { chart, interpretation, patterns, climate, fine, natal } = input;
  const unknown = chart.completeness === 'partial_unknown_time', audit = interpretation.strength;
  const root = natal.roots.find(r => r.isDayMaster);
  const supportingMonth = audit.monthRelation === 'peer' || audit.monthRelation === 'resource';
  const strengthConditions: BaziMethodCondition[] = [
    condition('complete', '四柱资料完整', !unknown, unknown ? '时柱未知；依赖“全盘未见”的判断均保留。' : '四柱已知；资料完整不表示断法条件完备。', unknown),
    condition('month-support', '月令本气生扶线索', supportingMonth, `${audit.monthBranch}月本气${audit.monthMainQiStem}，与日主关系为${({ peer: '同类', resource: '生扶', output: '泄', wealth: '耗', officer: '制' } as const)[audit.monthRelation]}；得令与最终身强不是同义。`),
    condition('root', '日主同五行藏根位置', Boolean(root?.roots.length), root?.roots.map(r => `${r.location}（${r.kind === 'same_stem' ? '同干根' : '同五行其他藏干'}）`).join('；') || '已知柱未见；不能由此单独判从格或身弱。', unknown),
    pending('capacity', '最终旺衰与承载', '现有标签只记录证据分布；尚未裁决根深浅、有效性及全局承载，不换算分数。'),
  ];
  const specialEntries = fine.specialPatterns.filter(p => p.status === 'entry_observed' || p.status === 'unknown_time');
  const counterevidence = [
    ...audit.evidence.filter(e => e.side !== 'context' && (audit.assessment === 'supporting_evidence_established' ? e.side === 'drain_or_control' : audit.assessment === 'draining_evidence_established' ? e.side === 'support' : true)).map(e => `${e.side === 'support' ? '生扶' : '泄耗制'}线索 · ${e.label}：${e.detail}`),
    ...(root?.roots.filter(r => r.clashes.length).map(r => `${r.location}同时受冲：${r.clashes.join('、')}；保留原根，不直接判拔根。`) ?? []),
    ...natal.combinations.filter(c => c.involvesDay).map(c => `${c.label}并见近合或隔位条件；不自动消除日主自身。`),
  ];
  const direction = unknown ? 'undetermined' : audit.assessment === 'supporting_evidence_established' ? 'drain_control' : audit.assessment === 'draining_evidence_established' ? 'support' : 'undetermined';
  const dm = chart.dayMaster.element;
  const balancingElements: BaziElement[] = direction === 'drain_control' ? [ELEMENT_GENERATES[dm], ELEMENT_CONTROLS[dm], BAZI_ELEMENTS.find(e => ELEMENT_CONTROLS[e] === dm)!] : direction === 'support' ? [BAZI_ELEMENTS.find(e => ELEMENT_GENERATES[e] === dm)!, dm] : [];
  const patternPaths = patterns.candidates.map(p => {
    const separate = ['build_prosperity', 'month_robbery', 'yang_blade'].includes(p.archetype);
    return { id: p.id, label: p.archetype === 'yang_blade' ? `${p.label} · 阳刃路径` : p.label, archetype: p.archetype, sourceStem: p.sourceStem, sourceElement: NATAL_STEM_ELEMENT[p.sourceStem], meaning: separate ? 'peer_month_separate_selection' as const : 'month_command_reference' as const,
      conditions: [condition('transparent', '月令来源干透出', p.transparentAt.length > 0, `${p.sourceStem}来自${p.sourceQi === 'main_qi' ? '本气' : p.sourceQi === 'secondary_qi' ? '中气' : '余气'}；透出位置：${p.transparentAt.join('、') || '已知柱未见'}。仅藏不冒充已透。`, unknown),
        ...(separate ? [pending('separate-selection', '禄劫刃另查财官食杀', '月令同气只表示格局入口；不能把该同气五行直接指定为补偏喜用，需逐项核对财官食杀及承载。')] : []),
        pending('success', '格局成败与相神效力', '支持、风险、救应分别保留，未按条数排序，也不因救应角色出现而删除风险。')],
      support: p.formationSupport.map(patternCheck), risks: p.breakingRisks.map(patternCheck), rescues: p.rescueCandidates.map(item => ({ ...patternCheck(item), detail: `${patternCheck(item).detail} 对应风险：${p.breakingRisks.filter(r => item.linkedBreakingRuleIds.includes(r.ruleId)).map(r => r.label).join('、') || '上游通用风险条件'}；救应候选不删除对应风险。` })),
      pending: [
        ...(patterns.monthCommand.isStorageMonth ? ['杂气月保留全部来源干路径，不默认第一项胜出。'] : []),
        ...(patterns.candidates.length > 1 ? ['多个候选并列，透出位置与各自条件须分别核对。'] : []),
        ...(p.reviewFlags.includes('metal_water_hurting_officer_exception_pending') ? ['金水伤官的气候例外仍待核，不按伤官见官单项判破格。'] : []),
        ...(unknown ? ['缺时柱；未见支持或风险角色不能视为全盘不存在。'] : []),
        '承载、位置先后、清浊和救应实际效力未作最终裁决。',
      ],
    };
  });
  const periodPending = climate.reference?.basis === 'period_conditional' && natal.period.status !== 'resolved';
  const activeBranch = natal.period.status === 'resolved' ? natal.period.branches.find(b => b.id === natal.period.activeBranchId) : undefined;
  const climateStems = climate.stemReferences.map(s => {
    const check = fine.stemChecks.find(c => c.stem === s.stem);
    return { stem: s.stem, element: NATAL_STEM_ELEMENT[s.stem], role: activeBranch ? activeBranch.primary.includes(s.stem) ? '当前分支主要参考' : '当前分支配合参考' : check?.role === 'conditional' ? '章节条件支线' : check?.role === 'support' ? '章节配合参考' : '章节主要参考',
      position: `表层${s.surface.join('、') || '未见'}；藏干${s.hidden.join('、') || '未见'}${s.status === 'unknown_time' ? '；时柱未知，不能判缺' : ''}`,
      observations: check ? [...check.combinations, ...check.rootClashes] : [],
      pending: [...(periodPending ? ['月内适用分支尚未定位，不能把章节全集并取。'] : []), ...(check?.cautions ?? []), '透藏位置不表示有效或有力，尚需核对承载与配合。'],
    };
  });
  const flow = BAZI_ELEMENTS.map(opponent => {
    const target = ELEMENT_CONTROLS[opponent], bridge = ELEMENT_GENERATES[opponent];
    const positions = [opponent, target, bridge].map(e => locateBaziMethodElement(chart, e, true));
    return { id: `flow:${opponent}:${target}`, label: `${opponent}、${target}并见时的${bridge}桥接参考`, opposing: [opponent, target] as [BaziElement, BaziElement], bridge, positions,
      conditions: [
        ...positions.slice(0, 2).map(p => condition(`present:${p.element}`, `${p.element}的位置线索`, p.surface.length + p.hidden.length > 0, `表层${p.surface.join('、') || '未见'}；藏干${p.hidden.join('、') || '未见'}。同见仅是结构入口。`, unknown)),
        pending('opposition-parity', '两方是否对峙且力量相当', '程序未裁决两方势力；字符计数、同见两行不能替代势均对峙条件。'),
        condition('bridge-position', `${bridge}的桥接位置`, positions[2].surface.length + positions[2].hidden.length > 0, `表层${positions[2].surface.join('、') || '未见'}；藏干${positions[2].hidden.join('、') || '未见'}。${opponent}生${bridge}、${bridge}生${target}仅为五行路径；中介出现不等于已能通关。`, unknown),
        pending('flow-effective', '桥接能否实际发挥作用', '位置、根气、阻隔与承载尚未联合裁决；不因未见中介就建议补该五行。'),
      ],
    };
  });
  return {
    version: BAZI_METHOD_REVIEW_VERSION, unknownTime: unknown,
    strength: { label: audit.label, conditions: strengthConditions, counterevidence, pending: ['月令、根气与表层关系需综合核对；不以某一个证据直接下强弱结论。', ...specialEntries.map(p => `${p.label}存在入口或缺时待核，不能直接套用普通扶抑。`)] },
    patterns: patternPaths,
    balancing: { label: direction === 'support' ? '生扶方向的条件候选' : direction === 'drain_control' ? '泄耗制方向的条件候选' : '前提不足，暂不列扶抑候选', direction, elements: balancingElements,
      conditions: [...strengthConditions, ...(specialEntries.length ? [pending('special-exclusion', '特殊格局排除与复核', specialEntries.map(p => `${p.label}：${p.observations.join('；') || '缺时待核'}`).join('；'))] : [])],
      pending: ['候选只继承静态证据分布的方向，不等于已判身强身弱。', '泄、耗、制之间不作等效排名；生扶也不自动等于有利。', '最终喜用及适用先后仍未裁定。'] },
    climate: { label: climate.rule.label, conditions: [
      condition('climate-month', '按已保存节令月支定位', true, `${chart.dayMaster.stem}日主、${chart.pillars.month.branch}月；不按公历月份。`),
      periodPending ? pending('climate-period', '月内适用条件', natal.period.detail) : condition('climate-period', '月内适用条件', true, natal.period.status === 'resolved' ? natal.period.detail : '当前参考不要求本清单内的节气分支；章节中的其他条件仍需逐项核对。'),
      pending('climate-effective', '调候实际效力与承载', '寒暖燥湿是传统规则语义；原典用干出现不代表已经有效。'),
    ], stems: climateStems, pending: [...(periodPending ? [natal.period.detail] : []), ...climate.conditions] },
    flow,
    coordination: BAZI_ELEMENTS.map(element => {
      const patternReferences = patternPaths.filter(p => p.sourceElement === element).map(p => p.label), balancing = balancingElements.includes(element), stems = climateStems.filter(s => s.element === element).map(s => s.stem);
      return { element, patternReferences, balancing, climateStems: stems, note: balancing && stems.length ? '同一五行有扶抑与调候两种语义；不是两份独立证据，不叠加置信度。' : stems.length ? '调候参考不在扶抑候选中，也不能据此判为冲突或忌神；应核对承载、季节与原局条件。' : patternReferences.length ? '月令来源五行只表示格局入口，不直接转成喜用。' : balancing ? '仅有扶抑条件方向，仍待承载与全局复核。' : '当前方法未提供取用方向；不按五行缺项补齐。' };
    }),
    sources: METHOD_REVIEW_SOURCES.map(s => ({ ...s })),
    boundary: '本模块复核原局各方法的必要条件、反证和未决项；未给最终旺衰、格局成败、通关成立或完整喜忌，不外推岁运结果。',
  };
}

/** 按问题带入简明的同源复核，避免完整矩阵挤掉岁运上下文。 */
export function describeBaziMethodReview(review: BaziMethodReview): string {
  const render = (items: BaziMethodCondition[]) => items.map(c => `${c.label}=${METHOD_CONDITION_LABELS[c.status]}（${c.detail}）`).join('；');
  return `【分方法旺衰格局取用复核】${review.version}
旺衰：${review.strength.label}；${render(review.strength.conditions)}；反向及阻碍线索：${review.strength.counterevidence.join('；') || '本清单未见，不证明无阻碍'}。
月令格局全部候选：${review.patterns.map(p => `${p.label}，来源${p.sourceStem}，${p.meaning === 'peer_month_separate_selection' ? '禄劫刃须另查财官食杀，月令同气不直接当喜用' : '月令格局语义不等同扶抑喜用'}；${render(p.conditions)}；支持${p.support.filter(c => c.status === 'observed').map(c => c.label).join('、') || '未见明确项'}；风险${p.risks.filter(c => c.status === 'observed').map(c => c.label).join('、') || '未见明确项'}；救应${p.rescues.filter(c => c.status === 'observed').map(c => c.label).join('、') || '未见明确项'}；待核${p.pending.join('；')}`).join('。') || '无已保存候选'}。
扶抑：${review.balancing.label}；条件方向${review.balancing.elements.join('、') || '暂不列'}；${review.balancing.pending.join('；')}。
调候：${review.climate.label}；${review.climate.stems.map(s => `${s.stem}（${s.role}），${s.position}；${s.observations.join('；')}`).join('。')}；${render(review.climate.conditions)}。
通关：${review.flow.filter(f => f.conditions.slice(0, 2).every(c => c.status === 'observed')).map(f => `${f.label}；${render(f.conditions)}`).join('。') || '本清单未见两方同时出现的结构入口，缺时不能判全盘无此入口'}；病点与药的有效性未裁决。
协调：${review.coordination.filter(c => c.balancing || c.climateStems.length || c.patternReferences.length).map(c => `${c.element}：${c.note}`).join('；')}。${review.boundary}`;
}
