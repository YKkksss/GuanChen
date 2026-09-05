'use client';

import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { CHAT_SPLIT_DEFAULT, CHAT_SPLIT_GAP, CHAT_SPLIT_STORAGE_KEY, measureChatSplit, readChatSplitPreference } from './chat-split';

export function useChatSplit(enabled: boolean) {
  const gridRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const ratioRef = useRef(CHAT_SPLIT_DEFAULT);
  const dragRef = useRef<{ pointerId: number; right: number; width: number; startRatio: number } | null>(null);
  const frameRef = useRef(0);

  const apply = () => {
    const grid = gridRef.current;
    const divider = dividerRef.current;
    if (!grid || !divider) return;
    const measured = measureChatSplit(grid.clientWidth, ratioRef.current);
    grid.style.setProperty('--chat-pane-width', `${measured.chatWidth}px`);
    divider.setAttribute('aria-valuenow', measured.ratio.toFixed(2));
    divider.setAttribute('aria-valuemin', measured.min.toFixed(2));
    divider.setAttribute('aria-valuemax', measured.max.toFixed(2));
    divider.setAttribute('aria-valuetext', `对话占两栏宽度的 ${Math.round(measured.ratio)}%`);
  };
  const save = () => {
    try { localStorage.setItem(CHAT_SPLIT_STORAGE_KEY, String(ratioRef.current)); } catch { /* 浏览器禁止存储时仍可调整当前布局。 */ }
  };
  const reset = () => { ratioRef.current = CHAT_SPLIT_DEFAULT; apply(); save(); };
  const finishDrag = (cancel = false) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    cancelAnimationFrame(frameRef.current);
    if (cancel) ratioRef.current = drag.startRatio;
    apply();
    gridRef.current?.removeAttribute('data-resizing');
    if (dividerRef.current?.hasPointerCapture(drag.pointerId)) dividerRef.current.releasePointerCapture(drag.pointerId);
    if (!cancel) save();
  };

  useEffect(() => {
    if (!enabled) return;
    try { ratioRef.current = readChatSplitPreference(localStorage.getItem(CHAT_SPLIT_STORAGE_KEY)); } catch { /* 使用默认分栏。 */ }
    apply();
    const observer = new ResizeObserver(() => { finishDrag(true); apply(); });
    if (gridRef.current) observer.observe(gridRef.current);
    return () => { observer.disconnect(); cancelAnimationFrame(frameRef.current); };
  }, [enabled]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !gridRef.current) return;
    const rect = gridRef.current.getBoundingClientRect();
    if (!measureChatSplit(rect.width, ratioRef.current).canSplit) return;
    event.preventDefault(); event.currentTarget.focus();
    dragRef.current = { pointerId: event.pointerId, right: rect.right, width: rect.width, startRatio: ratioRef.current };
    event.currentTarget.setPointerCapture(event.pointerId);
    gridRef.current.setAttribute('data-resizing', 'true');
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    ratioRef.current = measureChatSplit(drag.width, (drag.right - event.clientX - CHAT_SPLIT_GAP / 2) / (drag.width - CHAT_SPLIT_GAP) * 100).ratio;
    cancelAnimationFrame(frameRef.current);
    // 连续拖动只更新样式，不让命盘及聊天树随指针每帧重新渲染。
    frameRef.current = requestAnimationFrame(apply);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && dragRef.current) { event.preventDefault(); event.stopPropagation(); finishDrag(true); return; }
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Enter') { reset(); return; }
    const width = gridRef.current?.clientWidth ?? 0;
    const current = measureChatSplit(width, ratioRef.current);
    if (!current.canSplit) return;
    const next = event.key === 'Home' ? current.min : event.key === 'End' ? current.max : current.ratio + (event.key === 'ArrowLeft' ? 2 : -2);
    ratioRef.current = measureChatSplit(width, next).ratio; apply(); save();
  };
  return { gridRef, dividerRef, reset, dividerEvents: { onPointerDown, onPointerMove,
    onPointerUp: () => finishDrag(), onPointerCancel: () => finishDrag(true), onLostPointerCapture: () => finishDrag(true), onKeyDown, onDoubleClick: reset } };
}
