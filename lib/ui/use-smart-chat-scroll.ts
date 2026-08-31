'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEventHandler,
  type TouchEventHandler,
  type UIEventHandler,
  type WheelEventHandler,
} from 'react';
import { isNearScrollBottom } from './chat-scroll';

const BOTTOM_THRESHOLD = 24;

/**
 * 聊天消息的智能跟随：贴近底部时跟随流式输出，用户上滑后立即暂停。
 */
export function useSmartChatScroll<T extends HTMLElement>(contentVersion: unknown) {
  const scrollRef = useRef<T>(null);
  const followingRef = useRef(true);
  const [showLatestButton, setShowLatestButton] = useState(false);

  const updateFollowingState = useCallback((following: boolean) => {
    followingRef.current = following;
    setShowLatestButton(!following);
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = scrollRef.current;
    updateFollowingState(true);
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
  }, [updateFollowingState]);

  const handleScroll = useCallback<UIEventHandler<T>>((event) => {
    const element = event.currentTarget;
    updateFollowingState(isNearScrollBottom(element, BOTTOM_THRESHOLD));
  }, [updateFollowingState]);

  const handleWheel = useCallback<WheelEventHandler<T>>((event) => {
    if (event.deltaY < 0 && event.currentTarget.scrollHeight > event.currentTarget.clientHeight) {
      updateFollowingState(false);
    }
  }, [updateFollowingState]);

  const handleTouchMove = useCallback<TouchEventHandler<T>>((event) => {
    if (event.currentTarget.scrollHeight > event.currentTarget.clientHeight) {
      updateFollowingState(false);
    }
  }, [updateFollowingState]);

  const handleKeyDown = useCallback<KeyboardEventHandler<T>>((event) => {
    if (
      ['ArrowUp', 'PageUp', 'Home'].includes(event.key)
      && event.currentTarget.scrollHeight > event.currentTarget.clientHeight
    ) {
      updateFollowingState(false);
    }
  }, [updateFollowingState]);

  // 流式内容持续增长时，只为仍在底部的用户跟随最新内容。
  useEffect(() => {
    if (!followingRef.current) return;
    const frame = window.requestAnimationFrame(() => scrollToLatest('auto'));
    return () => window.cancelAnimationFrame(frame);
  }, [contentVersion, scrollToLatest]);

  return {
    scrollRef,
    showLatestButton,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleKeyDown,
    scrollToLatest,
  };
}
