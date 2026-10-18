'use client';
import { useState } from 'react';
import { announceAccountChange, clearPrivateBrowserDrafts, useAccount } from './AccountProvider';
export default function AccountSettings() {
  const user = useAccount();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    if (form.get('newPassword') !== form.get('confirmation')) { setError('两次新密码输入不一致'); return; }
    setBusy(true);
    try {
      const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oldPassword: form.get('oldPassword'), newPassword: form.get('newPassword') }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      clearPrivateBrowserDrafts(); announceAccountChange(); window.location.replace('/login?passwordChanged=1');
    } catch (error) { setError(error instanceof Error ? error.message : '修改失败'); setBusy(false); }
  };
  return <main className="account-page"><section className="account-card"><h1>账号设置</h1><p>{user?.displayName} · {user?.username}</p><h2>修改密码</h2><p>修改后，所有设备上的登录都会失效，需要使用新密码重新登录。</p><form onSubmit={submit}>
    <label>当前密码<input type="password" name="oldPassword" autoComplete="current-password" required maxLength={128} /></label>
    <label>新密码<input type="password" name="newPassword" autoComplete="new-password" required minLength={10} maxLength={128} /></label>
    <label>确认新密码<input type="password" name="confirmation" autoComplete="new-password" required minLength={10} maxLength={128} /></label>
    {error && <p className="account-error" role="alert">{error}</p>}
    <button className="account-primary" disabled={busy}>{busy ? '正在修改…' : '修改密码并重新登录'}</button>
  </form></section></main>;
}
