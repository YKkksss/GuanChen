import { withAccount } from '@/lib/auth/route';
import { NextResponse } from 'next/server';
import { getLearningPracticeOverview } from '@/lib/learning/practice-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(_request: Request) {
  return NextResponse.json({ overview: getLearningPracticeOverview() });
}

export const GET = withAccount(GETHandler);
