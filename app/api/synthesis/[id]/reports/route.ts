import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { generateSynthesisReport, SynthesisError } from '@/lib/synthesis/service';
import { isSynthesisTopic } from '@/lib/synthesis/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
async function POSTHandler(request: Request, context: Context) {
  const { id } = await context.params;
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: '请提交有效 JSON' }, { status: 400 }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: '报告参数格式错误' }, { status: 400 });
  const v = body as Record<string, unknown>;
  if (!isSynthesisTopic(v.topic) || (v.regenerate !== undefined && typeof v.regenerate !== 'boolean')) return NextResponse.json({ error: '请指定有效专题与生成选项' }, { status: 400 });
  try { const detail = await generateSynthesisReport(id, v.topic, v.regenerate as boolean | undefined, request.signal); return NextResponse.json({ detail }, { status: detail.versions.some(v => v.status === 'generating') ? 202 : 200 }); }
  catch (e) { return NextResponse.json({ error: e instanceof SynthesisError ? e.message : '合参生成失败，请稍后重试' }, { status: e instanceof SynthesisError ? e.status : 500 }); }
}
export const POST = withAccount(POSTHandler);
