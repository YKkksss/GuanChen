import { NextResponse } from 'next/server';
import { calculateBazi } from '@/lib/bazi';
import type { BaziCalculationInput } from '@/lib/bazi';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json() as BaziCalculationInput;
    return NextResponse.json({ result: calculateBazi(body) });
  } catch (error) {
    const message = error instanceof Error ? error.message : '八字排盘失败';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
