import { NextResponse } from 'next/server';
import { getReviewItems } from '@/lib/learning/practice-service';
import type { LearningReviewStatus } from '@/lib/learning/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get('status');
  const status: LearningReviewStatus | undefined = value === 'due' || value === 'reviewing' || value === 'mastered' ? value : undefined;
  return NextResponse.json(getReviewItems(status));
}
