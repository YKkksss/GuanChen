import { NextResponse } from 'next/server';
import { startCourseLesson } from '@/lib/learning/course-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ courseId: string; lessonId: string }> }

export async function PUT(_request: Request, context: RouteContext) {
  const { courseId, lessonId } = await context.params;
  try {
    return NextResponse.json(startCourseLesson(courseId, lessonId));
  } catch (error) {
    const message = error instanceof Error ? error.message : '章节学习状态更新失败';
    const status = message.includes('不存在') ? 404 : message.includes('前置章节') ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
