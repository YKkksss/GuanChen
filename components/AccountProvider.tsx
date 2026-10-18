'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { flushSync } from 'react-dom';
import { CaretDown, UserCircle } from '@phosphor-icons/react';
import type { AccountUser } from '@/lib/auth/scope';

const AccountContext = createContext<AccountUser | null>(null);
export const useAccount = () => useContext(AccountContext);
const PUBLIC_PATHS = ['/login', '/register', '/privacy', '/terms'];
export function announceAccountChange() {
  // 先卸载私密页面，再导航；即使未保存提示阻止导航，也不会留着前一账号的对话。
  flushSync(() => window.dispatchEvent(new Event('guanchen-session-ended')));
  try { localStorage.setItem('guanchen-account-change', `${Date.now()}:${Math.random()}`); } catch { /* 存储受限时仍通过完整页面导航切换账号。 */ }
}
export function clearPrivateBrowserDrafts() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (/^(ziwei-(learning-note|report-review|open-practice)-draft|guanchen-private:)/.test(key)) localStorage.removeItem(key);
    }
    for (const key of Object.keys(sessionStorage)) if (key.startsWith('ziwei-backup-auto-check-v1')) sessionStorage.removeItem(key);
  } catch { /* 浏览器禁止存储时不阻断登录与退出。 */ }
}

export default function AccountProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [user, setUser] = useState<AccountUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(false);
  const publicPage = PUBLIC_PATHS.includes(pathname);
  useEffect(() => {
    if (publicPage) return;
    let disposed = false;
    let identity: string | undefined;
    const conceal = () => { setChecked(false); setUser(null); };
    const check = async () => {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        if (!response.ok) throw new Error('session');
        const data = await response.json();
        if (disposed) return;
        if (!data.user) {
          clearPrivateBrowserDrafts();
          flushSync(conceal);
          window.location.replace(`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return;
        }
        if (identity && identity !== data.user.id) { flushSync(conceal); window.location.reload(); return; }
        identity = data.user.id;
        setUser(data.user); setChecked(true); setError(false);
      } catch { if (!disposed) { setError(true); setChecked(false); } }
    };
    const changed = (event: StorageEvent) => { if (event.key === 'guanchen-account-change') { flushSync(conceal); window.location.reload(); } };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) { setChecked(false); void check(); } };
    void check();
    window.addEventListener('focus', check);
    window.addEventListener('storage', changed);
    window.addEventListener('pageshow', restored);
    window.addEventListener('guanchen-session-ended', conceal);
    const interval = window.setInterval(check, 60_000);
    return () => { disposed = true; window.clearInterval(interval); window.removeEventListener('focus', check); window.removeEventListener('storage', changed); window.removeEventListener('pageshow', restored); window.removeEventListener('guanchen-session-ended', conceal); };
  }, [publicPage]);
  if (publicPage) return <>{children}</>;
  if (!checked || !user) return <main className="account-pending" role="status">{error ? <>暂时无法确认登录状态。<button onClick={() => window.location.reload()}>重新连接</button></> : '正在确认登录状态…'}</main>;
  return <AccountContext.Provider value={user}>{children}</AccountContext.Provider>;
}

export function AccountBar({ variant = 'bar' }: { variant?: 'bar' | 'inline' }) {
  const user = useAccount();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    menuRef.current?.removeAttribute('open');
  }, [pathname]);
  useEffect(() => {
    if (variant !== 'inline') return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) menuRef.current?.removeAttribute('open');
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menuRef.current?.open) {
        menuRef.current.open = false;
        menuRef.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [variant]);
  if (!user) return null;
  const logout = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('退出失败，请重试');
      clearPrivateBrowserDrafts(); announceAccountChange(); window.location.replace('/login');
    } catch { setError('退出失败，请重试'); setBusy(false); }
  };
  const controls = <>
    <span className="account-name" title={`当前账号：${user.displayName}`}>当前账号：{user.displayName}</span>
    <Link href="/settings/account">账号设置</Link>
    {user.role === 'admin' && <Link href="/settings/users">用户管理</Link>}
    <button type="button" disabled={busy} onClick={logout}>{busy ? '正在退出…' : '退出登录'}</button>
    {error && <span role="alert">{error}</span>}
  </>;
  return <div className={`account-bar${variant === 'inline' ? ' account-bar-inline' : ''}`} aria-label="当前账号">
    <div className="account-bar-content">{controls}</div>
    {variant === 'inline' && <details className="account-menu" ref={menuRef}>
      <summary aria-label={`当前账号：${user.displayName}，打开账号操作`}>
        <UserCircle size={22} aria-hidden="true" />
        <span>{user.displayName}</span>
        <CaretDown size={12} aria-hidden="true" />
      </summary>
      <div className="account-menu-panel">{controls}</div>
    </details>}
  </div>;
}
