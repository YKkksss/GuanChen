'use client';
import { useEffect, useState } from 'react';
import { announceAccountChange, clearPrivateBrowserDrafts, useAccount } from './AccountProvider';

type AiStatus = {
  configured: boolean;
  provider: string;
  model: string | null;
  dailyLimit: number;
  usage: { used: number; limit: number };
};

export default function AccountSettings() {
  const user = useAccount();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [aiError, setAiError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/ai/status', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('status')))
      .then((data: AiStatus) => setAi(data))
      .catch(() => { if (!controller.signal.aborted) setAiError('暂时无法读取 AI 配置状态。'); });
    return () => controller.abort();
  }, []);

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

  return <main className="account-page"><section className="account-card"><h1>账号设置</h1><p>{user?.displayName} · {user?.username}</p>

    <h2>AI 服务</h2>
    {aiError ? <p className="account-error" role="alert">{aiError}</p> : !ai ? <p role="status">正在检查 AI 配置…</p> : <>
      <p role="status">{ai.configured
        ? `已配置：${ai.provider}${ai.model ? ` / ${ai.model}` : ''}。`
        : '尚未配置 AI。命盘、排盘、择日、备份等规则功能仍可使用；AI 问答与报告需要部署者在服务器 .env.local 中配置供应商密钥。'}</p>
      {ai.configured && <p>今日已用 {ai.usage.used}{ai.usage.limit > 0 ? ` / ${ai.usage.limit}` : '（不限次数）'} 次 AI 调用。</p>}
      <p><small>密钥只在服务器 <code>.env.local</code> 中配置，页面不会显示或保存密钥。修改密钥后需要重启服务。</small></p>
    </>}

    <h2>修改密码</h2><p>修改后，所有设备上的登录都会失效，需要使用新密码重新登录。</p><form onSubmit={submit}>
      <label>当前密码<input type="password" name="oldPassword" autoComplete="current-password" required maxLength={128} /></label>
      <label>新密码<input type="password" name="newPassword" autoComplete="new-password" required minLength={10} maxLength={128} /></label>
      <label>确认新密码<input type="password" name="confirmation" autoComplete="new-password" required minLength={10} maxLength={128} /></label>
      {error && <p className="account-error" role="alert">{error}</p>}
      <button className="account-primary" disabled={busy}>{busy ? '正在修改…' : '修改密码并重新登录'}</button>
    </form></section></main>;
}
