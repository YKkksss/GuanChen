'use client';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { ChatSession, type SavedChatMessage } from '@/lib/chat/session';

export function useConversationChat(conversationId: string, kind: 'ziwei' | 'bazi' = 'ziwei', initialMessages?: SavedChatMessage[], extractEvents = false) {
  const session = useMemo(() => new ChatSession(`${kind === 'bazi' ? '/api/bazi/conversations' : '/api/conversations'}/${conversationId}`, extractEvents), [conversationId, kind, extractEvents]);
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => session.attach(), [session]);
  useEffect(() => { if (initialMessages && !session.getSnapshot().ready) session.hydrate(initialMessages); }, [initialMessages, session]);
  return { ...state, session, busy: state.phase !== 'idle' };
}
export type ConversationChat = ReturnType<typeof useConversationChat>;
