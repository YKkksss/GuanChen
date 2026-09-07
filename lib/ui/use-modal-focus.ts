'use client';

import { useEffect, useRef } from 'react';

export function useModalFocus(open: boolean, onClose: () => void, fallbackFocus?: () => HTMLElement | null) {
  const container = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const fallback = useRef(fallbackFocus);
  fallback.current = fallbackFocus;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(container.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]') ?? []).filter(item => item.getClientRects().length > 0);
    (focusable()[0] ?? container.current)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (!controls.length) { event.preventDefault(); container.current?.focus(); return; }
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !container.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !container.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); (previous?.isConnected ? previous : fallback.current?.())?.focus(); };
  }, [open]);
  return container;
}
