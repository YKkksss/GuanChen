import { BRANCHES } from '@/lib/ziwei/constants';
import type { Conversation } from '@/lib/conversations/types';
import type { Palace, ZiweiChart } from '@/lib/ziwei/types';
import type {
  LearningOpenCommonErrorRule,
  LearningOpenEvidencePoint,
  LearningOpenExercise,
  LearningOpenExerciseTemplateId,
  LearningOpenExerciseTemplateSummary,
  LearningOpenGrade,
  LearningOpenRubricCriterion,
} from './types';

export const LEARNING_OPEN_RUBRIC_VERSION = 'learning-open-rubric-v1';
export const LEARNING_OPEN_PROMPT_VERSION = 'learning-open-feedback-v1';

const TEMPLATE_SUMMARIES: LearningOpenExerciseTemplateSummary[] = [
  {
    id: 'ming-structure',
    title: '命宫核心结构说明',
    description: '训练从命身位置、主星、三方四正、本命四化到解释边界的完整表达。',
    estimatedMinutes: 18,
  },
  {
    id: 'sanfang-synthesis',
    title: '命宫三方四正综合',
    description: '训练把本宫、对宫和两个三合宫组织为可复核的四宫结构，而不是孤立断星。',
    estimatedMinutes: 20,
  },
  {
    id: 'analysis-boundary',
    title: '事实、解释与现实边界',
    description: '训练区分程序盘面事实、传统解释和需要现实验证的推断。',
    estimatedMinutes: 15,
  },
];

const COMMON_ERRORS: LearningOpenCommonErrorRule[] = [
  { id: 'wrong-ming-location', title: '命宫位置写错', description: '把命宫地支写成当前命盘中的其他地支。', deduction: 15 },
  { id: 'wrong-shen-location', title: '身宫位置写错', description: '把身宫地支写成当前命盘中的其他地支。', deduction: 10 },
  { id: 'absolute-claim', title: '使用绝对化结论', description: '使用“必然、注定、百分百、一定会”等不可复核的绝对措辞。', deduction: 8 },
  { id: 'answer-too-short', title: '答案过短', description: '少于 120 个字符时，通常无法完成结构化论证。', deduction: 10 },
];

export function listOpenPracticeTemplates(): LearningOpenExerciseTemplateSummary[] {
  return TEMPLATE_SUMMARIES.map(item => ({ ...item }));
}

export function buildOpenPracticeExercise(
  conversation: Conversation,
  templateId: LearningOpenExerciseTemplateId,
): LearningOpenExercise {
  if (conversation.type !== 'chart' || !conversation.chartSnapshot) throw new Error('单人命盘会话不存在');
  const template = TEMPLATE_SUMMARIES.find(item => item.id === templateId);
  if (!template) throw new Error('开放式练习类型不存在');
  const chart = conversation.chartSnapshot;
  const facts = buildFactGroups(chart);
  const configuration = buildTemplateConfiguration(templateId, facts);
  const evidencePoints = uniquePoints(configuration.rubric.flatMap(item => item.points));

  return {
    schemaVersion: 1,
    id: `open:${templateId}:${conversation.id}`,
    templateId,
    title: `${conversation.title} · ${template.title}`,
    description: template.description,
    prompt: configuration.prompt,
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    estimatedMinutes: template.estimatedMinutes,
    recommendedLength: configuration.recommendedLength,
    passScore: 75,
    rubricVersion: LEARNING_OPEN_RUBRIC_VERSION,
    promptVersion: LEARNING_OPEN_PROMPT_VERSION,
    evidencePoints,
    rubric: configuration.rubric.map(item => ({
      id: item.id,
      title: item.title,
      description: item.description,
      maxScore: item.maxScore,
      evidencePointIds: item.points.map(point => point.id),
      knowledgePointIds: item.knowledgePointIds,
    })),
    commonErrors: COMMON_ERRORS,
    sourceIds: ['project:chart-engine', 'project:chart-types', 'classic:gusuifu:reading-order', 'classic:gusuifu:sanfang', 'method:learning-boundary'],
    boundary: '程序只根据保存的命盘快照和公开评分量表计分；AI 只能解释已确定的得分、遗漏与表达改进，不能重新排盘或修改分数。',
  };
}

export function gradeOpenPracticeAnswer(exercise: LearningOpenExercise, answer: string): LearningOpenGrade {
  const normalizedAnswer = normalizeText(answer);
  const covered = new Set(
    exercise.evidencePoints
      .filter(point => point.acceptedExpressions.some(expression => normalizedAnswer.includes(normalizeText(expression))))
      .map(point => point.id),
  );
  const criteria = exercise.rubric.map(criterion => gradeCriterion(criterion, covered));
  const rawScore = criteria.reduce((sum, item) => sum + item.score, 0);
  const detectedIssues = detectIssues(exercise, answer, normalizedAnswer);
  const score = Math.max(0, rawScore - detectedIssues.reduce((sum, issue) => sum + issue.deduction, 0));
  const allPointIds = exercise.evidencePoints.map(point => point.id);
  return {
    score,
    rawScore,
    passScore: exercise.passScore,
    passed: score >= exercise.passScore,
    wordCount: countCharacters(answer),
    criteria,
    detectedIssues,
    coveredEvidencePointIds: allPointIds.filter(id => covered.has(id)),
    missingEvidencePointIds: allPointIds.filter(id => !covered.has(id)),
  };
}

interface FactGroups {
  locations: LearningOpenEvidencePoint[];
  mingStars: LearningOpenEvidencePoint[];
  relationLocations: LearningOpenEvidencePoint[];
  relationStars: LearningOpenEvidencePoint[];
  transformations: LearningOpenEvidencePoint[];
  method: LearningOpenEvidencePoint[];
  boundary: LearningOpenEvidencePoint[];
}

interface RubricDraft extends Omit<LearningOpenRubricCriterion, 'evidencePointIds'> {
  points: LearningOpenEvidencePoint[];
}

function buildFactGroups(chart: ZiweiChart): FactGroups {
  const ming = findPalace(chart, chart.mingGongBranch);
  const shen = findPalace(chart, chart.shenGongBranch);
  const relationBranches = [chart.mingGongBranch, (chart.mingGongBranch + 6) % 12, (chart.mingGongBranch + 4) % 12, (chart.mingGongBranch + 8) % 12];
  const relationPalaces = relationBranches.map(branch => findPalace(chart, branch));
  const mingMajorStars = ming.stars.filter(star => star.type === 'major');
  const locations = [
    point('ming-location', '命宫位置', `命宫位于${BRANCHES[ming.branch]}宫。`, [`命宫在${BRANCHES[ming.branch]}`, `命宫位于${BRANCHES[ming.branch]}`, `命宫坐${BRANCHES[ming.branch]}`, `${BRANCHES[ming.branch]}宫为命宫`], ['project:chart-engine']),
    point('shen-location', '身宫位置', `身宫位于${BRANCHES[shen.branch]}宫，对应${palaceDisplayName(shen.name)}。`, [`身宫在${BRANCHES[shen.branch]}`, `身宫位于${BRANCHES[shen.branch]}`, `身宫坐${BRANCHES[shen.branch]}`, `${BRANCHES[shen.branch]}宫为身宫`, `身宫在${palaceDisplayName(shen.name)}`], ['project:chart-engine']),
  ];
  const mingStars = mingMajorStars.length
    ? mingMajorStars.map(star => point(`ming-star-${star.name}`, `命宫主星：${star.name}`, `命宫主星包含${star.name}。`, [`命宫${star.name}`, `命宫有${star.name}`, `命宫主星${star.name}`, `${star.name}坐命`, `${star.name}入命`], ['project:chart-types']))
    : [
        point('ming-empty', '命宫为空宫', '命宫没有主星，应明确记录为空宫。', ['命宫为空宫', '命宫无主星', '命宫没有主星'], ['project:chart-types']),
        ...(ming.borrowedStars ?? []).map(star => point(`ming-borrowed-${star}`, `借对宫主星：${star}`, `命宫借读对宫的${star}，但不改写为本宫原生主星。`, [`命宫借${star}`, `借对宫${star}`, `借星${star}`], ['project:chart-engine', 'classic:gusuifu:empty-palace'])),
      ];
  const relationLocations = relationPalaces.map((palace, index) => {
    const relation = index === 0 ? '本宫' : index === 1 ? '对宫' : `三合宫${index - 1}`;
    const palaceName = palaceDisplayName(palace.name);
    return point(`relation-location-${palace.branch}`, `${relation}：${palaceName}（${BRANCHES[palace.branch]}）`, `${relation}为${palaceName}，位于${BRANCHES[palace.branch]}宫。`, [`${relation}${palaceName}`, `${palaceName}${BRANCHES[palace.branch]}宫`, `${palaceName}在${BRANCHES[palace.branch]}`, `${BRANCHES[palace.branch]}宫${palaceName}`], ['project:chart-engine', 'classic:gusuifu:sanfang']);
  });
  const relationStars = relationPalaces.flatMap(palace => {
    if (palace.branch === ming.branch) return mingStars;
    const palaceName = palaceDisplayName(palace.name);
    const stars = palace.stars.filter(star => star.type === 'major');
    if (!stars.length) return [point(`relation-empty-${palace.branch}`, `${palaceName}为空宫`, `${palaceName}没有主星。`, [`${palaceName}为空宫`, `${palaceName}无主星`, `${palaceName}没有主星`], ['project:chart-types'])];
    return stars.map(star => point(`relation-star-${palace.branch}-${star.name}`, `${palaceName}主星：${star.name}`, `${star.name}位于${palaceName}。`, [`${palaceName}${star.name}`, `${star.name}在${palaceName}`, `${palaceName}主星${star.name}`], ['project:chart-types']));
  });
  const natalTransformations = relationPalaces.flatMap(palace => palace.stars.filter(star => star.siHua).map(star => ({ palace, star })));
  const transformations = natalTransformations.length
    ? natalTransformations.map(({ palace, star }) => {
        const palaceName = palaceDisplayName(palace.name);
        return point(`sihua-${palace.branch}-${star.name}-${star.siHua}`, `${palaceName}：${star.name}化${star.siHua}`, `${star.name}在${palaceName}发生本命化${star.siHua}。`, [`${star.name}化${star.siHua}`, `${palaceName}${star.name}化${star.siHua}`, `本命${star.name}化${star.siHua}`], ['project:chart-types']);
      })
    : [point('sihua-none', '三方四正未见本命四化标记', '当前命盘快照的命宫三方四正未记录本命四化标记。', ['三方四正无本命四化', '三方四正未见本命四化', '没有本命四化标记'], ['project:chart-types'])];
  const method = [
    point('method-four-palaces', '四宫结构', '三方四正由本宫、对宫和两个三合宫组成。', ['本宫对宫两个三合宫', '本宫、对宫、两个三合宫', '三方四正四宫'], ['classic:gusuifu:sanfang']),
    point('method-natal-layer', '本命层级', '本题只处理本命层，不能拿大限或流年覆盖本命事实。', ['本命层', '本命基础', '本命结构'], ['method:learning-boundary']),
  ];
  const boundary = [
    point('boundary-program-fact', '程序盘面事实', '宫位、星曜和四化来自保存的程序命盘快照。', ['程序事实', '盘面事实', '命盘快照', '排盘事实'], ['project:chart-engine', 'project:chart-types']),
    point('boundary-traditional', '传统解释', '传统含义属于解释层，不等于已经发生的现实事件。', ['传统解释', '传统含义', '命理解释'], ['method:learning-boundary']),
    point('boundary-reality', '现实验证', '现实经历需要用户确认或继续观察，不能由盘面直接编造。', ['现实验证', '结合现实', '现实情况', '用户确认'], ['method:learning-boundary']),
    point('boundary-cautious', '谨慎表达', '使用“可能、倾向、可观察”等非绝对表达。', ['可能', '倾向', '可观察', '作为参考', '不构成必然'], ['method:learning-boundary']),
  ];
  return { locations, mingStars, relationLocations, relationStars, transformations, method, boundary };
}

function buildTemplateConfiguration(templateId: LearningOpenExerciseTemplateId, facts: FactGroups): { prompt: string; recommendedLength: string; rubric: RubricDraft[] } {
  if (templateId === 'ming-structure') {
    return {
      prompt: '请根据下方程序盘面事实，完成一份命宫核心结构说明。依次交代命宫与身宫位置、命宫主星或空宫来源、命宫三方四正、本命四化，并在结尾区分盘面事实、传统解释和需要现实验证的部分。',
      recommendedLength: '建议 300—800 字',
      rubric: [
        rubric('location', '命身位置', '准确交代命宫和身宫的位置事实。', 15, facts.locations, ['chart-ming-shen']),
        rubric('ming-stars', '命宫星曜', '识别命宫主星；空宫时说明空宫和借星来源。', 25, facts.mingStars, ['chart-stars', 'chart-empty-palace']),
        rubric('sanfang', '三方四正', '完整识别四宫位置及主要星曜结构。', 30, [...facts.relationLocations, ...facts.relationStars], ['chart-sanfang', 'chart-stars']),
        rubric('sihua', '本命四化', '记录三方四正内的本命四化或明确未见标记。', 15, facts.transformations, ['chart-sihua']),
        rubric('boundary', '层级与边界', '说明本命层级，并区分程序事实、传统解释与现实验证。', 15, [...facts.method.slice(1), ...facts.boundary], ['chart-levels']),
      ],
    };
  }
  if (templateId === 'sanfang-synthesis') {
    return {
      prompt: '请围绕命宫三方四正写一份结构化分析。先列明本宫、对宫和两个三合宫，再整理各宫主星与本命四化，最后说明你会如何综合观察这些关系，并明确本题只处理本命层。',
      recommendedLength: '建议 350—900 字',
      rubric: [
        rubric('relation-location', '四宫定位', '准确交代本宫、对宫和两个三合宫。', 20, facts.relationLocations, ['chart-sanfang']),
        rubric('relation-stars', '四宫星曜', '识别四宫中的主星或空宫状态。', 35, facts.relationStars, ['chart-stars', 'chart-empty-palace']),
        rubric('relation-sihua', '四化检查', '记录四宫范围内的本命四化或明确未见标记。', 20, facts.transformations, ['chart-sihua']),
        rubric('relation-method', '综合方法', '说明四宫关系和本命层级，不进行孤立单星判断。', 15, facts.method, ['chart-sanfang', 'chart-levels']),
        rubric('relation-boundary', '解释边界', '保留现实验证和非绝对表达。', 10, facts.boundary, ['chart-levels']),
      ],
    };
  }
  return {
    prompt: '请用当前命盘举例说明“盘面事实、传统解释、现实验证”三者的区别。至少引用命宫位置、命宫星曜和三方四正中的具体事实，再示范如何把传统含义写成谨慎、可验证且不绝对化的表达。',
    recommendedLength: '建议 250—700 字',
    rubric: [
      rubric('boundary-facts', '盘面事实', '引用当前命盘的命身位置和命宫星曜事实。', 35, [...facts.locations, ...facts.mingStars], ['chart-ming-shen', 'chart-stars']),
      rubric('boundary-structure', '结构方法', '引用三方四正并明确本命层级。', 25, [...facts.relationLocations, ...facts.method], ['chart-sanfang', 'chart-levels']),
      rubric('boundary-layers', '三层区分', '明确区分程序盘面事实、传统解释和现实验证。', 25, facts.boundary.slice(0, 3), ['chart-levels']),
      rubric('boundary-language', '谨慎表达', '采用可能、倾向、继续观察等非绝对措辞。', 15, facts.boundary.slice(3), ['chart-levels']),
    ],
  };
}

function gradeCriterion(criterion: LearningOpenRubricCriterion, covered: Set<string>) {
  const coveredEvidencePointIds = criterion.evidencePointIds.filter(id => covered.has(id));
  const missingEvidencePointIds = criterion.evidencePointIds.filter(id => !covered.has(id));
  const score = criterion.evidencePointIds.length
    ? Math.round(criterion.maxScore * coveredEvidencePointIds.length / criterion.evidencePointIds.length)
    : criterion.maxScore;
  return { criterionId: criterion.id, title: criterion.title, score, maxScore: criterion.maxScore, coveredEvidencePointIds, missingEvidencePointIds };
}

function detectIssues(exercise: LearningOpenExercise, answer: string, normalizedAnswer: string) {
  const chartLocation = exercise.evidencePoints.find(point => point.id === 'ming-location')?.fact.match(/命宫位于(.)宫/)?.[1];
  const shenLocation = exercise.evidencePoints.find(point => point.id === 'shen-location')?.fact.match(/身宫位于(.)宫/)?.[1];
  const issues = [] as LearningOpenGrade['detectedIssues'];
  const wrongMing = BRANCHES.find(branch => branch !== chartLocation && new RegExp(`命宫(?:位于|在|坐|落在)${branch}`).test(normalizedAnswer));
  if (wrongMing) issues.push(issue(exercise, 'wrong-ming-location', `答案写到命宫位于${wrongMing}宫，与保存快照不一致。`));
  const wrongShen = BRANCHES.find(branch => branch !== shenLocation && new RegExp(`身宫(?:位于|在|坐|落在)${branch}`).test(normalizedAnswer));
  if (wrongShen) issues.push(issue(exercise, 'wrong-shen-location', `答案写到身宫位于${wrongShen}宫，与保存快照不一致。`));
  if (containsUnqualifiedAbsoluteClaim(normalizedAnswer)) issues.push(issue(exercise, 'absolute-claim', '答案出现未被否定的绝对化措辞。'));
  if (countCharacters(answer) < 120) issues.push(issue(exercise, 'answer-too-short', `当前有效字符约 ${countCharacters(answer)} 个，尚不足以覆盖完整结构。`));
  return issues;
}

function containsUnqualifiedAbsoluteClaim(value: string): boolean {
  for (const term of ['必然', '注定', '百分百', '一定会', '绝对会']) {
    let index = value.indexOf(term);
    while (index >= 0) {
      const prefix = value.slice(Math.max(0, index - 3), index);
      if (!/(不|非|并非|不能|不是)$/.test(prefix)) return true;
      index = value.indexOf(term, index + term.length);
    }
  }
  return false;
}

function issue(exercise: LearningOpenExercise, ruleId: string, detail: string) {
  const rule = exercise.commonErrors.find(item => item.id === ruleId)!;
  return { ruleId, title: rule.title, detail, deduction: rule.deduction };
}

function point(id: string, label: string, fact: string, acceptedExpressions: string[], sourceIds: string[]): LearningOpenEvidencePoint {
  return { id, label, fact, acceptedExpressions, sourceIds };
}

function rubric(id: string, title: string, description: string, maxScore: number, points: LearningOpenEvidencePoint[], knowledgePointIds: string[]): RubricDraft {
  return { id, title, description, maxScore, points, knowledgePointIds };
}

function uniquePoints(points: LearningOpenEvidencePoint[]) {
  return [...new Map(points.map(item => [item.id, item])).values()];
}

function findPalace(chart: ZiweiChart, branch: number): Palace {
  const palace = chart.palaces.find(item => item.branch === branch);
  if (!palace) throw new Error(`命盘缺少${BRANCHES[branch]}宫数据`);
  return palace;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

function countCharacters(value: string) {
  return value.replace(/\s+/g, '').length;
}

function palaceDisplayName(name: string) {
  return name.endsWith('宫') ? name : `${name}宫`;
}
