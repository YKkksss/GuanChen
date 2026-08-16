import { NextResponse } from 'next/server';
import {
  findRectificationSession,
  removeRectificationSession,
} from '@/lib/rectification/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const session = findRectificationSession(id);
  if (!session) return NextResponse.json({ error: '校时会话不存在' }, { status: 404 });
  return NextResponse.json({ session });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!removeRectificationSession(id)) {
    return NextResponse.json({ error: '校时会话不存在' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
