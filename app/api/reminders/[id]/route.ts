import { NextResponse } from 'next/server';
import type { ReminderConfig, ReminderRuleStatus } from '@/lib/reminders/types';
import { deleteReminderRule, getReminderRule, updateReminderRule } from '@/lib/db/reminders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const rule = getReminderRule(id);
  return rule
    ? NextResponse.json({ rule })
    : NextResponse.json({ error: '提醒规则不存在' }, { status: 404 });
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json() as {
      title?: string;
      status?: ReminderRuleStatus;
      timezone?: string;
      config?: ReminderConfig;
    };
    if (body.status && !['enabled', 'disabled', 'archived'].includes(body.status)) {
      return NextResponse.json({ error: '提醒规则状态无效' }, { status: 400 });
    }
    const rule = updateReminderRule(id, body);
    return rule
      ? NextResponse.json({ rule })
      : NextResponse.json({ error: '提醒规则不存在' }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '提醒规则更新失败' }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  return deleteReminderRule(id)
    ? new Response(null, { status: 204 })
    : NextResponse.json({ error: '提醒规则不存在' }, { status: 404 });
}
