import { cancelChatRequest } from '@/lib/chat/cancel-route';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return cancelChatRequest(request, (await context.params).id, 'bazi');
}
