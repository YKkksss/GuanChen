import { NextResponse } from 'next/server';
import {
  createChatCompletionStream,
  sseResponse,
  toClientSseStream,
  type ChatMessage,
} from '@/lib/ai/deepseek';
import { summarizeChart, ZIWEI_SYSTEM_PROMPT } from '@/lib/ai/ziwei-context';
import type { ZiweiChart } from '@/lib/ziwei/types';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const chart = body.chart as ZiweiChart | undefined;
    const incoming = Array.isArray(body.messages) ? body.messages : [];

    if (!chart || !Array.isArray(chart.palaces)) {
      return NextResponse.json({ error: '命盘数据缺失' }, { status: 400 });
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: ZIWEI_SYSTEM_PROMPT },
      { role: 'user', content: `下面是本次要解读的紫微斗数命盘结构：\n${summarizeChart(chart)}` },
      ...normalizeMessages(incoming).slice(-8),
    ];

    const upstream = await createChatCompletionStream(messages, {
      temperature: 0.72,
      maxTokens: 2000,
    });

    return sseResponse(toClientSseStream(upstream));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'AI 解读失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeMessages(messages: unknown[]): ChatMessage[] {
  return messages
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const msg = item as { role?: unknown; content?: unknown };
      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      const content = typeof msg.content === 'string' ? msg.content.trim() : '';
      return content ? { role, content } : null;
    })
    .filter((item): item is ChatMessage => Boolean(item));
}
