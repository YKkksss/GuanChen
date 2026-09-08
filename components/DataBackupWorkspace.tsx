'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  CheckCircle,
  Clock,
  Database,
  DownloadSimple,
  FileArrowUp,
  FloppyDisk,
  FolderOpen,
  LockKey,
  ShieldCheck,
  SpinnerGap,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';
import {
  ENCRYPTED_LOCAL_BACKUP_MIN_PASSWORD_LENGTH,
  LOCAL_BACKUP_CONFIRMATION,
  LOCAL_BACKUP_DELETE_CONFIRMATION,
} from '@/lib/backups/types';
import type {
  BackupContentSummary,
  BackupPreview,
  DataVaultSummary,
  ManagedBackupItem,
  RestoreBackupResult,
} from '@/lib/backups/types';
import ChartTransferPanel from './ChartTransferPanel';

type ApiError = { error?: string };

export default function DataBackupWorkspace() {
  const [view, setView] = useState<'full' | 'chart'>('full');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<DataVaultSummary | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState<'loading' | 'exporting' | 'exporting-encrypted' | 'inspecting' | 'restoring' | ''>('loading');
  const [lifecycleBusy, setLifecycleBusy] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<RestoreBackupResult | null>(null);
  const [lifecycleNotice, setLifecycleNotice] = useState('');
  const [showEncryptedExport, setShowEncryptedExport] = useState(false);
  const [exportPassword, setExportPassword] = useState('');
  const [exportPasswordConfirmation, setExportPasswordConfirmation] = useState('');
  const [selectedEncrypted, setSelectedEncrypted] = useState(false);
  const [selectedPassword, setSelectedPassword] = useState('');

  const loadSummary = useCallback(async () => {
    setBusy('loading');
    setError('');
    try {
      const response = await fetch('/api/backups', { cache: 'no-store' });
      const data = await response.json() as { summary?: DataVaultSummary; error?: string };
      if (!response.ok || !data.summary) throw new Error(data.error || '本地数据概览读取失败');
      setSummary(data.summary);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '本地数据概览读取失败');
    } finally {
      setBusy('');
    }
  }, []);

  async function updatePolicy(changes: Partial<DataVaultSummary['policy']>) {
    if (!summary) return;
    setLifecycleBusy('policy');
    setError('');
    setLifecycleNotice('');
    try {
      const response = await fetch('/api/backups/policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      const data = await response.json() as {
        summary?: Pick<DataVaultSummary, 'policy' | 'managedBackups' | 'nextAutomaticBackupAt'>;
        error?: string;
      };
      if (!response.ok || !data.summary) throw new Error(data.error || '自动备份设置保存失败');
      setSummary(current => current ? { ...current, ...data.summary } : current);
      setLifecycleNotice('自动备份设置已保存。');
    } catch (policyError) {
      setError(policyError instanceof Error ? policyError.message : '自动备份设置保存失败');
    } finally {
      setLifecycleBusy('');
    }
  }

  async function createStoredBackup() {
    setLifecycleBusy('create');
    setError('');
    setLifecycleNotice('');
    try {
      const response = await fetch('/api/backups/managed', { method: 'POST' });
      const data = await response.json() as {
        backup?: ManagedBackupItem;
        summary?: Pick<DataVaultSummary, 'policy' | 'managedBackups' | 'nextAutomaticBackupAt'>;
        error?: string;
      };
      if (!response.ok || !data.backup || !data.summary) throw new Error(data.error || '本机保留备份创建失败');
      setSummary(current => current ? { ...current, ...data.summary } : current);
      setLifecycleNotice(`已在本机安全保留“${data.backup.fileName}”。`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : '本机保留备份创建失败');
    } finally {
      setLifecycleBusy('');
    }
  }

  async function verifyBackup(fileName: string) {
    setLifecycleBusy(`verify:${fileName}`);
    setError('');
    setLifecycleNotice('');
    try {
      const response = await fetch(`/api/backups/managed/${encodeURIComponent(fileName)}/verify`, { method: 'POST' });
      const data = await response.json() as { backup?: ManagedBackupItem; error?: string };
      if (!response.ok || !data.backup) throw new Error(data.error || '备份健康检查失败');
      setSummary(current => current ? {
        ...current,
        managedBackups: current.managedBackups.map(item => item.fileName === fileName ? data.backup! : item),
      } : current);
      setLifecycleNotice(data.backup.health === 'healthy'
        ? `“${fileName}”已通过完整性检查。`
        : `“${fileName}”未通过检查，请查看状态说明。`);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : '备份健康检查失败');
    } finally {
      setLifecycleBusy('');
    }
  }

  async function deleteBackup(fileName: string) {
    const confirmation = window.prompt(`删除后无法从数据保险箱找回。请输入“${LOCAL_BACKUP_DELETE_CONFIRMATION}”继续：`) ?? '';
    if (confirmation !== LOCAL_BACKUP_DELETE_CONFIRMATION) return;
    setLifecycleBusy(`delete:${fileName}`);
    setError('');
    setLifecycleNotice('');
    try {
      const response = await fetch(`/api/backups/managed/${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      });
      const data = await response.json() as {
        summary?: Pick<DataVaultSummary, 'policy' | 'managedBackups' | 'nextAutomaticBackupAt'>;
        error?: string;
      };
      if (!response.ok || !data.summary) throw new Error(data.error || '本地备份删除失败');
      setSummary(current => current ? { ...current, ...data.summary } : current);
      setLifecycleNotice(`已删除本地备份“${fileName}”。`);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '本地备份删除失败');
    } finally {
      setLifecycleBusy('');
    }
  }

  useEffect(() => { void loadSummary(); }, [loadSummary]);

  async function exportBackup() {
    setBusy('exporting');
    setError('');
    try {
      const response = await fetch('/api/backups/export', { cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as ApiError;
        throw new Error(data.error || '备份导出失败');
      }
      await downloadResponse(response, '紫微命盘本地备份.ziweibackup');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '备份导出失败');
    } finally {
      setBusy('');
    }
  }

  async function exportEncryptedBackup() {
    if (!isStrongEnoughPassword(exportPassword) || exportPassword !== exportPasswordConfirmation) return;
    setBusy('exporting-encrypted');
    setError('');
    setLifecycleNotice('');
    try {
      const response = await fetch('/api/backups/export/encrypted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: exportPassword }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as ApiError;
        throw new Error(data.error || '加密备份导出失败');
      }
      await downloadResponse(response, '紫微命盘加密备份.ziweibackupx');
      setExportPassword('');
      setExportPasswordConfirmation('');
      setShowEncryptedExport(false);
      setLifecycleNotice('加密备份已生成并下载。请妥善保存密码，系统无法找回。');
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '加密备份导出失败');
    } finally {
      setBusy('');
    }
  }

  async function chooseFile(file: File | null) {
    setSelectedFile(file);
    setPreview(null);
    setConfirmation('');
    setSuccess(null);
    setError('');
    setSelectedPassword('');
    setSelectedEncrypted(false);
    if (!file) return;
    const magic = await file.slice(0, 14).text().catch(() => '');
    const encrypted = magic === 'ZIWEIBACKUPX1\n' || file.name.toLowerCase().endsWith('.ziweibackupx');
    setSelectedEncrypted(encrypted);
    if (encrypted) return;
    await inspectSelectedBackup(file, '');
  }

  async function inspectSelectedBackup(file = selectedFile, password = selectedPassword) {
    if (!file) return;
    setBusy('inspecting');
    try {
      const form = new FormData();
      form.set('backup', file);
      if (password) form.set('password', password);
      const response = await fetch('/api/backups/inspect', { method: 'POST', body: form });
      const data = await response.json() as { preview?: BackupPreview; encrypted?: boolean; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error || '备份预检失败');
      setPreview(data.preview);
      setSelectedEncrypted(Boolean(data.encrypted));
    } catch (inspectError) {
      setError(inspectError instanceof Error ? inspectError.message : '备份预检失败');
    } finally {
      setBusy('');
    }
  }

  async function restoreBackup() {
    if (!selectedFile || !preview?.compatible || confirmation !== LOCAL_BACKUP_CONFIRMATION) return;
    if (!window.confirm('恢复会用备份中的全部数据替换当前本地档案。系统会先自动保存恢复前备份，确定继续吗？')) return;
    setBusy('restoring');
    setError('');
    setSuccess(null);
    try {
      const form = new FormData();
      form.set('backup', selectedFile);
      form.set('confirmation', confirmation);
      if (selectedEncrypted) form.set('password', selectedPassword);
      const response = await fetch('/api/backups/restore', { method: 'POST', body: form });
      const data = await response.json() as { result?: RestoreBackupResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || '本地数据恢复失败');
      setSuccess(data.result);
      setSelectedFile(null);
      setPreview(null);
      setConfirmation('');
      setSelectedEncrypted(false);
      setSelectedPassword('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadSummary();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : '本地数据恢复失败');
    } finally {
      setBusy('');
    }
  }

  const exportPasswordValid = isStrongEnoughPassword(exportPassword);
  const exportPasswordsMatch = exportPassword === exportPasswordConfirmation;

  return (
    <main className="case-form mx-auto min-h-screen max-w-[1180px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div>
          <Link href="/" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回首页</Link>
          <div className="mt-5 text-[10px] font-medium tracking-[.28em]" style={{ color: 'var(--t-gold)' }}>LOCAL DATA VAULT</div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>本地数据保险箱</h1>
          <p className="mt-3 max-w-3xl text-xs leading-7" style={{ color: 'var(--t-text2)' }}>
            档案与备份保存在部署电脑，局域网访问者共享。导入、解锁与预检由部署电脑处理，下载文件保存在当前访问设备。普通备份与数据库默认不加密。
          </p>
        </div>
        {view === 'full' && <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setShowEncryptedExport(value => !value)} disabled={Boolean(busy)} className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs disabled:opacity-50" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>
            <LockKey size={16} />加密导出
          </button>
          <button type="button" onClick={() => void exportBackup()} disabled={Boolean(busy)} className="btn-primary !px-5 !py-3 disabled:opacity-50">
            {busy === 'exporting' ? <SpinnerGap className="animate-spin" size={16} /> : <DownloadSimple size={16} />}
            {busy === 'exporting' ? '正在生成一致性快照…' : '普通导出'}
          </button>
        </div>}
      </header>

      {error && <StatusMessage tone="error" icon={<WarningCircle size={17} />} text={error} />}
      {lifecycleNotice && <StatusMessage tone="success" icon={<CheckCircle size={17} />} text={lifecycleNotice} />}
      {success && (
        <StatusMessage
          tone="success"
          icon={<CheckCircle size={17} />}
          text={`数据已安全恢复。恢复前数据已另存为“${success.rollbackBackupFileName}”，建议刷新页面后继续使用。`}
          action={<button type="button" onClick={() => window.location.reload()} className="underline underline-offset-4">立即刷新</button>}
        />
      )}

      <section className="mb-6 grid grid-cols-2 rounded-xl p-1" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
        <VaultTab active={view === 'full'} title="整库备份与恢复" subtitle="适合整台设备迁移与灾难恢复" onClick={() => setView('full')} />
        <VaultTab active={view === 'chart'} title="单命盘迁移" subtitle="导入为副本，不覆盖当前档案" onClick={() => setView('chart')} />
      </section>

      {view === 'full' && showEncryptedExport && <article className="card-glass mb-6 rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl p-2.5" style={{ color: 'var(--t-gold)', background: 'var(--ac-bg)' }}><LockKey size={20} /></div>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>生成密码保护的完整备份</h2>
            <p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>使用 scrypt 派生密钥和 AES-256-GCM 认证加密。密码不会被保存，遗忘后系统也无法找回。</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-[10px]" style={{ color: 'var(--t-text2)' }}>
            加密密码
            <input type="password" value={exportPassword} onChange={event => setExportPassword(event.target.value)} className="field-control mt-2" autoComplete="new-password" placeholder={`至少 ${ENCRYPTED_LOCAL_BACKUP_MIN_PASSWORD_LENGTH} 个字符`} />
            <span className="mt-1 block text-[9px]" style={{ color: exportPassword && !exportPasswordValid ? '#ef4444' : 'var(--t-faint)' }}>{exportPassword && !exportPasswordValid ? `还需要至少 ${ENCRYPTED_LOCAL_BACKUP_MIN_PASSWORD_LENGTH} 个字符` : '建议使用不重复的长密码或密码短语'}</span>
          </label>
          <label className="text-[10px]" style={{ color: 'var(--t-text2)' }}>
            再次输入密码
            <input type="password" value={exportPasswordConfirmation} onChange={event => setExportPasswordConfirmation(event.target.value)} className="field-control mt-2" autoComplete="new-password" placeholder="再次输入，防止手误" />
            <span className="mt-1 block text-[9px]" style={{ color: exportPasswordConfirmation && !exportPasswordsMatch ? '#ef4444' : 'var(--t-faint)' }}>{exportPasswordConfirmation && !exportPasswordsMatch ? '两次输入的密码不一致' : '只在当前导出请求的内存中使用'}</span>
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: 'var(--t-border)' }}>
          <p className="max-w-2xl text-[9px] leading-5" style={{ color: 'var(--t-faint)' }}>加密包扩展名为 .ziweibackupx。它适合复制到移动硬盘或云盘，但仍建议保留至少两个不同位置的副本。</p>
          <button type="button" disabled={Boolean(busy) || !exportPasswordValid || !exportPasswordsMatch} onClick={() => void exportEncryptedBackup()} className="btn-primary !px-5 !py-3 disabled:cursor-not-allowed disabled:opacity-40">
            {busy === 'exporting-encrypted' ? <SpinnerGap className="animate-spin" size={16} /> : <LockKey size={16} />}
            {busy === 'exporting-encrypted' ? '正在加密并生成…' : '生成加密备份'}
          </button>
        </div>
      </article>}

      {view === 'full' ? <section className="grid min-w-0 gap-5 lg:grid-cols-[1.02fr_.98fr]">
        <div className="min-w-0 space-y-5">
          <article className="card-glass min-w-0 overflow-hidden rounded-2xl p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl p-2.5" style={{ color: 'var(--t-gold)', background: 'var(--ac-bg)' }}><Database size={21} /></div>
                <div><h2 className="text-base font-semibold" style={{ color: 'var(--t-text)' }}>当前本地档案</h2><p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>SQLite v{summary?.schemaVersion ?? '—'} · 数据库 {formatBytes(summary?.databaseBytes ?? 0)}</p></div>
              </div>
              {busy === 'loading' && <SpinnerGap className="animate-spin" size={18} style={{ color: 'var(--t-gold)' }} />}
            </div>
            {summary && <ContentGrid content={summary.content} />}
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-[10px]" style={{ color: 'var(--t-faint)', borderColor: 'var(--t-border)' }}>
              <span>报告附件 {summary?.attachmentCount ?? 0} 份</span>
              <span>附件体积 {formatBytes(summary?.attachmentBytes ?? 0)}</span>
              <span>导出会自动合并 WAL 中的最新数据</span>
            </div>
          </article>

          <article className="card-glass min-w-0 overflow-hidden rounded-2xl p-5 sm:p-6">
            <div className="flex items-start gap-3"><ShieldCheck size={20} style={{ color: '#22c55e' }} /><div><h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>备份包包含什么</h2><p className="mt-2 text-xs leading-6" style={{ color: 'var(--t-text2)' }}>完整 SQLite 一致性快照、数据库版本、各表记录数、SHA-256 完整性指纹，以及数据库中仍有效的 PDF 导出文件。</p></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <TrustItem title="可预检" text="恢复前只读检查，不接触现有数据" />
              <TrustItem title="可拦截" text="版本、外键或文件损坏会立即阻止" />
              <TrustItem title="可回滚" text="替换前自动保留原始完整备份" />
            </div>
          </article>

          <article className="card-glass min-w-0 overflow-hidden rounded-2xl p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl p-2.5" style={{ color: 'var(--t-gold)', background: 'var(--ac-bg)' }}><Clock size={20} /></div>
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>自动备份与本机留存</h2>
                  <p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>
                    应用打开后在后台检查到期状态；只自动轮换周期备份，不会自动删除手动备份和恢复前保险副本。
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => void createStoredBackup()} disabled={Boolean(lifecycleBusy)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-[10px] disabled:opacity-50" style={{ color: '#fffaf3', background: 'var(--ac)' }}>
                {lifecycleBusy === 'create' ? <SpinnerGap className="animate-spin" size={14} /> : <FloppyDisk size={14} />}
                {lifecycleBusy === 'create' ? '正在保存…' : '立即保留一份'}
              </button>
            </div>

            {summary && <div className="mt-5 grid min-w-0 max-w-full gap-3 rounded-2xl p-4 sm:grid-cols-[1fr_1fr_1fr]" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
              <label className="flex items-center justify-between gap-3 text-[10px]" style={{ color: 'var(--t-text2)' }}>
                <span>自动备份</span>
                <button type="button" role="switch" aria-checked={summary.policy.enabled} disabled={lifecycleBusy === 'policy'} onClick={() => void updatePolicy({ enabled: !summary.policy.enabled })} className="relative h-6 w-11 rounded-full transition-colors disabled:opacity-50" style={{ background: summary.policy.enabled ? 'var(--ac)' : 'var(--t-border)' }}>
                  <span className="absolute top-1 h-4 w-4 rounded-full bg-white transition-all" style={{ left: summary.policy.enabled ? '23px' : '4px' }} />
                </button>
              </label>
              <label className="text-[9px]" style={{ color: 'var(--t-faint)' }}>
                检查周期
                <select value={summary.policy.intervalHours} disabled={lifecycleBusy === 'policy'} onChange={event => void updatePolicy({ intervalHours: Number(event.target.value) })} className="field-control mt-1 !py-2 text-[10px]">
                  <option value={6}>每 6 小时</option>
                  <option value={12}>每 12 小时</option>
                  <option value={24}>每天</option>
                  <option value={72}>每 3 天</option>
                  <option value={168}>每 7 天</option>
                </select>
              </label>
              <label className="text-[9px]" style={{ color: 'var(--t-faint)' }}>
                自动保留
                <select value={summary.policy.retentionCount} disabled={lifecycleBusy === 'policy'} onChange={event => void updatePolicy({ retentionCount: Number(event.target.value) })} className="field-control mt-1 !py-2 text-[10px]">
                  {[3, 5, 7, 10, 15, 30].map(value => <option key={value} value={value}>最近 {value} 份</option>)}
                </select>
              </label>
              <div className="text-[9px] leading-5 sm:col-span-3" style={{ color: 'var(--t-faint)' }}>
                {summary.policy.enabled
                  ? `下次检查目标：${formatDate(summary.nextAutomaticBackupAt ?? new Date().toISOString())}`
                  : '自动备份已暂停；现有备份不会因此被删除。'}
              </div>
            </div>}

            <div className="mt-5 flex items-center justify-between gap-3">
              <div><h3 className="text-xs font-semibold" style={{ color: 'var(--t-text)' }}>本机备份记录</h3><p className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>点击“验证”会完整解包并检查 SQLite、外键、数据清单与 PDF 附件。</p></div>
              {lifecycleBusy === 'policy' && <SpinnerGap className="animate-spin" size={16} style={{ color: 'var(--t-gold)' }} />}
            </div>
            <div className="mt-4 space-y-2">
              {summary?.managedBackups.length ? summary.managedBackups.map(item => (
                <ManagedBackupRow
                  key={item.fileName}
                  item={item}
                  busy={lifecycleBusy}
                  onVerify={verifyBackup}
                  onDelete={deleteBackup}
                />
              )) : <p className="rounded-xl px-4 py-5 text-center text-[10px]" style={{ border: '1px dashed var(--t-border)', color: 'var(--t-faint)' }}>还没有本机备份。自动备份将在应用后台完成首次检查，你也可以立即保留一份。</p>}
            </div>
          </article>
        </div>

        <article className="card-glass h-fit rounded-2xl p-5 sm:p-6 lg:sticky lg:top-24">
          <div className="flex items-start gap-3">
            <div className="rounded-xl p-2.5" style={{ color: 'var(--t-gold)', background: 'var(--ac-bg)' }}><FileArrowUp size={21} /></div>
            <div><h2 className="text-base font-semibold" style={{ color: 'var(--t-text)' }}>预检并恢复</h2><p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>支持普通与密码保护备份。加密文件先在部署电脑解锁，再进入同一套完整性预检和安全恢复流程。</p></div>
          </div>

          <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-8 text-center" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--ac-bg)' }}>
            {busy === 'inspecting' ? <SpinnerGap className="animate-spin" size={26} style={{ color: 'var(--t-gold)' }} /> : <FileArrowUp size={26} style={{ color: 'var(--t-gold)' }} />}
            <strong className="mt-3 max-w-full truncate text-xs" style={{ color: 'var(--t-text)' }}>{selectedFile?.name || '选择备份文件'}</strong>
            <span className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>{selectedFile ? `${formatBytes(selectedFile.size)} · ${selectedEncrypted ? '密码保护备份' : '普通备份'}` : '支持 .ziweibackup 和 .ziweibackupx，选择后只做只读检查'}</span>
            <input ref={fileInputRef} type="file" accept=".ziweibackup,.ziweibackupx,application/gzip,application/octet-stream" className="sr-only" disabled={Boolean(busy)} onChange={event => void chooseFile(event.target.files?.[0] ?? null)} />
          </label>

          {selectedFile && selectedEncrypted && !preview && <section className="mt-5 rounded-2xl p-4" style={{ border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>
            <div className="flex items-start gap-2"><LockKey className="mt-0.5 shrink-0" size={16} style={{ color: 'var(--t-gold)' }} /><div><strong className="text-xs" style={{ color: 'var(--t-text)' }}>请输入这个备份的密码</strong><p className="mt-1 text-[9px] leading-5" style={{ color: 'var(--t-faint)' }}>密码只用于本次解锁；密码错误和文件被修改会统一拒绝。</p></div></div>
            <input type="password" value={selectedPassword} onChange={event => { setSelectedPassword(event.target.value); setError(''); }} className="field-control mt-3" autoComplete="current-password" placeholder="备份密码" onKeyDown={event => { if (event.key === 'Enter' && isStrongEnoughPassword(selectedPassword)) void inspectSelectedBackup(); }} />
            <button type="button" disabled={busy === 'inspecting' || !isStrongEnoughPassword(selectedPassword)} onClick={() => void inspectSelectedBackup()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-40" style={{ color: '#fffaf3', background: 'var(--ac)' }}>
              {busy === 'inspecting' ? <SpinnerGap className="animate-spin" size={15} /> : <LockKey size={15} />}
              {busy === 'inspecting' ? '正在解密并完整检查…' : '解密并预检'}
            </button>
          </section>}

          {preview && <BackupPreviewCard preview={preview} encrypted={selectedEncrypted} />}

          {preview?.compatible && (
            <div className="mt-5 border-t pt-5" style={{ borderColor: 'var(--t-border)' }}>
              <label className="text-[10px] leading-5" style={{ color: 'var(--t-text2)' }}>
                为防止误操作，请输入“{LOCAL_BACKUP_CONFIRMATION}”
                <input value={confirmation} onChange={event => setConfirmation(event.target.value)} className="field-control mt-2" autoComplete="off" />
              </label>
              <button type="button" disabled={busy === 'restoring' || confirmation !== LOCAL_BACKUP_CONFIRMATION} onClick={() => void restoreBackup()} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-40" style={{ color: '#fffaf3', background: '#9f3f35' }}>
                {busy === 'restoring' ? <SpinnerGap className="animate-spin" size={15} /> : <WarningCircle size={15} />}
                {busy === 'restoring' ? '正在备份原数据并安全恢复…' : '替换当前全部本地数据'}
              </button>
            </div>
          )}
        </article>
      </section> : <ChartTransferPanel />}
    </main>
  );
}

function VaultTab({ active, title, subtitle, onClick }: { active: boolean; title: string; subtitle: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-lg px-3 py-3 text-left sm:px-5" style={active ? { color: '#fffaf3', background: 'var(--ac)' } : { color: 'var(--t-text2)' }}><strong className="block text-xs font-medium">{title}</strong><span className="mt-1 hidden text-[10px] sm:block">{subtitle}</span></button>;
}

function ManagedBackupRow({
  item,
  busy,
  onVerify,
  onDelete,
}: {
  item: ManagedBackupItem;
  busy: string;
  onVerify: (fileName: string) => Promise<void>;
  onDelete: (fileName: string) => Promise<void>;
}) {
  const health = BACKUP_HEALTH[item.health];
  const isVerifying = busy === `verify:${item.fileName}`;
  const isDeleting = busy === `delete:${item.fileName}`;
  return <div className="min-w-0 rounded-xl px-4 py-3" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
    <div className="flex min-w-0 flex-col items-start gap-3 sm:flex-row sm:justify-between">
      <div className="w-full min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <FolderOpen size={14} style={{ color: 'var(--t-gold)' }} />
          <strong className="block min-w-0 max-w-full truncate text-[10px]" title={item.fileName} style={{ color: 'var(--t-text)' }}>{item.fileName}</strong>
          <span className="rounded-full px-2 py-0.5 text-[8px]" style={{ color: SOURCE_LABEL[item.source].color, background: SOURCE_LABEL[item.source].background }}>{SOURCE_LABEL[item.source].text}</span>
          <span className="rounded-full px-2 py-0.5 text-[8px]" style={{ color: health.color, background: health.background }}>{health.text}</span>
        </div>
        <p className="mt-2 text-[9px] leading-5" style={{ color: 'var(--t-faint)' }}>
          {formatDate(item.createdAt)} · {formatBytes(item.byteSize)}
          {item.lastVerifiedAt ? ` · ${formatDate(item.lastVerifiedAt)}验证` : ''}
        </p>
        {item.healthMessage && <p className="mt-1 text-[9px] leading-5" style={{ color: health.color }}>{item.healthMessage}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
        <a href={`/api/backups/automatic/${encodeURIComponent(item.fileName)}`} aria-label={`下载 ${item.fileName}`} title="下载" className="rounded-lg p-2" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}><DownloadSimple size={13} /></a>
        <button type="button" aria-label={`验证 ${item.fileName}`} title="验证完整性" disabled={Boolean(busy)} onClick={() => void onVerify(item.fileName)} className="rounded-lg p-2 disabled:opacity-40" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>{isVerifying ? <SpinnerGap className="animate-spin" size={13} /> : <ArrowsClockwise size={13} />}</button>
        <button type="button" aria-label={`删除 ${item.fileName}`} title="删除" disabled={Boolean(busy)} onClick={() => void onDelete(item.fileName)} className="rounded-lg p-2 disabled:opacity-40" style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,.25)' }}>{isDeleting ? <SpinnerGap className="animate-spin" size={13} /> : <Trash size={13} />}</button>
      </div>
    </div>
  </div>;
}

const SOURCE_LABEL: Record<ManagedBackupItem['source'], { text: string; color: string; background: string }> = {
  scheduled: { text: '周期自动', color: '#22c55e', background: 'rgba(34,197,94,.10)' },
  manual: { text: '手动保留', color: '#b88a35', background: 'var(--ac-bg)' },
  pre_restore: { text: '恢复前保险', color: '#3b82f6', background: 'rgba(59,130,246,.10)' },
};

const BACKUP_HEALTH: Record<ManagedBackupItem['health'], { text: string; color: string; background: string }> = {
  unchecked: { text: '待验证', color: 'var(--t-faint)', background: 'var(--t-bg2)' },
  healthy: { text: '健康', color: '#22c55e', background: 'rgba(34,197,94,.10)' },
  incompatible: { text: '版本不兼容', color: '#f59e0b', background: 'rgba(245,158,11,.10)' },
  damaged: { text: '已损坏', color: '#ef4444', background: 'rgba(239,68,68,.10)' },
};

function BackupPreviewCard({ preview, encrypted = false }: { preview: BackupPreview; encrypted?: boolean }) {
  return <section className="mt-5 rounded-2xl p-4" style={{ border: `1px solid ${preview.compatible ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.35)'}`, background: preview.compatible ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)' }}>
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold" style={{ color: preview.compatible ? '#22c55e' : '#ef4444' }}>{preview.compatible ? <CheckCircle size={16} /> : <WarningCircle size={16} />}{preview.compatible ? '预检通过，可以恢复' : '版本不兼容，已阻止恢复'}{encrypted && <span className="rounded-full px-2 py-0.5 text-[8px]" style={{ color: 'var(--t-gold)', background: 'var(--ac-bg)' }}>已认证解密</span>}</div>
    <dl className="mt-4 grid grid-cols-2 gap-3 text-[10px]">
      <PreviewItem label="备份时间" value={formatDate(preview.createdAt)} />
      <PreviewItem label="数据库版本" value={`v${preview.schemaVersion} / 当前 v${preview.currentSchemaVersion}`} />
      <PreviewItem label="备份包体积" value={formatBytes(preview.archiveBytes)} />
      <PreviewItem label="完整性指纹" value={preview.fingerprint} />
      <PreviewItem label="业务数据表" value={`${preview.tableCount} 张`} />
      <PreviewItem label="PDF 附件" value={`${preview.attachmentCount} 份`} />
    </dl>
    <ContentGrid content={preview.content} compact />
    {preview.warnings.map(warning => <p key={warning} className="mt-3 text-[9px] leading-5" style={{ color: '#f59e0b' }}>提示：{warning}</p>)}
  </section>;
}

function ContentGrid({ content, compact = false }: { content: BackupContentSummary; compact?: boolean }) {
  const items = [
    ['对话', content.conversations], ['消息', content.messages], ['事件', content.lifeEvents],
    ['报告', content.reports], ['八字档案', content.baziProfiles], ['学习记录', content.learningRecords],
    ['提醒', content.reminders],
  ];
  return <div className={`${compact ? 'mt-4' : 'mt-6'} grid grid-cols-2 gap-2 sm:grid-cols-4`}>{items.map(([label, value]) => <div key={label} className="rounded-xl px-3 py-3" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}><div className="text-lg font-semibold" style={{ color: 'var(--t-text)' }}>{value}</div><div className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}</div></div>)}</div>;
}

function PreviewItem({ label, value }: { label: string; value: string }) {
  return <div><dt style={{ color: 'var(--t-faint)' }}>{label}</dt><dd className="mt-1 break-all" style={{ color: 'var(--t-text2)' }}>{value}</dd></div>;
}

function TrustItem({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl p-3" style={{ border: '1px solid var(--t-border)' }}><strong className="text-[10px]" style={{ color: 'var(--t-text)' }}>{title}</strong><p className="mt-1 text-[9px] leading-5" style={{ color: 'var(--t-faint)' }}>{text}</p></div>;
}

function StatusMessage({ tone, icon, text, action }: { tone: 'error' | 'success'; icon: React.ReactNode; text: string; action?: React.ReactNode }) {
  const color = tone === 'error' ? '#ef4444' : '#22c55e';
  return <div className="mb-5 flex items-start gap-2 rounded-xl p-4 text-xs leading-6" style={{ color, border: `1px solid ${color}55`, background: `${color}0f` }}><span className="mt-1 shrink-0">{icon}</span><span>{text} {action}</span></div>;
}

function resolveDownloadName(disposition: string | null, fallbackName: string): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (!encoded) return fallbackName;
  try { return decodeURIComponent(encoded); } catch { return fallbackName; }
}

async function downloadResponse(response: Response, fallbackName: string): Promise<void> {
  const blob = await response.blob();
  const fileName = resolveDownloadName(response.headers.get('content-disposition'), fallbackName);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function isStrongEnoughPassword(value: string): boolean {
  return [...value.normalize('NFC')].length >= ENCRYPTED_LOCAL_BACKUP_MIN_PASSWORD_LENGTH;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
