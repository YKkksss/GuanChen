import { BRANCHES } from '@/lib/ziwei/constants';
import type { Conversation } from '@/lib/conversations/types';
import type { Palace } from '@/lib/ziwei/types';
import { LEARNING_KNOWLEDGE_VERSION, LEARNING_METHODOLOGY_VERSION } from './catalog';
import type { LearningPracticeSet, LearningQuizQuestion } from './types';

export const LEARNING_PRACTICE_VERSION = 'learning-practice-v1';

export const FOUNDATION_REVIEW_PRACTICE: LearningPracticeSet = {
  schemaVersion: 1,
  id: 'foundation-review',
  kind: 'foundation_review',
  title: '命盘结构跨章节复习',
  description: '把七章知识点放到同一组题目中，检查能否保持先事实、后结构、再分层的读盘顺序。',
  version: LEARNING_PRACTICE_VERSION,
  passScore: 75,
  estimatedMinutes: 10,
  conversationId: null,
  conversationTitle: null,
  questions: [
    question('review-reading-order', '一套可复核的基础读盘顺序，最合理的是哪一项？', [
      ['structured', '定位宫位 → 命身宫 → 星曜分层 → 三方四正 → 本命四化 → 空宫 → 边界'],
      ['prediction', '先预测流年 → 再补命盘数据 → 最后找宫位'],
      ['single-star', '先找最熟悉的一颗星 → 直接判断现实事件'],
      ['ai-first', '先让 AI 自由解释 → 再决定命盘里有哪些星曜'],
    ], 'structured', '七步顺序先固定程序事实和结构，最后确认时间与解释边界。', ['chart-palace', 'chart-levels'], ['classic:gusuifu:reading-order', 'method:learning-boundary']),
    question('review-ming-shen', '命宫与身宫在基础课程中首先被视为什么？', [
      ['positions', '排盘引擎生成的位置事实'],
      ['events', '已经发生的人生事件'],
      ['predictions', '模型生成的预测'],
      ['same', '永远位于同一个宫位'],
    ], 'positions', '命宫与身宫先作为位置事实识别，二者可能同宫也可能分开。', ['chart-ming-shen'], ['project:chart-engine']),
    question('review-star-layer', '某宫没有主星时，以下哪项记录最准确？', [
      ['empty', '本宫无主星，但仍需记录辅煞星、对宫和三方关系'],
      ['nothing', '本宫完全没有任何信息'],
      ['invent', '让 AI 补上一颗最可能的主星'],
      ['ignore', '删除这个宫位，不再分析'],
    ], 'empty', '无主星仅定义为空宫，不等于宫位没有其他结构信息。', ['chart-stars', 'chart-empty-palace'], ['project:chart-types']),
    question('review-sanfang', '三方四正的四个组成部分是什么？', [
      ['relations', '本宫、对宫、两个三合宫'],
      ['neighbors', '本宫和三个相邻宫位'],
      ['two', '本宫与对宫'],
      ['all', '命盘全部十二宫'],
    ], 'relations', '三方四正不是图面相邻关系，而是程序计算的本宫、对宫与两个三合宫。', ['chart-sanfang'], ['project:chart-engine', 'classic:gusuifu:sanfang']),
    question('review-sihua', '记录“某星化忌”时，最容易遗漏但必须保留的信息是什么？', [
      ['level', '它属于本命、大限还是流年层'],
      ['color', '界面显示颜色'],
      ['font', '文字字号'],
      ['position', '它在屏幕左边还是右边'],
    ], 'level', '四化必须和星曜、宫位及时间层级一起记录。', ['chart-sihua', 'chart-levels'], ['method:learning-boundary']),
    question('review-borrow', '空宫借读对宫主星时，正确做法是什么？', [
      ['label', '明确标注“借自对宫”，保留主星来源'],
      ['copy', '把借来的星改写成本宫原生星曜'],
      ['merge', '把本宫和对宫合并成一个宫'],
      ['absolute', '仅凭借星作绝对吉凶判断'],
    ], 'label', '借星是观察关系，不应改写原始命盘事实。', ['chart-empty-palace'], ['classic:gusuifu:empty-palace']),
    question('review-timing', '本命、大限和流年之间最准确的关系是什么？', [
      ['layers', '本命是基础结构，大限和流年是带时间标签的叠加层'],
      ['replace', '流年可以覆盖并替换本命'],
      ['same', '三者是同一组数据'],
      ['ignore', '学习本命后不需要再看时间层'],
    ], 'layers', '稳定的本命坐标与带时间标签的运限层需要分开记录，再进行组合。', ['chart-levels'], ['project:chart-engine', 'method:learning-boundary']),
    question('review-boundary', '完成结构识别后，面对传统解释最合适的态度是什么？', [
      ['boundary', '把解释作为学习与观察参考，并与现实事实分开'],
      ['certain', '把所有解释当成必然发生的事实'],
      ['medical', '用传统解释替代医疗或投资意见'],
      ['invent', '缺少命盘字段时由模型自行补算'],
    ], 'boundary', '程序事实、传统解释和现实事实应分层，专业问题不能被命理解读替代。', ['chart-levels'], ['method:learning-boundary']),
  ],
  sourceIds: ['project:chart-engine', 'project:chart-types', 'classic:gusuifu:reading-order', 'classic:gusuifu:sanfang', 'classic:gusuifu:empty-palace', 'method:learning-boundary'],
  boundary: '综合练习只评估命盘结构识别方法，不评估人生吉凶，也不调用 AI 自由批改。',
};

export function buildChartStructurePractice(conversation: Conversation): LearningPracticeSet {
  if (conversation.type !== 'chart' || !conversation.chartSnapshot) throw new Error('单人命盘会话不存在');
  const chart = conversation.chartSnapshot;
  const ming = findPalace(chart.palaces, chart.mingGongBranch);
  const shen = findPalace(chart.palaces, chart.shenGongBranch);
  const oppositeBranch = (chart.mingGongBranch + 6) % 12;
  const opposite = findPalace(chart.palaces, oppositeBranch);
  const relationBranches = [chart.mingGongBranch, oppositeBranch, (chart.mingGongBranch + 4) % 12, (chart.mingGongBranch + 8) % 12];
  const empty = chart.palaces.find(item => item.isEmpty && typeof item.borrowedFromBranch === 'number');
  const mingMajorStars = ming.stars.filter(item => item.type === 'major').map(item => item.name);
  const mingTransformations = ming.stars.filter(item => item.siHua).map(item => `${item.name}化${item.siHua}`);

  const questions: LearningQuizQuestion[] = [
    branchQuestion('chart-ming-palace', '这张命盘的命宫位于哪一宫？', chart.mingGongBranch, chart.palaces, ['chart-ming-shen']),
    branchQuestion('chart-shen-palace', '这张命盘的身宫位于哪一宫？', chart.shenGongBranch, chart.palaces, ['chart-ming-shen']),
    branchQuestion('chart-opposite-palace', `当前${palaceLabel(ming)}的对宫是哪一宫？`, oppositeBranch, chart.palaces, ['chart-sanfang']),
    question('chart-ming-stars', `当前${palaceLabel(ming)}的主星记录，哪一项与命盘快照一致？`, starGroupOptions(ming, chart.palaces), 'correct', `命宫主星应记录为：${mingMajorStars.length ? mingMajorStars.join('、') : '无主星（空宫）'}。`, ['chart-stars'], ['project:chart-types']),
    question('chart-ming-relations', '以下哪组宫位完整组成命宫的三方四正？', relationOptions(relationBranches, chart.palaces), 'correct', `命宫三方四正为：${relationBranches.map(branch => palaceLabel(findPalace(chart.palaces, branch))).join('、')}。`, ['chart-sanfang'], ['project:chart-engine']),
    question('chart-ming-sihua', `当前${palaceLabel(ming)}的本命四化记录，哪一项与快照一致？`, transformationOptions(mingTransformations), 'correct', `命宫本命四化：${mingTransformations.length ? mingTransformations.join('、') : '当前宫没有本命四化标记'}。`, ['chart-sihua'], ['project:chart-types']),
    question('chart-level-boundary', '当前命盘识别练习读取的是哪一个时间层？', [['natal', '本命命盘快照'], ['daxian', '当前大限'], ['year', '当前流年'], ['mixed', '本命、大限和流年混合层']], 'natal', '本练习只读取保存的本命命盘快照，没有加入大限或流年。', ['chart-levels'], ['method:learning-boundary']),
  ];
  if (empty) {
    const borrowed = findPalace(chart.palaces, empty.borrowedFromBranch!);
    questions.splice(6, 0, question('chart-empty-borrow', `${palaceLabel(empty)}为空宫，以下哪项来源记录正确？`, [
      ['correct', `借自对宫${palaceLabel(borrowed)}，主星为${empty.borrowedStars?.join('、') || '无主星'}`],
      ['none', '空宫表示该宫完全没有信息'],
      ['neighbor', '应借相邻宫位的全部星曜'],
      ['native', '借来的主星已经成为本宫原生星曜'],
    ], 'correct', `程序记录该宫借自${palaceLabel(borrowed)}，来源标签必须保留。`, ['chart-empty-palace'], ['project:chart-engine', 'classic:gusuifu:empty-palace']));
  }

  return {
    schemaVersion: 1,
    id: `chart-structure:${conversation.id}`,
    kind: 'chart_structure',
    title: `${conversation.title} · 命盘识别练习`,
    description: '所有答案均由当前保存的单人命盘快照生成，用于检查宫位、主星、三方四正、四化和空宫来源识别。',
    version: LEARNING_PRACTICE_VERSION,
    passScore: 80,
    estimatedMinutes: 12,
    conversationId: conversation.id,
    conversationTitle: conversation.title,
    questions,
    sourceIds: [...new Set(questions.flatMap(item => item.sourceIds))],
    boundary: `只读取本命命盘快照；学习方法版本 ${LEARNING_METHODOLOGY_VERSION}，知识版本 ${LEARNING_KNOWLEDGE_VERSION}。`,
  };
}

function branchQuestion(id: string, prompt: string, correctBranch: number, palaces: Palace[], knowledgePointIds: string[]): LearningQuizQuestion {
  const branches = [correctBranch, (correctBranch + 3) % 12, (correctBranch + 6) % 12, (correctBranch + 9) % 12];
  return question(
    id,
    prompt,
    branches.map(branch => [`branch-${branch}`, palaceLabel(findPalace(palaces, branch))]),
    `branch-${correctBranch}`,
    `程序快照记录为${palaceLabel(findPalace(palaces, correctBranch))}。`,
    knowledgePointIds,
    ['project:chart-engine'],
  );
}

function starGroupOptions(correctPalace: Palace, palaces: Palace[]): Array<[string, string]> {
  const label = starGroupLabel(correctPalace);
  const candidates = palaces.filter(item => item.branch !== correctPalace.branch).map(starGroupLabel);
  return optionLabels(label, candidates);
}

function relationOptions(correctBranches: number[], palaces: Palace[]): Array<[string, string]> {
  const group = (base: number) => [base, (base + 6) % 12, (base + 4) % 12, (base + 8) % 12]
    .map(branch => palaceLabel(findPalace(palaces, branch))).join('、');
  return optionLabels(correctBranches.map(branch => palaceLabel(findPalace(palaces, branch))).join('、'), [group((correctBranches[0] + 1) % 12), group((correctBranches[0] + 2) % 12), group((correctBranches[0] + 3) % 12)]);
}

function transformationOptions(transformations: string[]): Array<[string, string]> {
  const correct = transformations.length ? transformations.join('、') : '当前宫没有本命四化标记';
  return optionLabels(correct, ['当前宫四星全部化禄', '直接读取当前流年四化', '命盘没有保存任何四化字段']);
}

function optionLabels(correct: string, candidates: string[]): Array<[string, string]> {
  const labels = [correct, ...candidates.filter(item => item !== correct)];
  const unique = [...new Set(labels)].slice(0, 4);
  const fallbacks = ['命盘快照未提供该字段', '需要由 AI 自行补算', '应改用相邻宫位数据'];
  for (const fallback of fallbacks) {
    if (unique.length >= 4) break;
    if (!unique.includes(fallback)) unique.push(fallback);
  }
  return unique.map((label, index) => [index === 0 ? 'correct' : `option-${index}`, label]);
}

function question(
  id: string,
  prompt: string,
  options: Array<[string, string]>,
  correctOptionId: string,
  explanation: string,
  knowledgePointIds: string[],
  sourceIds: string[],
): LearningQuizQuestion {
  return {
    id,
    type: 'single_choice',
    prompt,
    options: options.map(([optionId, label]) => ({ id: optionId, label })),
    correctOptionId,
    explanation,
    knowledgePointIds,
    sourceIds,
  };
}

function findPalace(palaces: Palace[], branch: number): Palace {
  const palace = palaces.find(item => item.branch === branch);
  if (!palace) throw new Error(`命盘缺少${BRANCHES[branch]}宫数据`);
  return palace;
}

function palaceLabel(palace: Palace): string {
  const name = palace.name.endsWith('宫') ? palace.name : `${palace.name}宫`;
  return `${name}（${BRANCHES[palace.branch]}）`;
}

function starGroupLabel(palace: Palace): string {
  const stars = palace.stars.filter(item => item.type === 'major').map(item => item.name);
  return stars.length ? stars.join('、') : '无主星（空宫）';
}
