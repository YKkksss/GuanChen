import { NextResponse } from 'next/server';
import {
  findRectificationEventMatrix,
  removeRectificationEvent,
  reviseRectificationEventEvidence,
} from '@/lib/rectification/event-service';
import type { RectificationEventEvidenceQuality } from '@/lib/rectification/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string; eventId: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const { id, eventId } = await context.params;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.userConfirmed !== 'boolean' || typeof body.evidenceQuality !== 'string') {
      return NextResponse.json({ error: '必须提供 userConfirmed 和 evidenceQuality' }, { status: 400 });
    }
    const event = reviseRectificationEventEvidence({
      sessionId: id,
      eventId,
      evidenceQuality: body.evidenceQuality as RectificationEventEvidenceQuality,
      userConfirmed: body.userConfirmed,
    });
    if (!event) return NextResponse.json({ error: '校时事件不存在' }, { status: 404 });
    const readiness = findRectificationEventMatrix(id).readiness;
    return NextResponse.json({ event, readiness });
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新校时事件失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const { id, eventId } = await context.params;
  if (!removeRectificationEvent(id, eventId)) {
    return NextResponse.json({ error: '校时事件不存在' }, { status: 404 });
  }
  return new Response(null, { status: 204 });
}
