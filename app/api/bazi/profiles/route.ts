import { NextResponse } from 'next/server';
import { createBaziBirthProfile, listBaziBirthProfiles } from '@/lib/db/bazi';
import type { CreateBaziBirthProfileInput } from '@/lib/bazi/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get('limit') || 50);
    const offset = Number(url.searchParams.get('offset') || 0);
    return NextResponse.json({
      profiles: listBaziBirthProfiles({
        limit: Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 50, 1), 100),
        offset: Math.max(Number.isFinite(offset) ? Math.trunc(offset) : 0, 0),
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '八字档案加载失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateBaziBirthProfileInput;
    const profile = createBaziBirthProfile(body);
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '八字档案创建失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
