import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { BaziReadingError, generateBaziReading, getBaziReadingDetail } from '@/lib/bazi/reading-service';
import { BAZI_READING_EXAMPLES, baziReadingExample } from '@/lib/bazi/reading-examples';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
function failure(e: unknown) { return NextResponse.json({ error: e instanceof BaziReadingError ? e.message : '论命资料加载失败，请稍后重试' }, { status: e instanceof BaziReadingError ? e.status : 500 }); }
async function GETHandler(request: Request, context: Context) {
  const { id } = await context.params;
  try {
    const detail = getBaziReadingDetail(id), exampleId = new URL(request.url).searchParams.get('example');
    if (exampleId && !BAZI_READING_EXAMPLES.some(e => e.id === exampleId)) throw new BaziReadingError('示例不存在', 404);
    return NextResponse.json({ detail, examples: BAZI_READING_EXAMPLES.map(({ id, title, question }) => ({ id, title, question })), ...(exampleId ? { example: baziReadingExample(exampleId) } : {}) });
  } catch (e) { return failure(e); }
}
async function POSTHandler(request: Request, context: Context) {
  const { id } = await context.params;
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: '请求体必须是有效 JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || (Object.hasOwn(body, 'regenerate') && typeof (body as Record<string, unknown>).regenerate !== 'boolean')) return NextResponse.json({ error: '论命参数格式错误' }, { status: 400 });
  try { const detail = await generateBaziReading(id, (body as { regenerate?: boolean }).regenerate, request.signal); return NextResponse.json({ detail }, { status: detail.versions.some(v => v.status === 'generating') ? 202 : 200 }); }
  catch (e) { return failure(e); }
}
export const GET = withAccount(GETHandler);
export const POST = withAccount(POSTHandler);
