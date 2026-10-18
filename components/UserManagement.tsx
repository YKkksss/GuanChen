'use client';
import { useEffect, useRef, useState } from 'react';
import type { AccountUser } from '@/lib/auth/scope';
import { useAccount } from './AccountProvider';
export default function UserManagement() {
  const user = useAccount();
  const [users, setUsers] = useState<AccountUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const loadSequence = useRef(0);
  const load = async () => {
    const sequence = ++loadSequence.current;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/admin/users?q=${encodeURIComponent(query)}&offset=${offset}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (sequence !== loadSequence.current) return;
      setUsers(data.users);
      setTotal(data.total);
    } catch (error) { if (sequence === loadSequence.current) setError(error instanceof Error ? error.message : '用户列表读取失败'); }
    finally { if (sequence === loadSequence.current) setLoading(false); }
  };
  useEffect(() => { if (user?.role === 'admin') void load(); }, [user?.role, offset]);
  if (user?.role !== 'admin') return <main className="account-page"><section className="account-card"><h1>用户管理</h1><p role="alert">需要管理员权限。</p></section></main>;
  const update = async (target: AccountUser, field: 'role' | 'status') => {
    const value = field === 'role' ? (target.role === 'admin' ? 'user' : 'admin') : (target.status === 'active' ? 'disabled' : 'active');
    if (!window.confirm(`确认将 ${target.username} ${field === 'role' ? (value === 'admin' ? '设为管理员' : '设为普通用户') : (value === 'disabled' ? '停用' : '启用')}？该账号的现有登录会失效。`)) return;
    setPending(target.id); setError('');
    try {
      const response = await fetch(`/api/admin/users/${target.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setUsers(previous => previous.map(item => item.id === target.id ? data.user : item));
    } catch (error) { setError(error instanceof Error ? error.message : '修改失败'); }
    finally { setPending(''); }
  };
  return <main className="account-page"><section className="account-card account-wide"><h1>用户管理</h1><p>管理账号角色与启停状态。管理员的命盘和对话仍使用自己的账号空间。</p>
    <form onSubmit={event => { event.preventDefault(); if (offset) setOffset(0); else void load(); }}><label>搜索用户<input value={query} onChange={event => setQuery(event.target.value)} placeholder="用户名或显示名称" maxLength={80} /></label><button disabled={loading}>搜索</button></form>
    {error && <p role="alert" className="account-error">{error} <button onClick={load}>重新读取</button></p>}
    {loading ? <p role="status">正在读取用户…</p> : <ul className="account-users">{users.map(item => <li key={item.id}>
      <div><strong>{item.displayName}</strong><span>{item.username} · {item.role === 'admin' ? '管理员' : '普通用户'} · {item.status === 'active' ? '启用' : '停用'}</span></div>
      <div><button disabled={!!pending || item.id === user.id} onClick={() => update(item, 'status')}>{item.status === 'active' ? '停用账号' : '启用账号'}</button><button disabled={!!pending || item.id === user.id} onClick={() => update(item, 'role')}>{item.role === 'admin' ? '设为普通用户' : '设为管理员'}</button></div>
    </li>)}</ul>}
    <p>共 {total} 个账号 · 第 {Math.floor(offset / 20) + 1} 页</p><div className="account-links"><button disabled={loading || !!pending || offset === 0} onClick={() => setOffset(value => Math.max(value - 20, 0))}>上一页</button><button disabled={loading || !!pending || offset + 20 >= total} onClick={() => setOffset(value => value + 20)}>下一页</button></div>
  </section></main>;
}
