import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { deleteElectionPlan, getElectionPlan, updateElectionPlan } from '@/lib/db/election';
import { ElectionError } from '@/lib/election/engine';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params:Promise<{id:string}> };
async function GETHandler(_request:Request,context:Context) { const { id } = await context.params, plan = getElectionPlan(id); return plan ? NextResponse.json({ plan }) : NextResponse.json({ error:'择日方案不存在' },{ status:404 }); }
async function PATCHHandler(request:Request,context:Context) { const { id } = await context.params; let body:unknown; try { body = await request.json(); } catch { return NextResponse.json({ error:'请提交有效 JSON' },{ status:400 }); } try { return NextResponse.json({ plan:updateElectionPlan(id,body) }); } catch (e) { return NextResponse.json({ error:e instanceof ElectionError ? e.message : '方案修改失败，请稍后重试' },{ status:e instanceof ElectionError ? e.status : 500 }); } }
async function DELETEHandler(_request:Request,context:Context) { const { id } = await context.params; return deleteElectionPlan(id) ? NextResponse.json({ deleted:true }) : NextResponse.json({ error:'择日方案不存在' },{ status:404 }); }
export const GET = withAccount(GETHandler);
export const PATCH = withAccount(PATCHHandler);
export const DELETE = withAccount(DELETEHandler);
