'use client';

import { useCallback, useEffect } from 'react';

const DEFAULT_MESSAGE = '当前有未保存的修改，确定离开吗？';

/**
 * 为长文本编辑提供统一的离开保护。
 * 组件内切换动作可调用返回函数；刷新、关闭标签页则交给浏览器原生提示。
 */
export function useUnsavedChanges(dirty: boolean, message = DEFAULT_MESSAGE) {
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirty]);

  return useCallback(() => !dirty || window.confirm(message), [dirty, message]);
}
