import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { calculateSynthesisBirth } from '@/lib/synthesis/birth';
import { getConversation } from '@/lib/db/conversations';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function POSTHandler(request: Request) {
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ error: '请提交有效 JSON' }, { status: 400 }); }
  try {
    const result = calculateSynthesisBirth(body);
    if (result.input.sourceConversationId && getConversation(result.input.sourceConversationId)?.type !== 'chart') return NextResponse.json({ error: '来源个人命盘不存在' }, { status: 404 });
    return NextResponse.json({ policy: result.policy, pillars: Object.values(result.bazi.pillars).map(p => p?.ganZhi ?? '时柱未知'), ziweiLunarYear: result.ziwei.lunarInfo.lunarYear });
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : '资料预览失败' }, { status: 400 }); }
}
export const POST = withAccount(POSTHandler);
