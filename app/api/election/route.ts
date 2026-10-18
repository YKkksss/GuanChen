import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { createElectionPlan, listElectionPlans } from '@/lib/db/election';
import { ElectionError } from '@/lib/election/engine';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function GETHandler(_request:Request) { return NextResponse.json({ plans:listElectionPlans() }); }
async function POSTHandler(request:Request) { let body:unknown; try { body = await request.json(); } catch { return NextResponse.json({ error:'请提交有效 JSON' },{ status:400 }); } try { const r = createElectionPlan(body); return NextResponse.json(r,{ status:r.reused ? 200 : 201 }); } catch (e) { return NextResponse.json({ error:e instanceof ElectionError ? e.message : '方案保存失败，请稍后重试' },{ status:e instanceof ElectionError ? e.status : 500 }); } }
export const GET = withAccount(GETHandler);
export const POST = withAccount(POSTHandler);
