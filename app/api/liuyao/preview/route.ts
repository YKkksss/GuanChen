import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { calculateLiuyao,LiuyaoError } from '@/lib/liuyao/engine';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function POSTHandler(request:Request){let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:'请提交有效JSON'},{status:400});}try{return NextResponse.json({result:calculateLiuyao(body)});}catch(e){return NextResponse.json({error:e instanceof LiuyaoError?e.message:'起卦计算失败，请稍后重试'},{status:e instanceof LiuyaoError?e.status:500});}}
export const POST=withAccount(POSTHandler);
