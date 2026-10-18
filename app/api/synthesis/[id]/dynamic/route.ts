import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { SynthesisError } from '@/lib/synthesis/error';
import { getDynamicSynthesisDetail, saveDynamicSynthesisSnapshot, generateDynamicSynthesisReport } from '@/lib/synthesis/dynamic-service';
import { isSynthesisTopic } from '@/lib/synthesis/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
function failure(e: unknown) { return NextResponse.json({ error: e instanceof SynthesisError ? e.message : '动态合参操作失败，请稍后重试' }, { status: e instanceof SynthesisError ? e.status : 500 }); }
async function GETHandler(request: Request, context: Context) {
  const { id } = await context.params, params = new URL(request.url).searchParams;
  const topic = params.get('topic') ?? 'overview', level = params.get('level'), dateTime = params.get('dateTime'), stageKey = params.get('stageKey');
  if (!isSynthesisTopic(topic) || (level === null) !== (dateTime === null)) return NextResponse.json({ error: '请指定有效主题及完整观察阶段' }, { status: 400 });
  try { return NextResponse.json({ detail: getDynamicSynthesisDetail(id, topic, level === null ? undefined : { level, dateTime }, stageKey ?? undefined) }); }
  catch (e) { return failure(e); }
}
async function POSTHandler(request: Request, context: Context) {
  const { id } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: '请提交有效 JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: '阶段参数格式不正确' }, { status: 400 });
  const v = body as Record<string, unknown>;
  if (!isSynthesisTopic(v.topic) || !['save', 'generate'].includes(v.action as string) || !v.selection || (v.regenerate !== undefined && typeof v.regenerate !== 'boolean') || (v.stageKey !== undefined && typeof v.stageKey !== 'string')) return NextResponse.json({ error: '请指定有效主题、观察阶段及保存或生成操作' }, { status: 400 });
  try {
    const detail = v.action === 'save' ? saveDynamicSynthesisSnapshot(id, v.topic, v.selection, v.stageKey as string | undefined) : await generateDynamicSynthesisReport(id, v.topic, v.selection, v.regenerate as boolean | undefined, request.signal, v.stageKey as string | undefined);
    return NextResponse.json({ detail }, { status: detail.versions.some(v => v.status === 'generating') ? 202 : 200 });
  } catch (e) { return failure(e); }
}
export const GET = withAccount(GETHandler);
export const POST = withAccount(POSTHandler);
