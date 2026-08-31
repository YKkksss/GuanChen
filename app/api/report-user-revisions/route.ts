import { NextResponse } from 'next/server';
import { getReportUserRevision, saveReportUserRevision } from '@/lib/db/report-user-revisions';
import {
  normalizeEditedContent,
  resolveReportRevisionSource,
} from '@/lib/report-revisions/service';
import {
  isReportRevisionSourceKind,
  isReportReviewStatus,
} from '@/lib/report-revisions/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const parsed = parseIdentity({
    sourceKind: params.get('sourceKind'),
    reportId: params.get('reportId'),
    version: params.get('version'),
  });
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const source = resolveReportRevisionSource(parsed);
    const revision = getReportUserRevision(source.sourceKind, source.versionId);
    return NextResponse.json({ revision, sourceVersionId: source.versionId });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({})) as {
    sourceKind?: unknown;
    reportId?: unknown;
    version?: unknown;
    reviewStatus?: unknown;
    note?: unknown;
    editedContent?: unknown;
  };
  const parsed = parseIdentity(body);
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isReportReviewStatus(body.reviewStatus)) {
    return NextResponse.json({ error: '报告确认状态无效' }, { status: 400 });
  }
  if (typeof body.note !== 'string') {
    return NextResponse.json({ error: '个人备注格式无效' }, { status: 400 });
  }
  const note = body.note.replace(/\r\n/g, '\n').trim();
  if (note.length > 4_000) {
    return NextResponse.json({ error: '个人备注不能超过 4000 个字符' }, { status: 400 });
  }

  try {
    const source = resolveReportRevisionSource(parsed);
    const editedContent = normalizeEditedContent(source.originalContent, body.editedContent ?? null);
    const revision = saveReportUserRevision({
      sourceKind: source.sourceKind,
      sourceReportId: source.reportId,
      sourceVersionId: source.versionId,
      sourceVersion: source.version,
      reviewStatus: body.reviewStatus,
      note,
      editedContent,
    });
    return NextResponse.json({ revision });
  } catch (error) {
    return errorResponse(error);
  }
}

function parseIdentity(input: {
  sourceKind?: unknown;
  reportId?: unknown;
  version?: unknown;
}): { sourceKind: 'topic' | 'heming' | 'annual' | 'rectification'; reportId: string; version?: number } | { error: string } {
  if (!isReportRevisionSourceKind(input.sourceKind)) return { error: '报告来源类型无效' };
  const reportId = typeof input.reportId === 'string' ? input.reportId.trim() : '';
  if (!reportId) return { error: '报告编号不能为空' };
  const rawVersion = input.version;
  const version = rawVersion === undefined || rawVersion === null || rawVersion === ''
    ? undefined
    : Number(rawVersion);
  if (version !== undefined && (!Number.isInteger(version) || version < 1)) {
    return { error: '报告版本无效' };
  }
  return { sourceKind: input.sourceKind, reportId, version };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '报告确认与修订操作失败';
  const status = message.includes('不存在') ? 404
    : message.includes('只有已完成') || message.includes('不一致') ? 409
      : 400;
  return NextResponse.json({ error: message.slice(0, 240) }, { status });
}
