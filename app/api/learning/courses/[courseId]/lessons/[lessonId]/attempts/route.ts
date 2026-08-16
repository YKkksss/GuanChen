import { NextResponse } from 'next/server';
import { submitCourseLessonAttempt } from '@/lib/learning/course-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ courseId: string; lessonId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const { courseId, lessonId } = await context.params;
  try {
    const body = await request.json() as { answers?: unknown };
    if (!body.answers || typeof body.answers !== 'object' || Array.isArray(body.answers)) {
      return NextResponse.json({ error: '答题内容无效' }, { status: 400 });
    }
    return NextResponse.json(submitCourseLessonAttempt(
      courseId,
      lessonId,
      body.answers as Record<string, string>,
    ));
  } catch (error) {
    const message = error instanceof Error ? error.message : '章节答题提交失败';
    const status = message.includes('不存在') ? 404 : message.includes('前置章节') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
