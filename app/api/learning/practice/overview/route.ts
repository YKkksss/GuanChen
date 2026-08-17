import { NextResponse } from 'next/server';
import { getLearningPracticeOverview } from '@/lib/learning/practice-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ overview: getLearningPracticeOverview() });
}
