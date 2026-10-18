'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Eye, EyeSlash, LockKey, Moon, ShieldCheck, SpinnerGap, Sun, User } from '@phosphor-icons/react';
import { announceAccountChange, clearPrivateBrowserDrafts } from './AccountProvider';
import { useTheme } from './ThemeProvider';
import { safeAccountDestination } from '@/lib/auth/redirect';
import authArtwork from '@/public/assets/auth/armillary.png';
import styles from './AuthForm.module.css';

export default function AuthForm({ register = false }: { register?: boolean }) {
  const { theme, toggle } = useTheme();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [visiblePassword, setVisiblePassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
    if (new URLSearchParams(window.location.search).has('passwordChanged')) setNotice('密码已修改，请使用新密码登录。');
    const controller = new AbortController();
    void fetch('/api/auth/session', { cache: 'no-store', signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('session')))
      .then(data => setEnabled(data.registrationEnabled))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    if (register && form.get('password') !== form.get('confirmation')) { setError('两次密码输入不一致，请重新确认。'); return; }
    setBusy(true);
    try {
      const response = await fetch(`/api/auth/${register ? 'register' : 'login'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.get('username'), password: form.get('password'), displayName: form.get('displayName') }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || '服务暂时不可用，请稍后重试。');
      if (!data?.user) throw new Error('暂时无法确认登录结果，请重试。');
      clearPrivateBrowserDrafts(); announceAccountChange();
      const next = new URLSearchParams(window.location.search).get('next');
      window.location.replace(safeAccountDestination(next, window.location.origin));
    } catch (error) { setError(error instanceof TypeError ? '连接失败，请检查网络后重试。' : error instanceof Error ? error.message : '连接失败，请稍后重试。'); setBusy(false); }
  };
  const trackCapsLock = (event: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState('CapsLock'));

  return <main className={styles.page} data-mode={register ? 'register' : 'login'}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="观辰 GuanChen 首页" prefetch={false}>
        <Image src="/assets/brand/guanchen-mark.svg" width={42} height={42} alt="" priority />
        <span><strong>观辰</strong><small>GuanChen</small></span>
      </Link>
      <button type="button" onClick={toggle} className={styles.themeButton} aria-label={theme === 'dark' ? '切换浅色主题' : '切换深色主题'} title={theme === 'dark' ? '切换浅色主题' : '切换深色主题'}>
        {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
      </button>
    </header>

    <div className={styles.content}>
      <section className={styles.story} aria-labelledby="auth-story-title">
        <div className={styles.storyCopy}>
          <h2 id="auth-story-title">观星辰，<br />知自己。</h2>
          <p>从命盘、对话到人生事件，<br />留下一份属于你的个人档案。</p>
        </div>
        <div className={styles.artwork} aria-hidden="true">
          <Image src={authArtwork} alt="" sizes="(max-width: 767px) 0px, (max-width: 1200px) 45vw, 620px" priority />
        </div>
      </section>

      <section className={styles.formSection} aria-labelledby="auth-title">
        <div className={styles.formInner}>
          <h1 id="auth-title">{register ? '创建你的账号' : '登录观辰'}</h1>
          <p className={styles.intro}>{register ? '从这里开始，建立自己的命盘与人生档案。' : '欢迎回来，继续查看你的命盘、对话与报告。'}</p>

          {notice && <p className={styles.notice} role="status">{notice}</p>}
          {register && enabled === false ? <div className={styles.closed} role="status">
            <LockKey size={28} aria-hidden="true" />
            <h2>注册暂未开放</h2>
            <p>当前服务暂不接受新账号，已有账号可以继续登录。</p>
          </div> : <form onSubmit={submit} aria-label={register ? '注册账号' : '登录账号'} aria-busy={busy} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="auth-username">用户名</label>
              <div className={styles.inputShell}>
                <User size={19} aria-hidden="true" />
                <input id="auth-username" name="username" autoComplete="username" required minLength={3} maxLength={32} pattern="[a-zA-Z0-9_.\-]+" placeholder={register ? '设置你的用户名' : '请输入用户名'} disabled={busy || !hydrated} autoCapitalize="none" spellCheck={false} aria-describedby={register ? 'username-hint' : undefined} />
              </div>
              {register && <small id="username-hint">3–32 位字母、数字或 _ . -，不区分大小写。</small>}
            </div>
            {register && <div className={styles.field}>
              <label htmlFor="auth-display-name">显示名称</label>
              <div className={styles.inputShell}>
                <User size={19} aria-hidden="true" />
                <input id="auth-display-name" name="displayName" autoComplete="nickname" required maxLength={40} placeholder="希望我们如何称呼你" disabled={busy || !hydrated} />
              </div>
            </div>}
            <div className={styles.field}>
              <label htmlFor="auth-password">密码</label>
              <div className={styles.inputShell}>
                <LockKey size={19} aria-hidden="true" />
                <input id="auth-password" name="password" type={visiblePassword ? 'text' : 'password'} autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 10 : undefined} maxLength={128} placeholder={register ? '至少 10 个字符' : '请输入密码'} disabled={busy || !hydrated} onKeyUp={trackCapsLock} onKeyDown={trackCapsLock} onBlur={() => setCapsLock(false)} aria-describedby={capsLock ? 'caps-lock-hint' : undefined} />
                <button type="button" className={styles.passwordButton} onClick={() => setVisiblePassword(value => !value)} aria-label={visiblePassword ? '隐藏密码' : '显示密码'} aria-pressed={visiblePassword} disabled={busy || !hydrated}>
                  {visiblePassword ? <EyeSlash size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                </button>
              </div>
              {capsLock && <small id="caps-lock-hint" role="status">大写锁定已开启</small>}
            </div>
            {register && <div className={styles.field}>
              <label htmlFor="auth-confirmation">确认密码</label>
              <div className={styles.inputShell}>
                <LockKey size={19} aria-hidden="true" />
                <input id="auth-confirmation" name="confirmation" type={visiblePassword ? 'text' : 'password'} autoComplete="new-password" required minLength={10} maxLength={128} placeholder="再输入一次密码" disabled={busy || !hydrated} onKeyUp={trackCapsLock} onKeyDown={trackCapsLock} onBlur={() => setCapsLock(false)} aria-describedby={capsLock ? 'caps-lock-hint' : undefined} />
              </div>
            </div>}
            {error && <p role="alert" className={styles.error}>{error}</p>}
            <button className={styles.submit} disabled={busy || !hydrated} type="submit">
              <span>{busy ? '正在处理…' : register ? '注册并登录' : '登录'}</span>
              {busy ? <SpinnerGap className={styles.spinner} size={20} aria-hidden="true" /> : <ArrowRight size={20} aria-hidden="true" />}
            </button>
          </form>}

          <div className={styles.switchAccount}>
            {register ? <>已有账号？<Link href="/login">去登录 <ArrowRight size={15} aria-hidden="true" /></Link></> : enabled !== false && <>还没有账号？<Link href="/register">创建账号 <ArrowRight size={15} aria-hidden="true" /></Link></>}
          </div>
          <p className={styles.privacy}><ShieldCheck size={18} aria-hidden="true" />你的聊天与档案仅在自己的账号内可见</p>
        </div>
      </section>
    </div>

    <footer className={styles.footer}>
      <span>观辰 · 命盘与人生观察</span>
      <nav aria-label="服务说明"><Link href="/privacy">数据与隐私</Link><Link href="/terms">使用说明</Link></nav>
    </footer>
  </main>;
}
