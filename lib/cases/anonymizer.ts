import type { Conversation } from '@/lib/conversations/types';
import type { LifeEventWithTransits } from '@/lib/events/types';
import type {
  AnonymousCaseChartSnapshot,
  CaseAnonymizationPreview,
  CaseEventSnapshot,
} from './types';

export const CASE_ANONYMIZATION_VERSION = 'case-anonymizer-v1';

export function buildCaseAnonymizationPreview(input: {
  conversation: Conversation;
  events: LifeEventWithTransits[];
  referenceYear?: number;
}): CaseAnonymizationPreview {
  const { conversation } = input;
  if (conversation.type !== 'chart' || !conversation.chartSnapshot || !conversation.birthInfo) {
    throw new Error('只有包含完整快照的单人命盘可以创建匿名案例');
  }

  const referenceYear = input.referenceYear ?? new Date().getFullYear();
  const confirmedEvents = input.events.filter(event => event.confirmedByUser);
  const chartSnapshot = sanitizeChart(conversation, referenceYear);
  const events = confirmedEvents.map(event => ({
    category: event.category,
    ageBand: eventAgeBand(event.startDate, conversation.birthInfo!.year),
    datePrecision: normalizeDatePrecision(event.datePrecision),
    impactLevel: event.impactLevel,
    sourceKind: 'user_confirmed' as const,
  }));

  return {
    sourceConversationId: conversation.id,
    suggestedTitle: '匿名案例（待命名）',
    anonymizationVersion: CASE_ANONYMIZATION_VERSION,
    chartSnapshot,
    events,
    confirmedEventCount: confirmedEvents.length,
    privacyItems: [
      { key: 'name', label: '姓名与会话标题', handling: 'removed', result: '不进入案例数据' },
      { key: 'birth-date', label: '精确出生日期与农历日期', handling: 'removed', result: '仅保留当前十岁年龄段' },
      { key: 'birth-time', label: '出生时辰原值', handling: 'removed', result: '仅保留命盘计算后的结构与时辰可信状态' },
      { key: 'birth-location', label: '省市、地点与经度', handling: 'removed', result: '全部移除' },
      { key: 'conversation', label: '聊天消息与上下文记忆', handling: 'removed', result: '全部移除' },
      { key: 'events', label: '人生事件正文与精确日期', handling: 'generalized', result: `仅保留 ${events.length} 条已确认事件的类别、年龄段和影响级别` },
      { key: 'chart', label: '命盘结构', handling: 'retained', result: '保留宫位、星曜、四化、五行局和大限年龄段' },
    ],
  };
}

function sanitizeChart(conversation: Conversation, referenceYear: number): AnonymousCaseChartSnapshot {
  const chart = conversation.chartSnapshot!;
  const birthInfo = conversation.birthInfo!;
  const currentAge = Math.max(0, referenceYear - birthInfo.year);
  return {
    snapshotVersion: 'anonymous-chart-v1',
    profile: {
      gender: birthInfo.gender,
      currentAgeBand: toAgeBand(currentAge),
      birthTimeConfidence: birthInfo.unknownTime ? 'unknown' : 'known',
    },
    mingGongBranch: chart.mingGongBranch,
    shenGongBranch: chart.shenGongBranch,
    wuxingJu: chart.wuxingJu,
    wuxingJuName: chart.wuxingJuName,
    ziweiPos: chart.ziweiPos,
    palaces: chart.palaces.map(palace => ({
      branch: palace.branch,
      stem: palace.stem,
      name: palace.name,
      stars: palace.stars.map(star => ({
        name: star.name,
        type: star.type,
        ...(star.siHua ? { siHua: star.siHua } : {}),
        ...(star.brightness ? { brightness: star.brightness } : {}),
      })),
      ...(palace.daXianAge ? { daXianAge: palace.daXianAge } : {}),
      ...(palace.isMingGong ? { isMingGong: true } : {}),
      ...(palace.isShenGong ? { isShenGong: true } : {}),
      ...(palace.selfSihua ? { selfSihua: palace.selfSihua } : {}),
      ...(palace.oppositeBranch !== undefined ? { oppositeBranch: palace.oppositeBranch } : {}),
      ...(palace.isEmpty !== undefined ? { isEmpty: palace.isEmpty } : {}),
      ...(palace.borrowedFromBranch !== undefined ? { borrowedFromBranch: palace.borrowedFromBranch } : {}),
      ...(palace.borrowedFromName ? { borrowedFromName: palace.borrowedFromName } : {}),
      ...(palace.borrowedStars ? { borrowedStars: palace.borrowedStars } : {}),
    })),
    daXians: chart.daXians.map(daXian => ({ ...daXian })),
  };
}

function eventAgeBand(startDate: string, birthYear: number): string | null {
  const eventYear = Number(startDate.slice(0, 4));
  if (!Number.isInteger(eventYear) || eventYear < birthYear) return null;
  return toAgeBand(eventYear - birthYear);
}

function toAgeBand(age: number): string {
  const lower = Math.floor(Math.max(age, 0) / 10) * 10;
  return `${lower}-${lower + 9}岁`;
}

function normalizeDatePrecision(
  precision: LifeEventWithTransits['datePrecision'],
): CaseEventSnapshot['datePrecision'] {
  if (precision === 'range') return 'range';
  if (precision === 'unknown') return 'unknown';
  return 'year';
}
