import { withAccount } from '@/lib/auth/route';
import { cancelChatRequest } from '@/lib/chat/cancel-route';
export const runtime = 'nodejs';
async function POSTHandler(request: Request, context: { params: Promise<{ id: string }> }) {
  return cancelChatRequest(request, (await context.params).id, 'ziwei');
}

export const POST = withAccount(POSTHandler);
