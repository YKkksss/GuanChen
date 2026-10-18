import { NextResponse } from 'next/server';
import { AccountError, countUsers, listUsers } from '@/lib/auth/accounts';
import { accountError, withAccount } from '@/lib/auth/route';
import { currentUser } from '@/lib/auth/scope';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = withAccount(async (request: Request) => {
  try {
    if (currentUser()!.role !== 'admin') throw new AccountError('需要管理员权限', 403);
    const params = new URL(request.url).searchParams;
    const query = params.get('q')?.trim().slice(0, 80) || '';
    const value = Number(params.get('offset') || 0);
    const offset = Number.isFinite(value) ? Math.max(Math.trunc(value), 0) : 0;
    return NextResponse.json({ users: listUsers({ query, offset }), total: countUsers(query), offset, limit: 20 });
  } catch (error) { return accountError(error); }
});
