'use client';

import { useEffect } from 'react';
import { useAccount } from './AccountProvider';

const SESSION_CHECK_KEY = 'ziwei-backup-auto-check-v1';

export default function AutomaticBackupBootstrap() {
  const user = useAccount();
  useEffect(() => {
    if (!user) return;
    const key = `${SESSION_CHECK_KEY}:${user.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, new Date().toISOString());
    } catch {
      // 浏览器禁用会话存储时仍允许本次后台检查。
    }
    void fetch('/api/backups/auto-check', {
      method: 'POST',
      cache: 'no-store',
      keepalive: true,
    }).catch(() => undefined);
  }, [user]);

  return null;
}
