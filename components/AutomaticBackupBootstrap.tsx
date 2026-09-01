'use client';

import { useEffect } from 'react';

const SESSION_CHECK_KEY = 'ziwei-backup-auto-check-v1';

export default function AutomaticBackupBootstrap() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_CHECK_KEY)) return;
      sessionStorage.setItem(SESSION_CHECK_KEY, new Date().toISOString());
    } catch {
      // 浏览器禁用会话存储时仍允许本次后台检查。
    }
    void fetch('/api/backups/auto-check', {
      method: 'POST',
      cache: 'no-store',
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  return null;
}
