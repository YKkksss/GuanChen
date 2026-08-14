import { NextResponse } from 'next/server';
import { getConversation } from '@/lib/db/conversations';
import { findAnnualReport, generateAnnualReport } from '@/lib/transits/annual-report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getConversation(id)) {
    return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  }
  const parsed = parseYear(request.url);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    return NextResponse.json({ report: findAnnualReport(id, parsed.year) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '年度报告读取失败' },
      { status: 400 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!getConversation(id)) {
    return NextResponse.json({ error: '会话不存在' }, { status: 404 });
  }
  const body = await request.json().catch(() => ({})) as {
    level?: unknown;
    date?: unknown;
    regenerate?: unknown;
  };
  if (body.level !== undefined && body.level !== 'year') {
    return NextResponse.json({ error: '第一版暂时只支持年度报告' }, { status: 400 });
  }
  const rawDate = typeof body.date === 'string' ? body.date : '';
  const year = Number.parseInt(rawDate.slice(0, 4), 10);
  if (!/^\d{4}/.test(rawDate) || !Number.isInteger(year)) {
    return NextResponse.json({ error: '年份格式不正确' }, { status: 400 });
  }

  try {
    const report = await generateAnnualReport({
      conversationId: id,
      selectedYear: year,
      regenerate: body.regenerate === true,
    });
    return NextResponse.json(
      { report },
      { status: report.status === 'generating' ? 202 : 200 },
    );
  } catch (error) {
    console.error('年度报告生成失败：', error);
    return NextResponse.json({ error: '年度报告生成失败，请稍后重试' }, { status: 500 });
  }
}

function parseYear(url: string): { year: number } | { error: string } {
  const searchParams = new URL(url).searchParams;
  const level = searchParams.get('level') ?? 'year';
  if (level !== 'year') return { error: '第一版暂时只支持年度报告' };
  const rawDate = searchParams.get('date') ?? '';
  const year = Number.parseInt(rawDate.slice(0, 4), 10);
  if (!/^\d{4}/.test(rawDate) || !Number.isInteger(year)) return { error: '年份格式不正确' };
  return { year };
}
