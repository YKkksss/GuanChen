import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { stopLiuyaoMessage } from '@/lib/liuyao/chat';
import { LiuyaoError } from '@/lib/liuyao/engine';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function POSTHandler(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:'请提交有效JSON'},{status:400});}if(!body||typeof body!=='object'||Array.isArray(body)||typeof(body as {turnId?:unknown}).turnId!=='string')return NextResponse.json({error:'请指定要停止的回复'},{status:400});try{return NextResponse.json({detail:stopLiuyaoMessage(id,(body as {turnId:string}).turnId)});}catch(e){return NextResponse.json({error:e instanceof LiuyaoError?e.message:'停止失败，请稍后重试'},{status:e instanceof LiuyaoError?e.status:500});}}
export const POST=withAccount(POSTHandler);
