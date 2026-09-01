'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle,
  Database,
  DownloadSimple,
  FileArrowUp,
  FolderOpen,
  ShieldCheck,
  SpinnerGap,
  WarningCircle,
} from '@phosphor-icons/react';
import { LOCAL_BACKUP_CONFIRMATION } from '@/lib/backups/types';
import type {
  BackupContentSummary,
  BackupPreview,
  LocalDataSummary,
  RestoreBackupResult,
} from '@/lib/backups/types';
import ChartTransferPanel from './ChartTransferPanel';

type ApiError = { error?: string };

export default function DataBackupWorkspace() {
  const [view, setView] = useState<'full' | 'chart'>('full');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [summary, setSummary] = useState<LocalDataSummary | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState<'loading' | 'exporting' | 'inspecting' | 'restoring' | ''>('loading');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<RestoreBackupResult | null>(null);

  const loadSummary = useCallback(async () => {
    setBusy('loading');
    setError('');
    try {
      const response = await fetch('/api/backups', { cache: 'no-store' });
      const data = await response.json() as { summary?: LocalDataSummary; error?: string };
      if (!response.ok || !data.summary) throw new Error(data.error || '本地数据概览读取失败');
      setSummary(data.summary);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '本地数据概览读取失败');
    } finally {
      setBusy('');
    }
  }, []);

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
      const blob = await response.blob();
      const fileName = resolveDownloadName(response.headers.get('content-disposition'));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : '备份导出失败');
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
    if (!file) return;
    setBusy('inspecting');
    try {
      const form = new FormData();
      form.set('backup', file);
      const response = await fetch('/api/backups/inspect', { method: 'POST', body: form });
      const data = await response.json() as { preview?: BackupPreview; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error || '备份预检失败');
      setPreview(data.preview);
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
      const response = await fetch('/api/backups/restore', { method: 'POST', body: form });
      const data = await response.json() as { result?: RestoreBackupResult; error?: string };
      if (!response.ok || !data.result) throw new Error(data.error || '本地数据恢复失败');
      setSuccess(data.result);
      setSelectedFile(null);
      setPreview(null);
      setConfirmation('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      await loadSummary();
    } catch (restoreError) {
      setError(restoreError instanceof Error ? restoreError.message : '本地数据恢复失败');
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="case-form mx-auto min-h-screen max-w-[1180px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div>
          <Link href="/" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回首页</Link>
          <div className="mt-5 text-[10px] font-medium tracking-[.28em]" style={{ color: 'var(--t-gold)' }}>LOCAL DATA VAULT</div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>本地数据保险箱</h1>
          <p className="mt-3 max-w-3xl text-xs leading-7" style={{ color: 'var(--t-text2)' }}>
            在整库保险备份和单命盘迁移之间按需选择。所有导出、预检与导入都在本机完成，不会上传到云端。
          </p>
        </div>
        {view === 'full' && <button type="button" onClick={() => void exportBackup()} disabled={Boolean(busy)} className="btn-primary !px-5 !py-3 disabled:opacity-50">
          {busy === 'exporting' ? <SpinnerGap className="animate-spin" size={16} /> : <DownloadSimple size={16} />}
          {busy === 'exporting' ? '正在生成一致性快照…' : '导出完整备份'}
        </button>}
      </header>

      {error && <StatusMessage tone="error" icon={<WarningCircle size={17} />} text={error} />}
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

      {view === 'full' ? <section className="grid gap-5 lg:grid-cols-[1.02fr_.98fr]">
        <div className="space-y-5">
          <article className="card-glass rounded-2xl p-5 sm:p-6">
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

          <article className="card-glass rounded-2xl p-5 sm:p-6">
            <div className="flex items-start gap-3"><ShieldCheck size={20} style={{ color: '#22c55e' }} /><div><h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>备份包包含什么</h2><p className="mt-2 text-xs leading-6" style={{ color: 'var(--t-text2)' }}>完整 SQLite 一致性快照、数据库版本、各表记录数、SHA-256 完整性指纹，以及数据库中仍有效的 PDF 导出文件。</p></div></div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <TrustItem title="可预检" text="恢复前只读检查，不接触现有数据" />
              <TrustItem title="可拦截" text="版本、外键或文件损坏会立即阻止" />
              <TrustItem title="可回滚" text="替换前自动保留原始完整备份" />
            </div>
          </article>

          <article className="card-glass rounded-2xl p-5 sm:p-6">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--t-text)' }}>最近的恢复前自动备份</h2>
            <p className="mt-2 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>仅在执行恢复前自动生成，最多显示最近 10 份；可下载后重新走右侧预检流程。</p>
            <div className="mt-4 space-y-2">
              {summary?.automaticBackups.length ? summary.automaticBackups.map(item => (
                <a key={item.fileName} href={`/api/backups/automatic/${encodeURIComponent(item.fileName)}`} className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-xs" style={{ border: '1px solid var(--t-border)', color: 'var(--t-text2)' }}>
                  <span className="min-w-0 truncate"><FolderOpen className="mr-2 inline" size={14} />{item.fileName}</span>
                  <span className="shrink-0 text-[9px]" style={{ color: 'var(--t-faint)' }}>{formatBytes(item.byteSize)}</span>
                </a>
              )) : <p className="rounded-xl px-4 py-5 text-center text-[10px]" style={{ border: '1px dashed var(--t-border)', color: 'var(--t-faint)' }}>尚未执行过数据恢复，因此没有自动备份。</p>}
            </div>
          </article>
        </div>

        <article className="card-glass h-fit rounded-2xl p-5 sm:p-6 lg:sticky lg:top-24">
          <div className="flex items-start gap-3">
            <div className="rounded-xl p-2.5" style={{ color: 'var(--t-gold)', background: 'var(--ac-bg)' }}><FileArrowUp size={21} /></div>
            <div><h2 className="text-base font-semibold" style={{ color: 'var(--t-text)' }}>预检并恢复</h2><p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>第一版只支持整库替换，避免跨库合并破坏会话、事件与报告之间的关联。</p></div>
          </div>

          <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-8 text-center" style={{ borderColor: 'var(--t-border-acc)', background: 'var(--ac-bg)' }}>
            {busy === 'inspecting' ? <SpinnerGap className="animate-spin" size={26} style={{ color: 'var(--t-gold)' }} /> : <FileArrowUp size={26} style={{ color: 'var(--t-gold)' }} />}
            <strong className="mt-3 text-xs" style={{ color: 'var(--t-text)' }}>{selectedFile?.name || '选择 .ziweibackup 文件'}</strong>
            <span className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>{selectedFile ? formatBytes(selectedFile.size) : '最大 128 MB，选择后只做只读检查'}</span>
            <input ref={fileInputRef} type="file" accept=".ziweibackup,application/gzip" className="sr-only" disabled={Boolean(busy)} onChange={event => void chooseFile(event.target.files?.[0] ?? null)} />
          </label>

          {preview && <BackupPreviewCard preview={preview} />}

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
  return <button type="button" onClick={onClick} className="rounded-lg px-3 py-3 text-left sm:px-5" style={active ? { color: '#fffaf3', background: 'var(--ac)' } : { color: 'var(--t-text2)' }}><strong className="block text-xs font-medium">{title}</strong><span className="mt-1 hidden text-[9px] opacity-70 sm:block">{subtitle}</span></button>;
}

function BackupPreviewCard({ preview }: { preview: BackupPreview }) {
  return <section className="mt-5 rounded-2xl p-4" style={{ border: `1px solid ${preview.compatible ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.35)'}`, background: preview.compatible ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)' }}>
    <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: preview.compatible ? '#22c55e' : '#ef4444' }}>{preview.compatible ? <CheckCircle size={16} /> : <WarningCircle size={16} />}{preview.compatible ? '预检通过，可以恢复' : '版本不兼容，已阻止恢复'}</div>
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

function resolveDownloadName(disposition: string | null): string {
  const encoded = disposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (!encoded) return '紫微命盘本地备份.ziweibackup';
  try { return decodeURIComponent(encoded); } catch { return '紫微命盘本地备份.ziweibackup'; }
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
