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
export function useSmartChatScroll<T extends HTMLElement>(contentVersion: unknown, autoFollow = true, reduceMotion = false) {
  const scrollRef = useRef<T | null>(null);
  const [scrollElement, setScrollElement] = useState<T | null>(null);
  const attachScrollElement = useCallback((element: T | null) => {
    scrollRef.current = element;
    setScrollElement(element);
  }, []);
  const followingRef = useRef(true);
  const autoFollowRef = useRef(autoFollow);
  autoFollowRef.current = autoFollow;
  const viewportRef = useRef({ width: 0, height: 0 });
  const [showLatestButton, setShowLatestButton] = useState(false);

  const updateFollowingState = useCallback((following: boolean) => {
    followingRef.current = following;
    setShowLatestButton(!following);
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const element = scrollRef.current;
    updateFollowingState(true);
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: reduceMotion ? 'auto' : behavior });
  }, [updateFollowingState, reduceMotion]);

  const handleScroll = useCallback<UIEventHandler<T>>((event) => {
    const element = event.currentTarget;
    // 隐藏面板和重新排版也会触发滚动，不能把它们当作用户离开底部。
    const viewport = viewportRef.current;
    if (!element.clientHeight || !element.clientWidth
      || viewport.width !== element.clientWidth || viewport.height !== element.clientHeight) return;
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
    if (!autoFollow) {
      const element = scrollRef.current;
      if (element?.clientHeight) updateFollowingState(isNearScrollBottom(element, BOTTOM_THRESHOLD));
      return;
    }
    if (!followingRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (autoFollowRef.current && followingRef.current) scrollToLatest('auto');
    });
    return () => window.cancelAnimationFrame(frame);
  }, [contentVersion, scrollElement, scrollToLatest, autoFollow, updateFollowingState]);

  // 分栏或专注视图改变可视区域时，仍在追随新消息的读者保持在底部。
  useEffect(() => {
    // 八字等页面会先显示加载状态，再挂载聊天容器。
    const element = scrollElement;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      viewportRef.current = { width: element.clientWidth, height: element.clientHeight };
      if (element.clientHeight && element.clientWidth && autoFollowRef.current && followingRef.current) scrollToLatest('auto');
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [scrollElement, scrollToLatest]);

  return {
    scrollRef: attachScrollElement,
    showLatestButton,
    handleScroll,
    handleWheel,
    handleTouchMove,
    handleKeyDown,
    scrollToLatest,
  };
}
