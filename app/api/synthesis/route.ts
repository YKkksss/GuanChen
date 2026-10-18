import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { createSynthesisSession, listSynthesisSessions } from '@/lib/db/synthesis';
import { getConversation } from '@/lib/db/conversations';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function GETHandler(request: Request) {
  const sourceId = new URL(request.url).searchParams.get('source');
  const source = sourceId ? getConversation(sourceId) : null;
  if (sourceId && (!source || source.type !== 'chart' || !source.birthInfo)) return NextResponse.json({ error: '来源个人命盘不存在' }, { status: 404 });
  return NextResponse.json({ sessions: listSynthesisSessions(), source: source ? { id: source.id, title: source.title, birth: source.birthInfo } : null });
}
async function POSTHandler(request: Request) {
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: '请提交有效 JSON' }, { status: 400 }); }
  try { const result = createSynthesisSession(body); return NextResponse.json(result, { status: result.reused ? 200 : 201 }); }
  catch (e) { const message = e instanceof Error ? e.message : ''; const inputError = /出生|时辰|日期|时间|性别|经度|太阳时|晚子时|北京时间|命盘名称|排盘范围|来源个人命盘/.test(message); return NextResponse.json({ error: inputError ? message : '双盘建立失败，请稍后重试' }, { status: message === '来源个人命盘不存在' ? 404 : inputError ? 400 : 500 }); }
}
export const GET = withAccount(GETHandler);
export const POST = withAccount(POSTHandler);
