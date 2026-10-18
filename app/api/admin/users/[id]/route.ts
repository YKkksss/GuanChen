import { NextResponse } from 'next/server';
import { updateUser } from '@/lib/auth/accounts';
import { accountError, withAccount } from '@/lib/auth/route';
import { currentUser } from '@/lib/auth/scope';
export const runtime = 'nodejs';
export const PATCH = withAccount(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  try {
    const { id } = await context.params;
    return NextResponse.json({ user: updateUser(currentUser()!.id, id, await request.json()) });
  } catch (error) { return accountError(error); }
});
