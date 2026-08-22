import { NextResponse } from 'next/server';
import type { CreateReminderRuleInput, ReminderKind, ReminderRuleStatus } from '@/lib/reminders/types';
import { REMINDER_KINDS } from '@/lib/reminders/types';
import { createReminderRule, listReminderRules } from '@/lib/db/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const statusValue = url.searchParams.get('status');
    const kindValue = url.searchParams.get('kind');
    const status = statusValue === 'enabled' || statusValue === 'disabled' || statusValue === 'archived'
      ? statusValue as ReminderRuleStatus
      : undefined;
    const kind = kindValue && REMINDER_KINDS.includes(kindValue as ReminderKind)
      ? kindValue as ReminderKind
      : undefined;
    const limit = Number(url.searchParams.get('limit') || 50);
    const offset = Number(url.searchParams.get('offset') || 0);
    return NextResponse.json({
      rules: listReminderRules({
        status,
        kind,
        conversationId: url.searchParams.get('conversationId') ?? undefined,
        limit: Number.isFinite(limit) ? limit : 50,
        offset: Number.isFinite(offset) ? offset : 0,
      }),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '提醒规则加载失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as CreateReminderRuleInput;
    if (!REMINDER_KINDS.includes(body.kind)) {
      return NextResponse.json({ error: '提醒类型无效' }, { status: 400 });
    }
    const rule = createReminderRule(body);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '提醒规则创建失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
