import { NextResponse } from 'next/server';
import {
  createChatCompletionStream,
  sseResponse,
  toClientSseStream,
  type ChatMessage,
} from '@/lib/ai/deepseek';
import type { Palace, ZiweiChart } from '@/lib/ziwei/types';
import { getConversation } from '@/lib/db/conversations';
import { getRelationshipDefinition } from '@/lib/heming';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `你是一个中文紫微斗数合盘分析助手。
要求：
1. 只基于两张命盘的结构做关系分析，不要编造现实经历。
2. 合盘重点看命宫、夫妻宫、福德宫、迁移宫、交友宫、三方四正、大限阶段与四化互动。
3. 输出应有匹配优势、冲突点、相处建议和需要验证的问题。
4. 不做绝对断言，不鼓励用户把婚恋、投资或健康重大决策完全交给命理。
5. 输出中文，使用 **【小标题】** 分段。`;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const conversation = conversationId ? getConversation(conversationId) : null;

    if (!conversation || conversation.type !== 'heming') {
      return NextResponse.json({ error: '合盘会话不存在' }, { status: 404 });
    }

    const chartA = conversation.chartSnapshotA;
    const chartB = conversation.chartSnapshotB;

    if (!chartA || !chartB || !Array.isArray(chartA.palaces) || !Array.isArray(chartB.palaces)) {
      return NextResponse.json({ error: '合盘数据缺失' }, { status: 400 });
    }

    const relationship = getRelationshipDefinition(conversation.relationshipType ?? 'custom');
    const context = conversation.relationshipContext;

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `请分析下面两张紫微斗数命盘的关系互动。\n\n关系类型：${relationship.label}\n角色：${context?.ownerARole ?? relationship.roles[0].label} / ${context?.ownerBRole ?? relationship.roles[1].label}\n现实关注：${context?.mainConcern || '用户暂未填写，禁止自行补全'}\n\n甲方命盘：\n${summarizeChart(chartA)}\n\n乙方命盘：\n${summarizeChart(chartB)}\n\n用户问题：${question || '请给出完整合盘总览。'}`,
      },
    ];

    const upstream = await createChatCompletionStream(messages, {
      temperature: 0.72,
      maxTokens: 2200,
    });

    return sseResponse(toClientSseStream(upstream));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI 合盘失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function summarizeChart(chart: ZiweiChart): string {
  const birth = chart.birthInfo;
  const currentDaXian = chart.daXians?.[chart.currentDaXianIndex];

  return JSON.stringify({
    birthInfo: {
      year: birth.year,
      month: birth.month,
      day: birth.day,
      hour: birth.hour,
      gender: birth.gender,
      name: birth.name,
      city: birth.city,
    },
    wuxingJuName: chart.wuxingJuName,
    currentAge: chart.currentAge,
    currentDaXian,
    palaces: chart.palaces.map(summarizePalace),
  }, null, 2);
}

function summarizePalace(palace: Palace) {
  return {
    name: palace.name,
    branch: palace.branch,
    isMingGong: palace.isMingGong,
    isShenGong: palace.isShenGong,
    daXianAge: palace.daXianAge,
    stars: palace.stars.map(star => ({
      name: star.name,
      type: star.type,
      siHua: star.siHua,
      brightness: star.brightness,
    })),
  };
}
