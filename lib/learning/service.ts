import { BRANCHES, STEMS } from '@/lib/ziwei/constants';
import type { Palace, ZiweiChart } from '@/lib/ziwei/types';
import {
  LEARNING_KNOWLEDGE_POINTS,
  LEARNING_KNOWLEDGE_VERSION,
  LEARNING_METHODOLOGY_VERSION,
  LEARNING_SOURCES,
} from './catalog';
import type { LearningLessonStep, LearningPalaceLesson, LearningRelationPalace } from './types';

export const LEARNING_NOTE_KNOWLEDGE_POINT = 'chart-palace-reading';

export function buildPalaceLearningLesson(chart: ZiweiChart, branch: number): LearningPalaceLesson {
  if (!Number.isInteger(branch) || branch < 0 || branch > 11) throw new Error('宫位地支必须在 0 到 11 之间');
  const palace = findPalace(chart, branch);
  const oppositeBranch = (branch + 6) % 12;
  const trineBranches = [(branch + 4) % 12, (branch + 8) % 12];
  const relationBranches = [branch, oppositeBranch, ...trineBranches];
  const relations: LearningRelationPalace[] = relationBranches.map((item, index) => {
    const related = findPalace(chart, item);
    return {
      relation: index === 0 ? 'self' : index === 1 ? 'opposite' : 'trine',
      branch: item,
      branchName: BRANCHES[item],
      palaceName: normalizePalaceName(related.name),
    };
  });
  const majorStars = palace.stars.filter(star => star.type === 'major');
  const luckyStars = palace.stars.filter(star => star.type === 'lucky' || star.type === 'minor');
  const shaStars = palace.stars.filter(star => star.type === 'sha');
  const natalTransformations = palace.stars
    .filter(star => Boolean(star.siHua))
    .map(star => ({ starName: star.name, type: star.siHua! }));
  const borrowedFrom = palace.isEmpty && typeof palace.borrowedFromBranch === 'number'
    ? {
      branch: palace.borrowedFromBranch,
      palaceName: normalizePalaceName(palace.borrowedFromName ?? findPalace(chart, palace.borrowedFromBranch).name),
      stars: palace.borrowedStars ?? [],
    }
    : null;
  const steps: LearningLessonStep[] = [
    step(1, 'locate', '第一步：确定本宫',
      `${normalizePalaceName(palace.name)}位于${STEMS[palace.stem]}${BRANCHES[palace.branch]}。`,
      '先确认正在分析的生活主题和地支位置，再读取星曜。', ['chart-palace'], ['project:chart-engine'], [branch]),
    step(2, 'ming-shen', '第二步：识别命宫与身宫',
      palace.isMingGong && palace.isShenGong ? '当前宫同时是命宫与身宫。' : palace.isMingGong ? '当前宫是命宫，不是身宫。' : palace.isShenGong ? '当前宫是身宫，不是命宫。' : `命宫在${BRANCHES[chart.mingGongBranch]}，身宫在${BRANCHES[chart.shenGongBranch]}；当前宫不是命宫或身宫。`,
      '命宫和身宫是位置事实；先标记，再进入传统解释。', ['chart-ming-shen'], ['project:chart-types', 'classic:gusuifu:reading-order'], [chart.mingGongBranch, chart.shenGongBranch]),
    step(3, 'stars', '第三步：分层读取星曜',
      `主星：${names(majorStars.map(item => item.name), '无主星')}；辅星：${names(luckyStars.map(item => item.name), '无')}；煞星：${names(shaStars.map(item => item.name), '无')}。`,
      '先主星、再辅煞，只记录命盘中实际存在的星曜，不由文字模型补全。', ['chart-stars'], ['project:chart-types'], [branch]),
    step(4, 'relations', '第四步：建立三方四正',
      `本宫为${normalizePalaceName(palace.name)}，对宫为${relationName(relations, 'opposite')}，两个三合宫为${relations.filter(item => item.relation === 'trine').map(item => `${item.palaceName}（${item.branchName}）`).join('、')}。`,
      '三方四正是本宫、对宫和两个三合宫组成的四宫结构；当前命盘已经用连线高亮。', ['chart-sanfang'], ['project:chart-engine', 'classic:gusuifu:sanfang'], relationBranches),
    step(5, 'sihua', '第五步：检查本命四化',
      natalTransformations.length ? `当前宫本命四化：${natalTransformations.map(item => `${item.starName}化${item.type}`).join('、')}。` : '当前宫没有标记本命四化。',
      '这里只读取本命四化。大限和流年四化属于后续时间层，不能混写。', ['chart-sihua', 'chart-levels'], ['project:chart-types', 'method:learning-boundary'], [branch]),
    step(6, 'empty-palace', '第六步：处理空宫',
      borrowedFrom ? `当前宫为空宫，程序记录借${borrowedFrom.palaceName}的主星：${names(borrowedFrom.stars, '对宫也无主星')}。` : '当前宫不是空宫，无需执行借对宫步骤。',
      borrowedFrom ? '借星用于观察结构，但必须保留“借自对宫”的标记，不能写成本宫原生星曜。' : '非空宫仍然需要查看对宫和三合宫，不能只读本宫。', ['chart-empty-palace'], ['project:chart-engine', 'classic:gusuifu:empty-palace'], borrowedFrom ? [branch, borrowedFrom.branch] : [branch]),
    step(7, 'boundary', '第七步：确认分析边界',
      '当前页面展示的是本命命盘结构事实，没有加入大限、流年或现实经历。',
      '完成结构识别后才能进入解释；传统解释用于学习和自我观察，不等于现实事实或确定预测。', ['chart-levels'], ['method:learning-boundary'], [branch]),
  ];
  const pointIds = new Set(steps.flatMap(item => item.knowledgePointIds));
  const sourceIds = new Set(steps.flatMap(item => item.sourceIds));
  return {
    schemaVersion: 1,
    methodologyVersion: LEARNING_METHODOLOGY_VERSION,
    knowledgeVersion: LEARNING_KNOWLEDGE_VERSION,
    title: `${normalizePalaceName(palace.name)}结构讲解`,
    facts: {
      branch, branchName: BRANCHES[branch], stemName: STEMS[palace.stem], palaceName: normalizePalaceName(palace.name),
      isMingGong: Boolean(palace.isMingGong), isShenGong: Boolean(palace.isShenGong), isEmpty: Boolean(palace.isEmpty),
      majorStars, luckyStars, shaStars, natalTransformations, borrowedFrom, relations,
    },
    steps,
    knowledgePoints: LEARNING_KNOWLEDGE_POINTS.filter(item => pointIds.has(item.id)),
    sources: LEARNING_SOURCES.filter(item => sourceIds.has(item.id)),
    boundary: '本页先教授如何识别命盘结构，不根据单一宫位或星曜作吉凶断言；传统文化内容仅供学习与个人反思。',
  };
}

function findPalace(chart: ZiweiChart, branch: number): Palace {
  const palace = chart.palaces.find(item => item.branch === branch);
  if (!palace) throw new Error(`命盘缺少${BRANCHES[branch]}宫数据`);
  return palace;
}
function normalizePalaceName(name: string): string { return name.endsWith('宫') ? name : `${name}宫`; }
function names(items: string[], fallback: string): string { return items.length ? items.join('、') : fallback; }
function relationName(items: LearningRelationPalace[], relation: LearningRelationPalace['relation']): string {
  const item = items.find(entry => entry.relation === relation);
  return item ? `${item.palaceName}（${item.branchName}）` : '未知';
}
function step(order: number, key: string, title: string, fact: string, teaching: string, knowledgePointIds: string[], sourceIds: string[], relatedBranches: number[]): LearningLessonStep {
  return { order, key, title, fact, teaching, knowledgePointIds, sourceIds, relatedBranches };
}
