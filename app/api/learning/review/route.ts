import { withAccount } from '@/lib/auth/route';
import { NextResponse } from 'next/server';
import { getReviewItems } from '@/lib/learning/practice-service';
import type { LearningReviewStatus } from '@/lib/learning/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function GETHandler(request: Request) {
  const value = new URL(request.url).searchParams.get('status');
  const status: LearningReviewStatus | undefined = value === 'due' || value === 'reviewing' || value === 'mastered' ? value : undefined;
  return NextResponse.json(getReviewItems(status));
}

export const GET = withAccount(GETHandler);
