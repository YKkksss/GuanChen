import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { FortuneError, generateFortuneReport, getFortuneOptions, getFortunePreview, readFortuneReport } from '@/lib/fortune-topics/service';
import { isFortuneTopic } from '@/lib/fortune-topics/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
function failure(error: unknown) { return NextResponse.json({ error: error instanceof FortuneError ? error.message : '专题加载失败，请稍后重试' }, { status: error instanceof FortuneError ? error.status : 500 }); }
async function GETHandler(request: Request, context: Context) {
  const { id } = await context.params, query = new URL(request.url).searchParams;
  try {
    if (query.has('reportId')) return NextResponse.json({ detail: readFortuneReport(id, query.get('reportId')!) });
    if (query.has('period')) {
      const topic = query.get('topic');
      if (!isFortuneTopic(topic)) throw new FortuneError('请指定有效主题');
      return NextResponse.json(getFortunePreview(id, topic, query.get('period')!, query.get('compare') ?? ''));
    }
    const year = query.get('year');
    if (year !== null && !/^\d{4}$/.test(year)) throw new FortuneError('年份格式不正确');
    return NextResponse.json({ options: getFortuneOptions(id, year === null ? undefined : Number(year)) });
  } catch (e) { return failure(e); }
}
async function POSTHandler(request: Request, context: Context) {
  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: '请求体必须是有效 JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: '专题参数格式错误' }, { status: 400 });
  const v = body as Record<string, unknown>;
  if (!isFortuneTopic(v.topic) || typeof v.period !== 'string' || (v.compare !== undefined && typeof v.compare !== 'string') || (v.regenerate !== undefined && typeof v.regenerate !== 'boolean')) return NextResponse.json({ error: '请指定有效的主题、阶段与生成选项' }, { status: 400 });
  try {
    const detail = await generateFortuneReport(id, v.topic, v.period, v.compare as string | undefined, v.regenerate as boolean | undefined, request.signal);
    return NextResponse.json({ detail }, { status: detail.versions.some(item => item.status === 'generating') ? 202 : 200 });
  } catch (e) { return failure(e); }
}
export const GET = withAccount(GETHandler);
export const POST = withAccount(POSTHandler);
