import { withAccount } from '@/lib/auth/route';
import { NextResponse } from 'next/server';
import { getLearningCourse } from '@/lib/learning/course-catalog';
import { buildCourseProgress } from '@/lib/learning/course-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface RouteContext { params: Promise<{ courseId: string }> }

async function GETHandler(_request: Request, context: RouteContext) {
  const { courseId } = await context.params;
  const course = getLearningCourse(courseId);
  if (!course) return NextResponse.json({ error: '学习课程不存在' }, { status: 404 });
  return NextResponse.json({ progress: buildCourseProgress(course) });
}

export const GET = withAccount(GETHandler);
