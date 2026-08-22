import { NextResponse } from 'next/server';
import type { ReminderInstanceStatus } from '@/lib/reminders/types';
import { listReminderInstances } from '@/lib/db/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statusValue = url.searchParams.get('status');
    const status = statusValue === 'pending' || statusValue === 'completed' || statusValue === 'dismissed'
      ? statusValue as ReminderInstanceStatus
      : undefined;
    const beforeValue = url.searchParams.get('before');
    const afterValue = url.searchParams.get('after');
    const limit = Number(url.searchParams.get('limit') || 100);
    const offset = Number(url.searchParams.get('offset') || 0);
    const before = beforeValue === null ? undefined : Number(beforeValue);
    const after = afterValue === null ? undefined : Number(afterValue);
    return NextResponse.json({
      instances: listReminderInstances({
        ruleId: url.searchParams.get('ruleId') ?? undefined,
        conversationId: url.searchParams.get('conversationId') ?? undefined,
        status,
        dueOnly: url.searchParams.get('dueOnly') === 'true',
        before: Number.isFinite(before) ? before : undefined,
        after: Number.isFinite(after) ? after : undefined,
        limit: Number.isFinite(limit) ? limit : 100,
        offset: Number.isFinite(offset) ? offset : 0,
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '提醒实例加载失败' }, { status: 500 });
  }
}
