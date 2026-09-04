import type { ChatMessage } from '@/lib/ai/deepseek';
import { createChatCompletion, getProviderConfig } from '@/lib/ai/deepseek';
import { BRANCHES, STEMS } from '@/lib/ziwei/constants';
import { getConversation } from '@/lib/db/conversations';
import {
  claimAnnualTransitReport,
  completeAnnualTransitReportVersion,
  failAnnualTransitReportVersion,
  getAnnualTransitReport,
  getAnnualTransitReportDetail,
} from '@/lib/db/transit-reports';
import type { ZiweiChart } from '@/lib/ziwei/types';
import type { AnnualTransitSnapshot } from './types';
import { getOrCreateAnnualTransit } from './service';

export const ANNUAL_REPORT_PROMPT_VERSION = 'annual-report-v2';
const GENERATING_STALE_MS = 2 * 60 * 1000;

export function findAnnualReport(conversationId: string, selectedYear: number, version?: number) {
  const transit = getOrCreateAnnualTransit(conversationId, selectedYear);
  return getAnnualTransitReport({
    conversationId,
    targetDate: String(selectedYear),
    engineVersion: transit.engineVersion,
    promptVersion: ANNUAL_REPORT_PROMPT_VERSION,
    version,
  });
}

export function findAnnualReportDetail(conversationId: string, selectedYear: number, version?: number) {
  const report = findAnnualReport(conversationId, selectedYear, version);
  return report ? getAnnualTransitReportDetail(report.id, version) : null;
}

export async function generateAnnualReport(input: {
  conversationId: string;
  selectedYear: number;
  regenerate?: boolean;
}) {
  const conversation = getConversation(input.conversationId);
  if (!conversation?.chartSnapshot) throw new Error('会话不存在或缺少命盘快照');
  const transit = getOrCreateAnnualTransit(input.conversationId, input.selectedYear);
  const lookup = {
    conversationId: input.conversationId,
    targetDate: String(input.selectedYear),
    engineVersion: transit.engineVersion,
    promptVersion: ANNUAL_REPORT_PROMPT_VERSION,
  };
  const provider = getProviderConfig();
  const claim = claimAnnualTransitReport({
    ...lookup,
    snapshotId: transit.id,
    provider: provider.provider,
    model: provider.model,
    regenerate: Boolean(input.regenerate),
    staleAfterMs: GENERATING_STALE_MS,
  });
  if (!claim.claimed) return claim.report;

  try {
    const result = await createChatCompletion(
      buildAnnualReportMessages(conversation.chartSnapshot, transit.snapshot),
      { temperature: 0.35, maxTokens: 1_600, thinking: false },
    );
    return completeAnnualTransitReportVersion(claim.version.id, {
      content: result.content.trim(),
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    })!;
  } catch (error) {
    failAnnualTransitReportVersion(
      claim.version.id,
      error instanceof Error ? error.message : 'annual_report_generation_failed',
    );
    throw error;
  }
}

export function buildAnnualReportMessages(
  chart: ZiweiChart,
  snapshot: AnnualTransitSnapshot,
): ChatMessage[] {
  if (!chart) throw new Error('命盘快照缺失');
  const chartFacts = {
    birth: {
      date: `${chart.birthInfo.year}-${chart.birthInfo.month}-${chart.birthInfo.day}`,
      hourBranch: chart.birthInfo.unknownTime ? null : BRANCHES[chart.birthInfo.hour],
      birthTimeConfidence: chart.birthInfo.unknownTime ? 'unknown' : 'known',
      gender: chart.birthInfo.gender,
    },
    core: {
      mingGong: BRANCHES[chart.mingGongBranch],
      shenGong: BRANCHES[chart.shenGongBranch],
      wuxingJu: chart.wuxingJuName,
      birthYearGanZhi: `${STEMS[chart.lunarInfo.yearStem]}${BRANCHES[chart.lunarInfo.yearBranch]}`,
    },
    palaces: chart.palaces.map(palace => ({
      name: palace.name,
      branch: BRANCHES[palace.branch],
      stars: palace.stars.map(star => ({
        name: star.name,
        type: star.type,
        siHua: star.siHua ?? null,
        brightness: star.brightness ?? null,
      })),
      isMingGong: Boolean(palace.isMingGong),
      isShenGong: Boolean(palace.isShenGong),
      isEmpty: Boolean(palace.isEmpty),
      borrowedFrom: palace.borrowedFromName ?? null,
      borrowedStars: palace.borrowedStars ?? [],
    })),
  };

  return [
    {
      role: 'system',
      content: `你是中文紫微斗数年度报告撰写助手。你只能解释输入中的确定性命盘与年度运限数据，不得自行计算、补全或编造星曜、宫位、四化和现实事件。

必须严格按以下八个标题输出，不要增加开场白，也不要向用户提问：
**【年度总览】**
**【命格在本年的表现】**
**【感情与关系】**
**【事业与学习】**
**【财运与资源】**
**【健康与生活节奏】**
**【性格与人际表现】**
**【年度行动建议】**

每节控制在 180 至 320 个中文字符，完整报告控制在 1800 至 3000 个中文字符，避免重复同一条依据。每节应结合流年命宫、所在大限、流年四化、相关本命宫位和星曜说明依据。命格和性格属于本命底色，要说明当年如何被触发，不能写成性格每年彻底改变。不得使用“必然、一定、注定、百分百”等绝对措辞。健康、投资、婚姻等内容必须说明仅供传统文化研究和自我观察，不替代专业建议。birthTimeConfidence 为 unknown 时必须说明当前为子时试排，并降低与时辰相关结论的置信度。`,
    },
    {
      role: 'user',
      content: [
        '【权威本命事实】',
        JSON.stringify(chartFacts),
        `【${snapshot.selectedYear} 年权威运限事实】`,
        JSON.stringify(snapshot),
        `请撰写 ${snapshot.selectedYear} 年完整年度总结报告。排盘事实、传统解释和行动建议要清楚区分；所有判断均须能回指以上数据。`,
      ].join('\n'),
    },
  ];
}
