import type { CaseEventSnapshot, CaseTeachingDetail, CaseTeachingEvidence } from './types';
import { getCaseRecord } from '@/lib/db/cases';
import { isTeachingCaseEligible, toZiweiChart } from '@/lib/db/case-search';
import { LIFE_EVENT_CATEGORY_LABELS } from '@/lib/events/types';
import { detectPatterns } from '@/lib/ziwei/patterns';

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export function getCaseTeachingDetail(caseId: string): CaseTeachingDetail {
  const record = getCaseRecord(caseId);
  if (!record) throw new Error('案例不存在');
  if (!isTeachingCaseEligible(caseId)) {
    throw new Error('该案例尚未通过复核，或教学授权已经撤销');
  }
  const snapshot = record.chartSnapshot;
  const patterns = detectPatterns(toZiweiChart(snapshot));
  const ming = snapshot.palaces.find(palace => palace.branch === snapshot.mingGongBranch);
  const mingStars = ming?.stars.filter(star => star.type === 'major').map(star => star.name) ?? [];
  const effectiveMingStars = mingStars.length ? mingStars : ming?.borrowedStars ?? [];
  const sihuaFacts = snapshot.palaces.flatMap(palace => palace.stars
    .filter(star => star.siHua)
    .map(star => `${star.name}化${star.siHua}落${palace.name}`));
  const events = record.events.map(stripEventIdentifiers);
  const evidence: CaseTeachingEvidence[] = [
    {
      id: 'chart-core',
      title: '命盘基础坐标',
      facts: [
        `${snapshot.wuxingJuName}`,
        `命宫位于${BRANCHES[snapshot.mingGongBranch]}宫`,
        `身宫位于${BRANCHES[snapshot.shenGongBranch]}宫`,
        effectiveMingStars.length ? `命宫主星：${effectiveMingStars.join('、')}${mingStars.length ? '' : '（空宫借对宫）'}` : '命宫为空宫，未识别到可借主星',
      ],
      source: 'anonymous_chart',
    },
    {
      id: 'sihua',
      title: '四化结构',
      facts: sihuaFacts.length ? sihuaFacts : ['匿名快照中未记录本命四化星曜'],
      source: 'anonymous_chart',
    },
    {
      id: 'patterns',
      title: '规则格局识别',
      facts: patterns.length
        ? patterns.map(pattern => `${pattern.name}：${pattern.conditions?.required.join('、') || '由格局引擎识别'}`)
        : ['当前严格规则未识别到命名格局，不等于命盘没有可分析结构'],
      source: 'pattern_engine',
    },
    {
      id: 'events',
      title: '匿名现实事件',
      facts: events.length
        ? events.map(event => `${event.ageBand ?? '年龄段未知'}：${LIFE_EVENT_CATEGORY_LABELS[event.category]}，影响级别 ${event.impactLevel}/5`)
        : ['本案例没有可用于回看验证的已确认匿名事件'],
      source: 'confirmed_events',
    },
  ];

  return {
    caseCode: record.caseCode,
    title: record.title,
    confidence: record.confidence,
    anonymizationVersion: record.anonymizationVersion,
    chartSnapshot: snapshot,
    patterns,
    events,
    evidence,
    studySteps: [
      '先确认命宫、身宫、五行局和命宫主星，不急于解释吉凶。',
      '再沿命宫三方四正检查星曜、四化、空宫和借对宫关系。',
      '展开格局成立条件，同时查看加分项与破格条件，避免只看格局名称。',
      '最后用匿名事件作回看练习，只讨论是否值得继续观察，不把个案当成普遍因果。',
    ],
    discussionQuestions: [
      `命宫位于${BRANCHES[snapshot.mingGongBranch]}宫时，三方四正应优先查看哪三个宫位？`,
      sihuaFacts.length ? `本案例的${sihuaFacts[0]}会怎样改变你对相关宫位的观察顺序？` : '缺少明确四化事实时，应如何限制解读范围？',
      patterns.length ? `${patterns[0].name}有哪些必须条件、加分条件或破格条件？` : '没有命名格局时，如何从宫位和星曜组合继续分析？',
      events.length ? '匿名事件与盘面结构之间哪些只是相关观察，哪些信息仍不足以支持结论？' : '没有现实事件佐证时，哪些结论应保持为待验证假设？',
    ],
    sourceSummary: `${sourceTypeLabel(record.sources[0]?.sourceType)}；资料可信度为${confidenceLabel(record.confidence)}；案例编号可用于回溯本地记录。`,
    boundaryNotice: '本页用于学习命盘结构与规则验证。单一案例不能证明普遍因果，传统解释应与现实资料分开记录，并保留不确定性。',
  };
}

function stripEventIdentifiers(event: CaseEventSnapshot): Omit<CaseEventSnapshot, 'id' | 'caseId' | 'createdAt'> {
  const { id: _id, caseId: _caseId, createdAt: _createdAt, ...safe } = event;
  return safe;
}

function sourceTypeLabel(type: string | undefined) {
  const labels: Record<string, string> = {
    local_chart: '本地命盘经脱敏确认生成', public_record: '公开资料整理',
    authorized_teaching: '明确授权的教学资料', historical_record: '历史资料整理',
  };
  return labels[type ?? ''] ?? '来源说明缺失';
}

function confidenceLabel(value: string) {
  return value === 'high' ? '较高' : value === 'low' ? '较低' : '中等';
}
