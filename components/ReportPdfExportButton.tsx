'use client';

import { DownloadSimple, SpinnerGap } from '@phosphor-icons/react';
import { useState } from 'react';
import type { ReportExportKind } from '@/lib/report-exports/types';

export default function ReportPdfExportButton({
  sourceKind,
  reportId,
  version,
  disabled = false,
  tone = 'ziwei',
}: {
  sourceKind: ReportExportKind;
  reportId: string;
  version?: number;
  disabled?: boolean;
  tone?: 'ziwei' | 'rectification' | 'annual';
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async () => {
    if (busy || disabled) return;
    setBusy(true);
    setError('');
    try {
      let downloadUrl = '';
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const response = await fetch('/api/report-exports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceKind, reportId, version }),
        });
        const data = await response.json().catch(() => ({})) as {
          downloadUrl?: string;
          error?: string;
        };
        if (response.status === 202) {
          await delay(750);
          continue;
        }
        if (!response.ok || !data.downloadUrl) throw new Error(data.error || 'PDF 导出失败');
        downloadUrl = data.downloadUrl;
        break;
      }
      if (!downloadUrl) throw new Error('PDF 仍在生成，请稍后重试');
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : 'PDF 导出失败');
    } finally {
      setBusy(false);
    }
  };

  const className = tone === 'rectification'
    ? 'btn-ghost !px-3 !py-2'
    : tone === 'annual'
      ? 'rounded-lg px-3 py-1.5 text-[10px] transition-opacity disabled:cursor-not-allowed disabled:opacity-40'
      : 'rounded-lg px-3 py-2 text-xs disabled:opacity-40';
  const style = tone === 'rectification'
    ? undefined
    : tone === 'annual'
      ? { color: 'var(--t-text)', border: '1px solid var(--t-border)' }
      : { color: 'var(--t-gold)', border: '1px solid rgba(212,168,67,.28)', background: 'rgba(212,168,67,.05)' };

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={() => void download()}
        disabled={disabled || busy}
        className={className}
        style={style}
        title={error || '生成并下载服务端 PDF 文件'}
      >
        <span className="inline-flex items-center gap-1.5">
          {busy ? <SpinnerGap className="animate-spin" size={15} /> : <DownloadSimple size={15} />}
          {busy ? '正在生成 PDF…' : error ? '导出失败，重试' : '下载 PDF'}
        </span>
      </button>
      {error && <span role="alert" className="mt-1 max-w-56 text-right text-[8px] text-red-500">{error}</span>}
    </span>
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}
