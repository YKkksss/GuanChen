import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { ElectionError } from '@/lib/election/engine';
import { calculatePersonalElection as calculateElection } from '@/lib/election/personal-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
async function POSTHandler(request:Request) { let body:unknown; try { body = await request.json(); } catch { return NextResponse.json({ error:'请提交有效 JSON' },{ status:400 }); } try { return NextResponse.json({ result:calculateElection(body) }); } catch (e) { return NextResponse.json({ error:e instanceof ElectionError ? e.message : '择日计算失败，请稍后重试' },{ status:e instanceof ElectionError ? e.status : 500 }); } }
export const POST = withAccount(POSTHandler);
