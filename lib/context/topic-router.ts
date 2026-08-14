import type { ConversationMessage } from '@/lib/conversations/types';

export type ContextTopic =
  | 'overview'
  | 'personality'
  | 'relationship'
  | 'career'
  | 'wealth'
  | 'health'
  | 'family'
  | 'study'
  | 'fortune'
  | 'palace';

const TOPIC_ALIASES: Record<string, ContextTopic> = {
  overview: 'overview',
  overall: 'overview',
  mingge: 'overview',
  personality: 'personality',
  character: 'personality',
  love: 'relationship',
  marriage: 'relationship',
  relationship: 'relationship',
  career: 'career',
  work: 'career',
  wealth: 'wealth',
  finance: 'wealth',
  health: 'health',
  family: 'family',
  study: 'study',
  fortune: 'fortune',
  daxian: 'fortune',
  liunian: 'fortune',
};

const KEYWORDS: Array<[ContextTopic, RegExp]> = [
  ['relationship', /感情|恋爱|婚姻|对象|伴侣|夫妻|桃花|复合/],
  ['career', /事业|工作|职业|岗位|升职|创业|跳槽|上班/],
  ['wealth', /财运|财富|收入|投资|赚钱|钱财|资产|田宅/],
  ['health', /健康|疾病|身体|睡眠|手术|医院|疾厄/],
  ['family', /父母|子女|兄弟|姐妹|家庭|亲子/],
  ['study', /学习|学业|考试|专业|升学|读书/],
  ['fortune', /流年|流月|流日|大限|运势|今年|明年|哪一年/],
  ['personality', /性格|个性|脾气|内心|人格|特点/],
  ['overview', /命格|整体|总览|人生方向|格局/],
];

export function classifyContextTopic(message: ConversationMessage): ContextTopic {
  if (message.source === 'palace' || message.palaceBranch !== null) return 'palace';
  const explicit = message.topic?.toLowerCase();
  if (explicit && TOPIC_ALIASES[explicit]) return TOPIC_ALIASES[explicit];
  return KEYWORDS.find(([, pattern]) => pattern.test(message.content))?.[0] ?? 'overview';
}

export function getTopicPalaceNames(topic: ContextTopic): string[] {
  switch (topic) {
    case 'personality': return ['命宫', '福德宫', '迁移宫', '交友宫'];
    case 'relationship': return ['夫妻宫', '命宫', '福德宫', '迁移宫'];
    case 'career': return ['官禄宫', '财帛宫', '命宫', '迁移宫'];
    case 'wealth': return ['财帛宫', '田宅宫', '官禄宫', '福德宫'];
    case 'health': return ['疾厄宫', '命宫', '福德宫', '父母宫'];
    case 'family': return ['父母宫', '子女宫', '兄弟宫', '田宅宫'];
    case 'study': return ['命宫', '官禄宫', '福德宫', '父母宫'];
    case 'fortune': return ['命宫', '官禄宫', '财帛宫', '迁移宫'];
    case 'overview': return ['命宫', '财帛宫', '官禄宫', '迁移宫'];
    case 'palace': return [];
  }
}
