import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { calculateQimen,QimenError } from '@/lib/qimen/engine';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function POSTHandler(request:Request){let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:'请提交有效JSON'},{status:400});}try{return NextResponse.json({result:calculateQimen(body)});}catch(e){return NextResponse.json({error:e instanceof QimenError?e.message:'起盘计算失败，请稍后重试'},{status:e instanceof QimenError?e.status:500});}}
export const POST=withAccount(POSTHandler);
