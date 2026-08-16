import { NextResponse } from 'next/server';
import { listCourseOverviews } from '@/lib/learning/course-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ courses: listCourseOverviews() });
}
