'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { getChatInputHeight, type ChatPreferences } from './chat-preferences';

export function useChatInputSize(enabled: boolean, input: string, preferences: ChatPreferences) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { fontSize, font, autoGrow, maxRows } = preferences;
  const resize = useCallback(() => {
    const element = inputRef.current;
    if (!enabled || !element || !element.clientWidth) return;
    element.style.height = '0px';
    const style = getComputedStyle(element);
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const panel = element.closest('.eastern-insight-panel');
    element.style.height = `${getChatInputHeight({
      contentHeight: element.scrollHeight + border,
      lineHeight: parseFloat(style.lineHeight),
      verticalPadding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + border,
      panelHeight: panel?.clientHeight ?? window.innerHeight,
      autoGrow, maxRows,
    })}px`;
    element.style.overflowY = element.scrollHeight > element.clientHeight ? 'auto' : 'hidden';
  }, [enabled, autoGrow, maxRows]);

  useLayoutEffect(resize, [resize, input, fontSize, font]);
  useEffect(() => {
    const element = inputRef.current;
    if (!enabled || !element) return;
    const observer = new ResizeObserver(resize);
    const panel = element.closest('.eastern-insight-panel');
    if (element.parentElement) observer.observe(element.parentElement);
    if (panel) observer.observe(panel);
    return () => observer.disconnect();
  }, [enabled, resize]);
  return inputRef;
}
