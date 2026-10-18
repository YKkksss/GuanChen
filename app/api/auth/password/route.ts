import { NextResponse } from 'next/server';
import { changePassword } from '@/lib/auth/accounts';
import { accountError, sessionCookie, withAccount } from '@/lib/auth/route';
import { currentUser } from '@/lib/auth/scope';
export const runtime = 'nodejs';
export const POST = withAccount(async (request: Request) => {
  try {
    const body = await request.json();
    await changePassword(currentUser()!.id, body.oldPassword, body.newPassword);
    return sessionCookie(NextResponse.json({ success: true }), request, '', true);
  } catch (error) { return accountError(error); }
});
