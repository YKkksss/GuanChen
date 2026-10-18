import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { deleteQimenSession } from '@/lib/db/qimen';
import { getQimenDetail,stopQimenMessage } from '@/lib/qimen/chat';
import { QimenError } from '@/lib/qimen/engine';
export const runtime='nodejs';export const dynamic='force-dynamic';
type Context={params:Promise<{id:string}>};
async function GETHandler(request:Request,context:Context){const {id}=await context.params,before=new URL(request.url).searchParams.get('beforeSequence');if(before!==null&&(!/^\d+$/.test(before)||!Number.isSafeInteger(Number(before))||Number(before)<1))return NextResponse.json({error:'历史位置不正确'},{status:400});try{return NextResponse.json({detail:getQimenDetail(id,before===null?undefined:Number(before))});}catch(e){return NextResponse.json({error:e instanceof QimenError?e.message:'盘面读取失败，请稍后重试'},{status:e instanceof QimenError?e.status:500});}}
async function DELETEHandler(_request:Request,context:Context){const {id}=await context.params;try{const d=getQimenDetail(id);for(const t of d.turns.filter(t=>t.status==='generating'))stopQimenMessage(id,t.id);deleteQimenSession(id);return NextResponse.json({deleted:true});}catch(e){return NextResponse.json({error:e instanceof QimenError?e.message:'移除失败，请稍后重试'},{status:e instanceof QimenError?e.status:500});}}
export const GET=withAccount(GETHandler);export const DELETE=withAccount(DELETEHandler);
