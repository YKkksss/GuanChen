import { NextResponse } from 'next/server';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo } from '@/lib/ziwei/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const year = toInteger(body.year);
    const month = toInteger(body.month);
    const day = toInteger(body.day);
    const hour = toInteger(body.hour);
    const gender = body.gender === 'female' ? 'female' : 'male';

    if (!year || year < 1900 || year > 2100) {
      return error('出生年份需要在 1900-2100 之间');
    }
    if (!month || month < 1 || month > 12) {
      return error('出生月份不合法');
    }
    if (!day || day < 1 || day > 31) {
      return error('出生日期不合法');
    }
    if (hour === undefined || hour < 0 || hour > 11) {
      return error('出生时辰不合法');
    }

    const birthInfo: BirthInfo = {
      year,
      month,
      day,
      hour,
      gender,
      name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined,
      province: typeof body.province === 'string' && body.province.trim() ? body.province.trim() : undefined,
      city: typeof body.city === 'string' && body.city.trim() ? body.city.trim() : undefined,
      longitude: typeof body.longitude === 'number' ? body.longitude : undefined,
      unknownTime: body.unknownTime === true,
    };

    return NextResponse.json(generateChart(birthInfo));
  } catch (err) {
    const message = err instanceof Error ? err.message : '排盘失败';
    return error(message, 500);
  }
}

function toInteger(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(n) ? n : undefined;
}

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
