import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { sendMeihuaMessage } from '@/lib/meihua/chat';
import { MeihuaError } from '@/lib/meihua/engine';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function POSTHandler(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:'请提交有效JSON'},{status:400});}try{const detail=await sendMeihuaMessage(id,body,request.signal);return NextResponse.json({detail},{status:detail.turns.some(t=>t.status==='generating')?202:200});}catch(e){return NextResponse.json({error:e instanceof MeihuaError?e.message:'回复失败，请稍后重试'},{status:e instanceof MeihuaError?e.status:500});}}
export const POST=withAccount(POSTHandler);
