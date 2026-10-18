import { withAccount } from '@/lib/auth/route';
import { NextResponse } from 'next/server';
import {
  findRectificationSession,
  removeRectificationSession,
} from '@/lib/rectification/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

async function GETHandler(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = findRectificationSession(id);
  if (!session) return NextResponse.json({ error: '校时会话不存在' }, { status: 404 });
  return NextResponse.json({ session });
}

async function DELETEHandler(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!removeRectificationSession(id)) {
    return NextResponse.json({ error: '校时会话不存在' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}

export const GET = withAccount(GETHandler);
export const DELETE = withAccount(DELETEHandler);
