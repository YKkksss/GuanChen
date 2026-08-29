import { NextResponse } from 'next/server';
import { deleteBaziBirthProfile, getBaziBirthProfile, updateBaziBirthProfile } from '@/lib/db/bazi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const profile = getBaziBirthProfile(id);
  if (!profile) return NextResponse.json({ error: '出生档案不存在' }, { status: 404 });
  return NextResponse.json({ profile });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { displayName?: unknown; locationLabel?: unknown; notes?: unknown };
    if (body.displayName === undefined && body.locationLabel === undefined && body.notes === undefined) {
      return NextResponse.json({ error: '没有可更新的档案字段' }, { status: 400 });
    }
    const profile = updateBaziBirthProfile(id, body);
    if (!profile) return NextResponse.json({ error: '出生档案不存在' }, { status: 404 });
    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '出生档案更新失败' }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!deleteBaziBirthProfile(id)) return NextResponse.json({ error: '出生档案不存在' }, { status: 404 });
  return new Response(null, { status: 204 });
}
