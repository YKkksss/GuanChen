import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { ElectionError } from '@/lib/election/engine';
import { calculatePersonalElectionHours } from '@/lib/election/personal-service';
import { getElectionPlan } from '@/lib/db/election';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function POSTHandler(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: '请提交有效 JSON' }, { status: 400 }); }
  try {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ElectionError('请提交有效的时辰查询');
    const v = body as Record<string, unknown>;
    if (Object.keys(v).some(k => !['input','date','planId'].includes(k))) throw new ElectionError('时辰查询不接受客户端快照或盘面');
    if (v.planId !== undefined) {
      if (typeof v.planId !== 'string' || !v.planId || v.planId.length > 100 || v.input !== undefined) throw new ElectionError('已保存方案请只提交方案标识与日期');
      const plan = getElectionPlan(v.planId);
      if (!plan) throw new ElectionError('择日方案不存在',404);
      return NextResponse.json({hours:calculatePersonalElectionHours(plan.input,v.date,plan.result.personal)});
    }
    return NextResponse.json({ hours: calculatePersonalElectionHours(v.input, v.date) });
  } catch (e) { return NextResponse.json({ error: e instanceof ElectionError ? e.message : '时辰读取失败，请稍后重试' }, { status: e instanceof ElectionError ? e.status : 500 }); }
}
export const POST = withAccount(POSTHandler);
