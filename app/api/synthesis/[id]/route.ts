import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { getSynthesisDetail, SynthesisError } from '@/lib/synthesis/service';
import { deleteSynthesisSession, getSynthesisSession } from '@/lib/db/synthesis';
import { isSynthesisTopic } from '@/lib/synthesis/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ id: string }> };
async function GETHandler(request: Request, context: Context) {
  const { id } = await context.params, topic = new URL(request.url).searchParams.get('topic') ?? 'overview';
  if (!isSynthesisTopic(topic)) return NextResponse.json({ error: '专题不正确' }, { status: 400 });
  try { return NextResponse.json({ detail: getSynthesisDetail(id, topic) }); }
  catch (e) { return NextResponse.json({ error: e instanceof SynthesisError ? e.message : '合参读取失败，请稍后重试' }, { status: e instanceof SynthesisError ? e.status : 500 }); }
}
async function DELETEHandler(_request: Request, context: Context) {
  const { id } = await context.params;
  if (!getSynthesisSession(id)) return NextResponse.json({ error: '合参命盘不存在' }, { status: 404 });
  deleteSynthesisSession(id); return NextResponse.json({ deleted: true });
}
export const GET = withAccount(GETHandler);
export const DELETE = withAccount(DELETEHandler);
