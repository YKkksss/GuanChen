import { NextResponse } from 'next/server';
import type { ReminderInstanceStatus } from '@/lib/reminders/types';
import { getReminderInstance, setReminderInstanceStatus } from '@/lib/db/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const instance = getReminderInstance(id);
  return instance
    ? NextResponse.json({ instance })
    : NextResponse.json({ error: '提醒实例不存在' }, { status: 404 });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { status?: ReminderInstanceStatus };
    if (body.status !== 'pending' && body.status !== 'completed' && body.status !== 'dismissed') {
      return NextResponse.json({ error: '提醒实例状态无效' }, { status: 400 });
    }
    const instance = setReminderInstanceStatus(id, body.status);
    return instance
      ? NextResponse.json({ instance })
      : NextResponse.json({ error: '提醒实例不存在' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '提醒实例更新失败' }, { status: 400 });
  }
}
