import { NextResponse } from 'next/server';
import { parseLifeEventInput } from '@/lib/events/validation';
import {
  attachRectificationEvent,
  findRectificationEventMatrix,
} from '@/lib/rectification/event-service';
import type {
  AttachRectificationEventInput,
  RectificationEventEvidenceQuality,
} from '@/lib/rectification/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const matrix = findRectificationEventMatrix(id);
    return NextResponse.json({ events: matrix.events, readiness: matrix.readiness });
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取校时事件失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = await request.json() as Record<string, unknown>;
    const input: AttachRectificationEventInput = {
      evidenceQuality: body.evidenceQuality as RectificationEventEvidenceQuality,
      userConfirmed: typeof body.userConfirmed === 'boolean' ? body.userConfirmed : undefined,
      ...(typeof body.lifeEventId === 'string' ? { lifeEventId: body.lifeEventId.trim() } : {}),
      ...(body.event && typeof body.event === 'object'
        ? { event: parseLifeEventInput(body.event as Record<string, unknown>) }
        : {}),
    };
    const event = attachRectificationEvent(id, input);
    const readiness = findRectificationEventMatrix(id).readiness;
    return NextResponse.json({ event, readiness }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : '关联校时事件失败';
    return NextResponse.json({ error: message }, { status: message.includes('不存在') ? 404 : 400 });
  }
}
