import type { LearningKnowledgePoint, LearningSourceReference } from './types';

export const LEARNING_KNOWLEDGE_VERSION = 'learning-foundation-v1';
export const LEARNING_METHODOLOGY_VERSION = 'learning-method-v1';

export const LEARNING_SOURCES: LearningSourceReference[] = [
  {
    id: 'project:chart-engine',
    type: 'project_rule',
    title: '项目确定性排盘引擎',
    locator: 'lib/ziwei/algorithm.ts',
    note: '用于宫位、星曜、命身宫、空宫借对宫和大限等结构事实。',
  },
  {
    id: 'project:chart-types',
    type: 'project_rule',
    title: '项目命盘结构契约',
    locator: 'lib/ziwei/types.ts',
    note: '定义宫位、星曜、四化和借宫字段，属于程序事实而非命理解读。',
  },
  {
    id: 'classic:gusuifu:reading-order',
    type: 'classic',
    title: '《骨髓赋》总论篇',
    locator: 'gsf-1-3',
    href: '/library/gusuifu/0#gsf-1-3',
    note: '项目古籍库收录的读盘次序参考。',
  },
  {
    id: 'classic:gusuifu:sanfang',
    type: 'classic',
    title: '《骨髓赋》十二宫论',
    locator: 'gsf-9-1',
    href: '/library/gusuifu/8#gsf-9-1',
    note: '项目古籍库收录的本宫与三方关系参考。',
  },
  {
    id: 'classic:gusuifu:empty-palace',
    type: 'classic',
    title: '《骨髓赋》十二宫论',
    locator: 'gsf-9-4',
    href: '/library/gusuifu/8#gsf-9-4',
    note: '项目古籍库收录的空宫借对宫参考。',
  },
  {
    id: 'method:learning-boundary',
    type: 'methodology',
    title: 'M6 学习模式内容边界',
    locator: 'docs/M6_0_1_LEARNING_FOUNDATION_IMPLEMENTATION.md',
    note: '区分程序事实、传统解释、现代教学说明与现实判断。',
  },
];

export const LEARNING_KNOWLEDGE_POINTS: LearningKnowledgePoint[] = [
  point('chart-palace', '先确定本宫', 'palace', '宫位是当前观察主题的入口。先确认宫名与地支，再读取宫内星曜。', ['只看星曜而忽略星曜落在哪个宫位。'], ['project:chart-engine', 'classic:gusuifu:reading-order']),
  point('chart-ming-shen', '识别命宫与身宫', 'chart_structure', '命宫与身宫是命盘上的确定性位置标记；是否落在当前宫位应先于解释被识别。', ['把身宫当成第二个命宫，或忽略二者可能同宫。'], ['project:chart-types', 'classic:gusuifu:reading-order']),
  point('chart-stars', '分层读取星曜', 'star', '先识别主星，再记录辅吉星与煞星。空宫表示没有主星，不等于该宫没有信息。', ['把所有星曜视为同一权重；看到单颗星就直接下结论。'], ['project:chart-types']),
  point('chart-sanfang', '建立三方四正', 'chart_structure', '分析本宫时同时查看对宫与两个三合宫，形成四宫结构，不孤立阅读单宫。', ['把相邻宫位当成三合宫；只看本宫。'], ['project:chart-engine', 'classic:gusuifu:sanfang']),
  point('chart-sihua', '检查本命四化', 'sihua', '四化首先要确认层级。当前首版只呈现命盘快照中的本命四化，不把大限或流年四化混入。', ['把本命、大限和流年四化混为一谈。'], ['project:chart-types']),
  point('chart-empty-palace', '处理空宫与借对宫', 'chart_structure', '没有主星时记录为空宫，并读取程序保存的对宫主星借用关系；借星不等于把两个宫位完全合并。', ['把空宫理解为没有事情；忽略对宫；把借星当成本宫原生星曜。'], ['project:chart-engine', 'classic:gusuifu:empty-palace']),
  point('chart-levels', '区分本命与运限', 'timing', '本命描述基础结构，大限与流年属于时间层叠加。学习基础结构时先固定在本命层。', ['用某一年的变化替代本命结构；没有标记时间层级。'], ['project:chart-engine', 'method:learning-boundary']),
];

function point(
  id: string,
  title: string,
  category: LearningKnowledgePoint['category'],
  explanation: string,
  commonMistakes: string[],
  sourceIds: string[],
): LearningKnowledgePoint {
  return { id, title, category, level: 'beginner', objectives: [title], explanation, commonMistakes, sourceIds, version: LEARNING_KNOWLEDGE_VERSION };
}

export function getLearningKnowledgePoint(id: string): LearningKnowledgePoint | null {
  return LEARNING_KNOWLEDGE_POINTS.find(item => item.id === id) ?? null;
}
