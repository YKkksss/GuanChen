import { NextResponse } from 'next/server';
import { withAccount } from '@/lib/auth/route';
import { listPersonalElectionCharts } from '@/lib/election/personal-service';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withAccount(async (_request: Request) => NextResponse.json({charts:listPersonalElectionCharts()}));
