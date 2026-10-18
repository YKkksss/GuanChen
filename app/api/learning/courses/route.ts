import { withAccount } from '@/lib/auth/route';
import { NextResponse } from 'next/server';
import { listCourseOverviews } from '@/lib/learning/course-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(_request: Request) {
  return NextResponse.json({ courses: listCourseOverviews() });
}

export const GET = withAccount(GETHandler);
