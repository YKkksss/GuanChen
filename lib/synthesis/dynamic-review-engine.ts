import { auditBaziRelationNodeSet, type BaziRelationNodeInput } from '@/lib/bazi/relation-audit-engine';
import { BAZI_RELATION_AUDIT_ENGINE_VERSION, BAZI_RELATION_AUDIT_METHODOLOGY, BAZI_RELATION_AUDIT_METHODOLOGY_VERSION } from '@/lib/bazi/relation-audit-methodology';
import { BAZI_PILLAR_KEYS } from '@/lib/bazi/types';
import { BRANCHES } from '@/lib/ziwei/constants';
import type { AnnualTransitSnapshot, MonthlyTransitSnapshot } from '@/lib/transits/types';
import type { SynthesisDynamicStage } from './dynamic-types';
import { SYNTHESIS_DYNAMIC_REVIEW_VERSION, type SynthesisDynamicReview, type SynthesisTopicAnchor } from './dynamic-review-types';
import { SYNTHESIS_TOPICS, type SynthesisEvidence, type SynthesisFacts } from './types';

const normalizePalace = (name: string) => name.replace(/宫$/, '');
const validBranch = (branch: number | null): branch is number => branch !== null && Number.isInteger(branch) && branch >= 0 && branch < 12;

/** 只复核同观察点已定位的年、月结构，不调用全年代表点或另算大限四化。 */
export function buildSynthesisDynamicReview(base: SynthesisFacts, stage: SynthesisDynamicStage): SynthesisDynamicReview {
  const chart = base.bazi.chart;
  const unknownTime = base.policy.unknownTime || chart.input.unknownTime || !chart.pillars.time;
  const birthUnconfirmed = unknownTime && stage.selection.dateTime.slice(0, 10) === chart.input.birthDate;
  const layers = [reviewZiweiLayer(base, stage.ziwei.annual, 'year')];
  if (stage.ziwei.monthly) layers.push(reviewZiweiLayer(base, stage.ziwei.monthly, 'month'));
  const nodes: BaziRelationNodeInput[] = [];
  // 未知出生时刻的当日观察，不能把日历节点升级成个人已经出生后的作用。
  if (!birthUnconfirmed) {
    for (const key of BAZI_PILLAR_KEYS) {
      const pillar = chart.pillars[key];
      if (!pillar || (key === 'time' && unknownTime)) continue;
      nodes.push({ id: `natal:${key}`, layer: 'natal', label: `本命${pillar.label}`, ganZhi: pillar.ganZhi, pillarKey: key });
    }
    const at = stage.selection.dateTime.replace('T', ' ');
    const { luck, year, month } = stage.bazi;
    if (luck.status === 'active' && luck.cycle) nodes.push({ id: 'dynamic:luck', layer: 'luck_cycle', label: `第${luck.cycle.index}步大运`, ganZhi: luck.cycle.ganZhi, luckCycleIndex: luck.cycle.index, effectiveDate: at });
    const annualYear = Number(year.startAt.slice(0, 4));
    nodes.push({ id: 'dynamic:year', layer: 'annual', label: '八字流年', ganZhi: year.ganZhi, annualYear, effectiveDate: at });
    if (month) nodes.push({ id: 'dynamic:month', layer: 'month', label: '八字节令月', ganZhi: month.ganZhi, annualYear, effectiveDate: at });
  }
  const relations = birthUnconfirmed ? [] : auditBaziRelationNodeSet({ nodes, year: Number(stage.bazi.year.startAt.slice(0, 4)), segmentIndex: 0 })
    .map((relation, index) => ({ ...relation, evidenceId: `bazi:dynamic:review:relation:${index}` }));
  const themeRoles: readonly string[] = SYNTHESIS_TOPICS[base.topic].roles;
  const topicRoles = birthUnconfirmed ? [] : stage.bazi.roles.map(role => ({
    ...role, matchesTopic: themeRoles.includes(role.stemTenGod),
    hiddenStems: role.hiddenStems.map(item => ({ ...item, matchesTopic: themeRoles.includes(item.tenGod) })),
  }));
  const ziweiBoundaries = [
    '本命主题宫和阶段主题宫使用两组坐标，分别列出本宫、对宫、三方的实际命中；未命中只表示未落在这组宫位。',
    '同一四化可能同时关联多个主题锚点，不能按条数认定强弱、吉凶或多重独立证明；本轮不新增飞化链或大限四化。',
    ...(unknownTime ? ['出生时辰未知：紫微为子时试排，以下主题宫位和四化关系仅作条件参考。'] : []),
    ...(birthUnconfirmed ? ['观察为出生当日且真实出生时刻未知，尚不能确认已出生；试排映射不能宣称已对本人适用。'] : []),
  ];
  const baziBoundaries = [
    '只检查所列节点之间的跨层关系，不穷举本命内部关系；成员齐全才列三合、三会、三刑，缺支不补齐。',
    '同类、生克、五合及合冲刑害为结构记录，未裁定合化、远近、旺衰、制约抵消或最终效力。',
    '主题十神只作观察索引；藏干仍为藏干，命中主题不表示透出、引动、具体人物或事件。',
    stage.bazi.luck.reason,
    ...(unknownTime ? ['时柱未知，不补时柱，缺少精确起运时不加入大运节点；本命柱的时间边界限制继续保留。'] : []),
    ...(birthUnconfirmed ? ['当前个人作用适用撤回：不能确认观察时刻已在出生之后，暂不列个人关系及主题十神，只保留上方日历定位。'] : []),
  ];
  return {
    version: SYNTHESIS_DYNAMIC_REVIEW_VERSION,
    topic: base.topic,
    observation: stage.selection.dateTime,
    scope: '同一北京时间观察点的主题四化落点与八字跨层结构复核；两套体系分别解释。',
    status: birthUnconfirmed ? 'birth_time_unconfirmed' : unknownTime ? 'partial_unknown_time' : 'available',
    ziwei: { referenceOnly: unknownTime, layers, boundaries: ziweiBoundaries },
    bazi: { methodologyVersion: BAZI_RELATION_AUDIT_METHODOLOGY_VERSION, engineVersion: BAZI_RELATION_AUDIT_ENGINE_VERSION, nodes, relations, topicRoles, boundaries: baziBoundaries },
    sideBySide: [
      { id: 'calendar', label: '年与月的分界', ziwei: `按观察日定位农历${stage.ziwei.annual.year.ganZhi}年${stage.ziwei.monthly ? `、${stage.ziwei.monthly.lunarMonth.label}` : '；当前未开启流月'}。`, bazi: `按精确立春定位${stage.bazi.year.ganZhi}年${stage.bazi.month ? `，按十二节定位${stage.bazi.month.ganZhi}月` : '；当前未开启流月'}；区间前闭后开。` },
      { id: 'period', label: '当前长期阶段', ziwei: stage.ziwei.annual.decadal.periodKind === 'decadal' ? `${stage.ziwei.annual.decadal.startAge}至${stage.ziwei.annual.decadal.endAge}虚岁大限，保留宫位背景；未新增大限四化。` : stage.ziwei.annual.decadal.periodKind === 'childhood' ? '当前为童限，不作为正式十年大限。' : '当前大限不可用，不补造。', bazi: stage.bazi.luck.reason },
      { id: 'topic', label: `${SYNTHESIS_TOPICS[base.topic].label}的观察入口`, ziwei: `${SYNTHESIS_TOPICS[base.topic].palaces.join('、')}，分别检查本命与阶段主题坐标。`, bazi: `${themeRoles.join('、')}作为十神索引，表干与藏干分别列出；不是最终喜忌。` },
      { id: 'limits', label: '仍需核对的条件', ziwei: unknownTime ? '需先核实出生时辰；当前为试排。' : '宫位关联未裁定四化实际效力，也不提供事件日期。', bazi: birthUnconfirmed ? '需确认真实出生时刻；当前个人作用适用撤回。' : unknownTime ? '缺少时柱与精确起运；结构不等于完整作用。' : '跨层结构未裁定合化与效力，现实结果仍需独立核实。' },
    ],
    sources: [
      { id: 'ziwei-transit-snapshots', system: 'ziwei', title: '紫微年、月观察日快照', version: layers.map(layer => layer.engineVersion).join(' / '), note: '复用既有 iztro 四化和宫位映射，不自行增补大限四化。' },
      { id: 'ziwei-topic-geometry', system: 'ziwei', title: '主题宫位与三方四正映射规则', version: SYNTHESIS_DYNAMIC_REVIEW_VERSION, note: '按本命地支坐标检查本宫、对宫（相隔六宫）及三方（相隔四、八宫）；本命主题与阶段主题分列。' },
      { id: 'bazi-node-audit', system: 'bazi', title: '八字跨层干支关系目录', version: `${BAZI_RELATION_AUDIT_METHODOLOGY_VERSION} / ${BAZI_RELATION_AUDIT_ENGINE_VERSION}`, note: '仅复用纯节点关系目录；节点来自当前精确观察点，不套用全年片段或作用效力裁决。' },
      ...BAZI_RELATION_AUDIT_METHODOLOGY.sources.filter(source => source.type === 'classical_text').map(source => ({ id: source.id, system: 'bazi' as const, title: source.title, version: BAZI_RELATION_AUDIT_METHODOLOGY_VERSION, note: source.note, ...(source.url ? { url: source.url } : {}) })),
    ],
    boundaries: [
      '两套体系并列保留事实和限制；没有跨体系配对、分数、自动共识或事实互证。',
      '未列某条主题关系不等于没有其他条件，也不表示相反结论；不补算流日、流时或完整喜忌。',
      '复核与报告随主题、观察层级、精确时刻及方法版本保存；旧快照不会补入新规则。',
    ],
  };
}

function reviewZiweiLayer(base: SynthesisFacts, snapshot: AnnualTransitSnapshot | MonthlyTransitSnapshot, level: 'year' | 'month'): SynthesisDynamicReview['ziwei']['layers'][number] {
  const anchors: SynthesisTopicAnchor[] = [];
  for (const topicPalace of SYNTHESIS_TOPICS[base.topic].palaces) {
    const natal = base.ziwei.palaces.find(palace => normalizePalace(palace.name) === normalizePalace(topicPalace));
    if (natal && validBranch(natal.branch)) anchors.push({ topicPalace, reference: 'natal_topic', branch: natal.branch, nativePalaceName: natal.name });
    const mapping = snapshot.palaceMappings.find(palace => normalizePalace(palace.transitPalaceName) === normalizePalace(topicPalace));
    if (mapping && validBranch(mapping.branch)) anchors.push({ topicPalace, reference: 'dynamic_topic', branch: mapping.branch, nativePalaceName: mapping.nativePalaceName });
  }
  const transformations = snapshot.transformations.map((item, index) => {
    const branch = item.natalPalaceBranch;
    const located = validBranch(branch) && base.ziwei.palaces.some(palace => palace.branch === branch);
    const hits: SynthesisDynamicReview['ziwei']['layers'][number]['transformations'][number]['hits'] = [];
    if (located) for (const anchor of anchors) {
      const distance = (branch - anchor.branch + 12) % 12;
      if (distance === 0 || distance === 6 || distance === 4 || distance === 8) hits.push({ ...anchor, relation: distance === 0 ? 'direct' : distance === 6 ? 'opposite' : 'trine' });
    }
    return { ...item, evidenceId: `ziwei:dynamic:review:${level}:${index}`, located, hits };
  });
  return { level, label: level === 'year' ? '流年四化' : '流月四化', engineVersion: snapshot.engineVersion, anchors, transformations };
}

/** 新增证据单独编号；总览保留撤回原因，报告不能用本命或旧定位依据替代复核。 */
export function buildSynthesisDynamicReviewEvidence(review: SynthesisDynamicReview): SynthesisEvidence[] {
  const evidence: SynthesisEvidence[] = [
    { id: 'ziwei:dynamic:review:scope', system: 'ziwei', label: '主题四化复核范围与限制', details: `${review.observation.replace('T', ' ')}，固定 UTC+08:00；${SYNTHESIS_TOPICS[review.topic].label}主题。${review.ziwei.boundaries.join('')}` },
    { id: 'bazi:dynamic:review:scope', system: 'bazi', label: '八字跨层复核节点与限制', details: `${review.observation.replace('T', ' ')}，固定 UTC+08:00；节点：${review.bazi.nodes.map(node => `${node.label}${node.ganZhi}`).join('、') || '个人作用适用撤回，暂不建立'}。${review.bazi.boundaries.join('')}` },
  ];
  for (const layer of review.ziwei.layers) for (const item of layer.transformations) evidence.push({
    id: item.evidenceId, system: 'ziwei', label: `${layer.label} · ${item.starName}化${item.type}`,
    details: `${item.located ? `落本命${item.natalPalaceName ?? '未记录宫名'}（${BRANCHES[item.natalPalaceBranch!]}）` : '本命落宫未定位，不推补'}；${item.hits.map(hit => `${hit.reference === 'natal_topic' ? '本命' : layer.level === 'year' ? '流年' : '流月'}${hit.topicPalace}（本命${hit.nativePalaceName}·${BRANCHES[hit.branch]}）的${hit.relation === 'direct' ? '本宫' : hit.relation === 'opposite' ? '对宫' : '三方'}`).join('、') || '未列该主题宫位命中'}。${review.ziwei.referenceOnly ? '仅为未知时辰子时试排参考；' : ''}${review.status === 'birth_time_unconfirmed' ? '出生前后未确认，个人适用撤回；' : ''}宫位关联不等于效力或事件结论。`,
  });
  for (const relation of review.bazi.relations) evidence.push({ id: relation.evidenceId, system: 'bazi', label: `跨层关系 · ${relation.label}`, details: `${relation.participants.map(item => `${item.label}${item.symbol}`).join('、')}；${relation.detail}。只记录结构，不裁定合化、喜忌或实际效力。` });
  evidence.push({ id: 'bazi:dynamic:review:topic-roles', system: 'bazi', label: '当前主题的表干与藏干十神索引', details: review.bazi.topicRoles.length ? review.bazi.topicRoles.map(role => `${role.label}${role.ganZhi}：表干${role.stemTenGod}${role.matchesTopic ? '列入当前主题索引' : '未列当前主题索引'}；藏干${role.hiddenStems.map(item => `${item.stem}${item.tenGod}${item.matchesTopic ? '列入索引' : '未列索引'}`).join('、')}`).join('；') + '。主题索引不表示透出、效力、吉凶或现实人物。' : '个人作用适用撤回，不列主题十神索引。' });
  return evidence;
}
