import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { createQimenSession,listQimenSessions } from '@/lib/db/qimen';
import { beijingDateTime,QimenError } from '@/lib/qimen/engine';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function GETHandler(_request:Request){return NextResponse.json({sessions:listQimenSessions(),dateTime:beijingDateTime()});}
async function POSTHandler(request:Request){let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:'请提交有效JSON'},{status:400});}try{const v=createQimenSession(body);return NextResponse.json(v,{status:v.reused?200:201});}catch(e){return NextResponse.json({error:e instanceof QimenError?e.message:'盘面保存失败，请稍后重试'},{status:e instanceof QimenError?e.status:500});}}
export const GET=withAccount(GETHandler);export const POST=withAccount(POSTHandler);
