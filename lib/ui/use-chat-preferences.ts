'use client';

import { useEffect, useState } from 'react';
import { CHAT_PREFERENCES_KEY, DEFAULT_CHAT_PREFERENCES, normalizeChatPreferences, readChatPreferences, serializeChatPreferences, type ChatPreferences } from './chat-preferences';

export function useChatPreferences(enabled: boolean) {
  const [saved, setSaved] = useState<ChatPreferences>({ ...DEFAULT_CHAT_PREFERENCES });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try { setSaved(readChatPreferences(localStorage.getItem(CHAT_PREFERENCES_KEY))); } catch { /* 存储受限时使用默认外观。 */ }
    setReady(true);
    const sync = (event: StorageEvent) => {
      if (event.key === CHAT_PREFERENCES_KEY || event.key === null) setSaved(readChatPreferences(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [enabled]);

  const save = (preferences: ChatPreferences) => {
    const next = normalizeChatPreferences(preferences);
    setSaved(next);
    try { localStorage.setItem(CHAT_PREFERENCES_KEY, serializeChatPreferences(next)); return true; } catch { return false; }
  };
  return { saved, save, ready };
}
