import type {
  CaseComparisonCategory,
  CaseComparisonDimension,
  CaseComparisonDimensionStatus,
  CaseComparisonEvidence,
  CaseComparisonMode,
  CaseComparisonResult,
  CaseComparisonSide,
  CaseEventSnapshot,
  CaseRecord,
} from './types';
import { LIFE_EVENT_CATEGORY_LABELS } from '@/lib/events/types';
import { detectPatterns } from '@/lib/ziwei/patterns';
import { toZiweiChart } from '@/lib/db/case-search';

export const CASE_COMPARISON_ENGINE_VERSION = 'case-comparison-v1';
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export function buildCaseComparisonResult(input: {
  mode: CaseComparisonMode;
  left: CaseRecord;
  right: CaseRecord;
  leftStageKey?: string | null;
  rightStageKey?: string | null;
  generatedAt?: number;
}): CaseComparisonResult {
  if (input.mode === 'daxian_to_daxian' && input.left.id !== input.right.id) {
    throw new Error('不同大限对比必须选择同一个匿名案例');
  }
  const generatedAt = input.generatedAt ?? Date.now();
  const result = input.mode === 'chart_to_chart'
    ? buildChartComparison(input.left, input.right)
    : buildDaXianComparison(
        input.left,
        input.leftStageKey,
        input.rightStageKey,
      );
  const counts = result.dimensions.reduce((sum, dimension) => {
    sum[dimension.status] += 1;
    return sum;
  }, { common: 0, different: 0, unavailable: 0 });
  return {
    schemaVersion: 1,
    engineVersion: CASE_COMPARISON_ENGINE_VERSION,
    mode: input.mode,
    left: result.left,
    right: result.right,
    dimensions: result.dimensions,
    counts,
    boundaryNotice: input.mode === 'chart_to_chart'
      ? '对比结果只描述两个匿名命盘的结构相同与差异，不代表相同结构会产生相同人生结果，也不用于判断关系好坏。'
      : '大限对比只描述同一匿名命盘两个阶段的结构变化。匿名事件仅按十岁年龄段粗略归入阶段，不能替代精确流年验证。',
    generatedAt,
  };
}

function buildChartComparison(left: CaseRecord, right: CaseRecord) {
  const leftSnapshot = left.chartSnapshot;
  const rightSnapshot = right.chartSnapshot;
  const leftSide = side(left);
  const rightSide = side(right);
  const dimensions: CaseComparisonDimension[] = [];
  dimensions.push(scalarDimension({
    id: 'core-ming-branch', category: 'core', title: '命宫位置',
    left: `${BRANCHES[leftSnapshot.mingGongBranch]}宫`, right: `${BRANCHES[rightSnapshot.mingGongBranch]}宫`,
    leftSide, rightSide, source: 'anonymous_chart', path: 'chart.mingGongBranch',
  }));
  dimensions.push(scalarDimension({
    id: 'core-shen-branch', category: 'core', title: '身宫位置',
    left: `${BRANCHES[leftSnapshot.shenGongBranch]}宫`, right: `${BRANCHES[rightSnapshot.shenGongBranch]}宫`,
    leftSide, rightSide, source: 'anonymous_chart', path: 'chart.shenGongBranch',
  }));
  dimensions.push(scalarDimension({
    id: 'core-wuxing-ju', category: 'core', title: '五行局',
    left: leftSnapshot.wuxingJuName, right: rightSnapshot.wuxingJuName,
    leftSide, rightSide, source: 'anonymous_chart', path: 'chart.wuxingJuName',
  }));
  dimensions.push(scalarDimension({
    id: 'core-time-confidence', category: 'core', title: '出生时辰可信状态',
    left: timeConfidenceLabel(leftSnapshot.profile.birthTimeConfidence),
    right: timeConfidenceLabel(rightSnapshot.profile.birthTimeConfidence),
    leftSide, rightSide, source: 'anonymous_chart', path: 'chart.profile.birthTimeConfidence',
  }));
  dimensions.push(setDimension({
    id: 'ming-major-stars', category: 'ming_structure', title: '命宫主星',
    left: effectiveMingStars(left), right: effectiveMingStars(right), leftSide, rightSide,
    source: 'anonymous_chart', path: 'chart.palaces[命宫].stars.major',
  }));
  dimensions.push(setDimension({
    id: 'ming-sanfang-stars', category: 'ming_structure', title: '命宫三方四正主星',
    left: sanFangMajorStars(left), right: sanFangMajorStars(right), leftSide, rightSide,
    source: 'anonymous_chart', path: 'chart.sanfang.majorStars',
  }));
  dimensions.push(setDimension({
    id: 'ming-empty-palaces', category: 'ming_structure', title: '空宫分布',
    left: emptyPalaces(left), right: emptyPalaces(right), leftSide, rightSide,
    source: 'anonymous_chart', path: 'chart.palaces.isEmpty', emptyMeansUnavailable: false,
  }));
  dimensions.push(setDimension({
    id: 'sihua-distribution', category: 'sihua', title: '本命四化落宫',
    left: sihuaDistribution(left), right: sihuaDistribution(right), leftSide, rightSide,
    source: 'anonymous_chart', path: 'chart.palaces.stars.siHua',
  }));
  dimensions.push(setDimension({
    id: 'pattern-names', category: 'pattern', title: '规则格局',
    left: patternNames(left), right: patternNames(right), leftSide, rightSide,
    source: 'pattern_engine', path: 'patternEngine.detectPatterns',
  }));
  dimensions.push(setDimension({
    id: 'event-categories', category: 'event', title: '已确认匿名事件类别',
    left: eventCategories(left.events), right: eventCategories(right.events), leftSide, rightSide,
    source: 'confirmed_events', path: 'case.events.category',
  }));
  return { left: leftSide, right: rightSide, dimensions };
}

function buildDaXianComparison(record: CaseRecord, leftKey?: string | null, rightKey?: string | null) {
  const leftIndex = parseDaXianKey(leftKey);
  const rightIndex = parseDaXianKey(rightKey);
  if (leftIndex === rightIndex) throw new Error('请选择两个不同的大限阶段');
  const leftStage = record.chartSnapshot.daXians[leftIndex];
  const rightStage = record.chartSnapshot.daXians[rightIndex];
  if (!leftStage || !rightStage) throw new Error('大限阶段不存在');
  const leftSide = side(record, `daxian:${leftIndex}`, daXianLabel(leftStage));
  const rightSide = side(record, `daxian:${rightIndex}`, daXianLabel(rightStage));
  const dimensions: CaseComparisonDimension[] = [];
  dimensions.push(scalarDimension({
    id: 'daxian-age-range', category: 'daxian', title: '大限年龄范围',
    left: `${leftStage.startAge}-${leftStage.endAge}岁`, right: `${rightStage.startAge}-${rightStage.endAge}岁`,
    leftSide, rightSide, source: 'daxian_snapshot', path: 'chart.daXians.ageRange',
  }));
  dimensions.push(scalarDimension({
    id: 'daxian-palace', category: 'daxian', title: '大限所在宫位',
    left: `${leftStage.palaceName}（${BRANCHES[leftStage.palaceBranch]}宫）`,
    right: `${rightStage.palaceName}（${BRANCHES[rightStage.palaceBranch]}宫）`,
    leftSide, rightSide, source: 'daxian_snapshot', path: 'chart.daXians.palace',
  }));
  dimensions.push(scalarDimension({
    id: 'daxian-stem', category: 'daxian', title: '大限宫干',
    left: leftStage.stemName ?? '', right: rightStage.stemName ?? '',
    leftSide, rightSide, source: 'daxian_snapshot', path: 'chart.daXians.stemName',
  }));
  dimensions.push(setDimension({
    id: 'daxian-sihua', category: 'sihua', title: '大限四化',
    left: daXianSiHua(leftStage.siHua), right: daXianSiHua(rightStage.siHua), leftSide, rightSide,
    source: 'daxian_snapshot', path: 'chart.daXians.siHua',
  }));
  dimensions.push(setDimension({
    id: 'daxian-palace-stars', category: 'ming_structure', title: '大限宫本命星曜',
    left: palaceStars(record, leftStage.palaceBranch), right: palaceStars(record, rightStage.palaceBranch), leftSide, rightSide,
    source: 'anonymous_chart', path: 'chart.palaces[大限宫].stars',
  }));
  dimensions.push(setDimension({
    id: 'daxian-core-relation', category: 'daxian', title: '与命宫、身宫的结构关系',
    left: coreRelations(record, leftStage.palaceBranch), right: coreRelations(record, rightStage.palaceBranch), leftSide, rightSide,
    source: 'anonymous_chart', path: 'chart.mingGongBranch|shenGongBranch', emptyMeansUnavailable: false,
  }));
  dimensions.push(setDimension({
    id: 'daxian-events', category: 'event', title: '年龄段内匿名事件类别',
    left: stageEventCategories(record.events, leftStage.startAge, leftStage.endAge),
    right: stageEventCategories(record.events, rightStage.startAge, rightStage.endAge),
    leftSide, rightSide, source: 'confirmed_events', path: 'case.events.ageBand',
  }));
  return { left: leftSide, right: rightSide, dimensions };
}

function scalarDimension(input: {
  id: string; category: CaseComparisonCategory; title: string;
  left: string; right: string; leftSide: CaseComparisonSide; rightSide: CaseComparisonSide;
  source: CaseComparisonEvidence['source']; path: string;
}): CaseComparisonDimension {
  const status: CaseComparisonDimensionStatus = !input.left || !input.right
    ? 'unavailable'
    : input.left === input.right ? 'common' : 'different';
  return {
    id: input.id, category: input.category, title: input.title, status,
    leftValue: input.left || '资料不足', rightValue: input.right || '资料不足',
    summary: status === 'common' ? `两侧记录一致：${input.left}` : status === 'different' ? '两侧结构记录不同。' : '至少一侧缺少必要的匿名结构信息。',
    evidence: evidencePair(input.leftSide, input.rightSide, input.source, input.path, input.left, input.right),
  };
}

function setDimension(input: {
  id: string; category: CaseComparisonCategory; title: string;
  left: string[]; right: string[]; leftSide: CaseComparisonSide; rightSide: CaseComparisonSide;
  source: CaseComparisonEvidence['source']; path: string; emptyMeansUnavailable?: boolean;
}): CaseComparisonDimension {
  const left = uniqueSorted(input.left);
  const right = uniqueSorted(input.right);
  const emptyMeansUnavailable = input.emptyMeansUnavailable !== false;
  const status: CaseComparisonDimensionStatus = emptyMeansUnavailable && (!left.length || !right.length)
    ? 'unavailable'
    : arraysEqual(left, right) ? 'common' : 'different';
  const common = left.filter(value => right.includes(value));
  const leftOnly = left.filter(value => !right.includes(value));
  const rightOnly = right.filter(value => !left.includes(value));
  const summary = status === 'unavailable'
    ? '至少一侧没有足够的匿名记录，暂不比较。'
    : status === 'common'
      ? left.length ? `两侧集合一致：${left.join('、')}` : '两侧均未记录此类结构。'
      : [
          common.length ? `共同：${common.join('、')}` : '',
          leftOnly.length ? `左侧独有：${leftOnly.join('、')}` : '',
          rightOnly.length ? `右侧独有：${rightOnly.join('、')}` : '',
        ].filter(Boolean).join('；') || '两侧结构集合不同。';
  return {
    id: input.id, category: input.category, title: input.title, status,
    leftValue: left.length ? left.join('、') : '无可用记录',
    rightValue: right.length ? right.join('、') : '无可用记录',
    summary,
    evidence: evidencePair(input.leftSide, input.rightSide, input.source, input.path, left.join('、'), right.join('、')),
  };
}

function side(record: CaseRecord, stageKey: string | null = null, stageLabel: string | null = null): CaseComparisonSide {
  return { caseId: record.id, caseCode: record.caseCode, title: record.title, stageKey, stageLabel };
}

function evidencePair(left: CaseComparisonSide, right: CaseComparisonSide, source: CaseComparisonEvidence['source'], path: string, leftValue: string, rightValue: string): CaseComparisonEvidence[] {
  return [
    { side: 'left', caseCode: left.caseCode, source, path, value: leftValue || '缺失' },
    { side: 'right', caseCode: right.caseCode, source, path, value: rightValue || '缺失' },
  ];
}

function effectiveMingStars(record: CaseRecord): string[] {
  const ming = record.chartSnapshot.palaces.find(palace => palace.branch === record.chartSnapshot.mingGongBranch);
  const stars = ming?.stars.filter(star => star.type === 'major').map(star => star.name) ?? [];
  return stars.length ? stars : ming?.borrowedStars ?? [];
}

function sanFangMajorStars(record: CaseRecord): string[] {
  const ming = record.chartSnapshot.mingGongBranch;
  const branches = [ming, (ming + 4) % 12, (ming + 8) % 12, (ming + 6) % 12];
  return record.chartSnapshot.palaces
    .filter(palace => branches.includes(palace.branch))
    .flatMap(palace => palace.stars.filter(star => star.type === 'major').map(star => `${palace.name}:${star.name}`));
}

function emptyPalaces(record: CaseRecord): string[] {
  return record.chartSnapshot.palaces.filter(palace => palace.isEmpty).map(palace => `${palace.name}（${BRANCHES[palace.branch]}）`);
}

function sihuaDistribution(record: CaseRecord): string[] {
  return record.chartSnapshot.palaces.flatMap(palace => palace.stars
    .filter(star => star.siHua)
    .map(star => `${star.name}化${star.siHua}@${palace.name}`));
}

function patternNames(record: CaseRecord): string[] {
  return detectPatterns(toZiweiChart(record.chartSnapshot)).map(pattern => pattern.name);
}

function eventCategories(events: CaseEventSnapshot[]): string[] {
  return events.map(event => LIFE_EVENT_CATEGORY_LABELS[event.category]);
}

function palaceStars(record: CaseRecord, branch: number): string[] {
  const palace = record.chartSnapshot.palaces.find(item => item.branch === branch);
  if (!palace) return [];
  return palace.stars.map(star => `${star.name}${star.siHua ? `化${star.siHua}` : ''}`);
}

function coreRelations(record: CaseRecord, branch: number): string[] {
  const relations: string[] = [];
  if (branch === record.chartSnapshot.mingGongBranch) relations.push('与命宫同宫');
  if (branch === record.chartSnapshot.shenGongBranch) relations.push('与身宫同宫');
  if ((branch + 6) % 12 === record.chartSnapshot.mingGongBranch) relations.push('位于命宫对宫');
  return relations.length ? relations : ['非命宫、身宫或命宫对宫'];
}

function daXianSiHua(value: CaseRecord['chartSnapshot']['daXians'][number]['siHua']): string[] {
  if (!value) return [];
  return [`${value.lu}化禄`, `${value.quan}化权`, `${value.ke}化科`, `${value.ji}化忌`];
}

function stageEventCategories(events: CaseEventSnapshot[], startAge: number, endAge: number): string[] {
  return events.filter(event => {
    const range = parseAgeBand(event.ageBand);
    return range ? range.start <= endAge && range.end >= startAge : false;
  }).map(event => LIFE_EVENT_CATEGORY_LABELS[event.category]);
}

function parseAgeBand(value: string | null): { start: number; end: number } | null {
  const match = value?.match(/^(\d+)-(\d+)岁$/);
  return match ? { start: Number(match[1]), end: Number(match[2]) } : null;
}

function parseDaXianKey(value?: string | null): number {
  const match = value?.match(/^daxian:(\d+)$/);
  if (!match) throw new Error('请选择有效的大限阶段');
  return Number(match[1]);
}

function daXianLabel(value: CaseRecord['chartSnapshot']['daXians'][number]): string {
  return `${value.startAge}-${value.endAge}岁 · ${value.palaceName}`;
}

function timeConfidenceLabel(value: 'known' | 'unknown'): string {
  return value === 'known' ? '时辰已知' : '时辰未知';
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
