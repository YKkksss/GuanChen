'use client';
import { useEffect } from 'react';

let locks = 0;
let originalOverflow = '';

/** 多个抽屉共用计数，最后一个关闭时才恢复页面滚动。 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (locks === 0) originalOverflow = document.body.style.overflow;
    locks += 1;
    document.body.style.overflow = 'hidden';
    return () => {
      locks -= 1;
      if (locks === 0) document.body.style.overflow = originalOverflow;
    };
  }, [active]);
}
