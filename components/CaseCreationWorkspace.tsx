'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ConversationListItem } from '@/lib/conversations/types';
import type { CaseAnonymizationPreview, CaseConfidence, CaseConsentScope } from '@/lib/cases/types';

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

export default function CaseCreationWorkspace() {
  const router = useRouter();
  const [charts, setCharts] = useState<ConversationListItem[]>([]);
  const [conversationId, setConversationId] = useState('');
  const [preview, setPreview] = useState<CaseAnonymizationPreview | null>(null);
  const [title, setTitle] = useState('');
  const [confidence, setConfidence] = useState<CaseConfidence>('medium');
  const [teaching, setTeaching] = useState(false);
  const [anonymousExport, setAnonymousExport] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/conversations?type=chart&limit=100', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json().catch(() => ({})) as { conversations?: ConversationListItem[]; error?: string };
        if (!response.ok) throw new Error(data.error || '命盘列表加载失败');
        setCharts(data.conversations ?? []);
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '命盘列表加载失败');
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  async function generatePreview() {
    if (!conversationId) return;
    setPreviewing(true);
    setError('');
    setPreview(null);
    setAcknowledged(false);
    try {
      const response = await fetch('/api/cases/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      const data = await response.json().catch(() => ({})) as { preview?: CaseAnonymizationPreview; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error || '脱敏预览生成失败');
      setPreview(data.preview);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : '脱敏预览生成失败');
    } finally {
      setPreviewing(false);
    }
  }

  async function createCase() {
    if (!preview || !acknowledged || saving) return;
    setSaving(true);
    setError('');
    const scopes: CaseConsentScope[] = ['local_only'];
    if (teaching) scopes.push('teaching');
    if (anonymousExport) scopes.push('anonymous_export');
    try {
      const response = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, acknowledged, title, confidence, scopes }),
      });
      const data = await response.json().catch(() => ({})) as { case?: { id: string }; error?: string };
      if (!response.ok || !data.case) throw new Error(data.error || '匿名案例创建失败');
      router.push(`/cases/${data.case.id}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '匿名案例创建失败');
      setSaving(false);
    }
  }

  return (
    <main className="case-form mx-auto min-h-screen max-w-[1050px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-8">
        <Link href="/cases" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回案例库</Link>
        <div className="mt-5 text-[10px] font-medium tracking-[.28em]" style={{ color: 'var(--t-gold)' }}>ANONYMIZATION PREVIEW</div>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>创建匿名案例</h1>
        <p className="mt-3 max-w-3xl text-xs leading-7" style={{ color: 'var(--t-text2)' }}>整个过程分为选择命盘、查看脱敏结果、明确用途三步。生成预览不会写入案例库。</p>
      </header>

      {error && <div className="mb-5 rounded-lg px-4 py-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.25)' }}>{error}</div>}

      <section className="rounded-2xl card-glass p-5 sm:p-6">
        <StepHeader number="01" title="选择本地命盘" description="仅支持已有完整快照的单人命盘。合盘不会在本阶段进入案例库。" />
        {loading ? (
          <div className="mt-5 text-xs" style={{ color: 'var(--t-faint)' }}>正在读取本地命盘…</div>
        ) : charts.length ? (
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <select
              value={conversationId}
              onChange={event => { setConversationId(event.target.value); setPreview(null); setAcknowledged(false); }}
              className="min-w-0 flex-1 rounded-lg px-3 py-3 text-xs outline-none"
              style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }}
            >
              <option value="">请选择命盘</option>
              {charts.map(chart => <option key={chart.id} value={chart.id}>{chart.title}</option>)}
            </select>
            <button type="button" disabled={!conversationId || previewing} onClick={generatePreview} className="rounded-lg px-5 py-3 text-xs disabled:opacity-40" style={{ color: '#fff8e8', background: '#9a6210' }}>
              {previewing ? '正在脱敏…' : '生成脱敏预览'}
            </button>
          </div>
        ) : (
          <div className="mt-5 rounded-lg p-4 text-xs" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}>暂无可用单人命盘。<Link href="/chart" className="ml-1" style={{ color: 'var(--t-gold)' }}>先去起盘 →</Link></div>
        )}
      </section>

      {preview && (
        <>
          <section className="mt-5 rounded-2xl card-glass p-5 sm:p-6">
            <StepHeader number="02" title="核对脱敏结果" description="这里只展示匿名案例将保留或移除的字段，不展示已移除字段的原始值。" />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {preview.privacyItems.map(item => (
                <div key={item.key} className="rounded-xl p-4" style={{ border: '1px solid var(--t-border)' }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs" style={{ color: 'var(--t-text)' }}>{item.label}</span>
                    <HandlingBadge handling={item.handling} />
                  </div>
                  <p className="mt-2 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>{item.result}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 rounded-xl p-5" style={{ background: 'var(--ac-bg)', border: '1px solid var(--t-border-acc)' }}>
              <div className="text-[10px] tracking-[.16em]" style={{ color: 'var(--t-gold)' }}>匿名结构摘要</div>
              <div className="mt-3 flex flex-wrap gap-2 text-[10px]" style={{ color: 'var(--t-text2)' }}>
                <span className="rounded-full px-2.5 py-1" style={{ border: '1px solid var(--t-border)' }}>{preview.chartSnapshot.wuxingJuName}</span>
                <span className="rounded-full px-2.5 py-1" style={{ border: '1px solid var(--t-border)' }}>命宫：{BRANCHES[preview.chartSnapshot.mingGongBranch]}</span>
                <span className="rounded-full px-2.5 py-1" style={{ border: '1px solid var(--t-border)' }}>身宫：{BRANCHES[preview.chartSnapshot.shenGongBranch]}</span>
                <span className="rounded-full px-2.5 py-1" style={{ border: '1px solid var(--t-border)' }}>年龄段：{preview.chartSnapshot.profile.currentAgeBand}</span>
                <span className="rounded-full px-2.5 py-1" style={{ border: '1px solid var(--t-border)' }}>已确认匿名事件：{preview.confirmedEventCount} 条</span>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-2xl card-glass p-5 sm:p-6">
            <StepHeader number="03" title="设置案例信息与用途" description="本地保存是必选项；教学使用和匿名导出可以随时在案例详情中撤销。" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-[11px]" style={{ color: 'var(--t-text2)' }}>
                案例标题（不要填写真实姓名）
                <input value={title} onChange={event => setTitle(event.target.value)} maxLength={60} placeholder="例如：命宫紫微七杀结构案例" className="mt-2 w-full rounded-lg px-3 py-3 text-xs outline-none" style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }} />
              </label>
              <label className="text-[11px]" style={{ color: 'var(--t-text2)' }}>
                资料可信度
                <select value={confidence} onChange={event => setConfidence(event.target.value as CaseConfidence)} className="mt-2 w-full rounded-lg px-3 py-3 text-xs outline-none" style={{ color: 'var(--t-text)', background: 'var(--t-card)', border: '1px solid var(--t-border)' }}>
                  <option value="low">较低：出生资料或事件仍待确认</option>
                  <option value="medium">中等：本人提供，缺少其他佐证</option>
                  <option value="high">较高：关键资料已多方核对</option>
                </select>
              </label>
            </div>

            <div className="mt-5 grid gap-3">
              <ConsentRow checked disabled title="仅保存在本机" description="案例存在所必需；不会自动上传，也不会自动公开。" />
              <ConsentRow checked={teaching} onChange={setTeaching} title="允许用于本地教学练习" description="后续可进入本机案例教学与对比功能。" />
              <ConsentRow checked={anonymousExport} onChange={setAnonymousExport} title="允许导出匿名 JSON" description="仍需案例先通过复核；撤销后导出接口立即失效。" />
              <ConsentRow checked={false} disabled title="允许公开发布（暂不可用）" description="M7-0 不提供网络发布能力，避免误操作。" />
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl p-4" style={{ border: '1px solid var(--t-border-acc)', background: 'var(--ac-bg)' }}>
              <input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-700" />
              <span className="text-[11px] leading-6" style={{ color: 'var(--t-text2)' }}>我已经查看上方脱敏预览，并确认本次保存只包含列出的匿名结构和已概括事件。</span>
            </label>

            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <Link href="/cases" className="rounded-lg px-5 py-3 text-xs" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>取消</Link>
              <button type="button" onClick={createCase} disabled={!acknowledged || saving} className="rounded-lg px-5 py-3 text-xs disabled:opacity-40" style={{ color: '#fff8e8', background: 'linear-gradient(135deg,#9a6210,#c88020)' }}>{saving ? '正在保存…' : '确认并保存匿名案例'}</button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function StepHeader({ number, title, description }: { number: string; title: string; description: string }) {
  return <div className="flex items-start gap-4"><div className="font-mono text-xs" style={{ color: 'var(--t-gold)' }}>{number}</div><div><h2 className="text-base font-semibold" style={{ color: 'var(--t-text)' }}>{title}</h2><p className="mt-1 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>{description}</p></div></div>;
}

function HandlingBadge({ handling }: { handling: 'removed' | 'generalized' | 'retained' }) {
  const config = handling === 'removed' ? ['已移除', '#22c55e'] : handling === 'generalized' ? ['已概括', '#f59e0b'] : ['已保留', 'var(--t-gold)'];
  return <span className="rounded-full px-2 py-1 text-[9px]" style={{ color: config[1], border: `1px solid ${config[1]}` }}>{config[0]}</span>;
}

function ConsentRow({ checked, onChange, disabled = false, title, description }: { checked: boolean; onChange?: (value: boolean) => void; disabled?: boolean; title: string; description: string }) {
  return <label className="flex items-start gap-3 rounded-xl p-4" style={{ opacity: disabled && !checked ? .55 : 1, border: '1px solid var(--t-border)' }}><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange?.(event.target.checked)} className="mt-0.5 h-4 w-4 accent-amber-700" /><span><span className="block text-xs" style={{ color: 'var(--t-text)' }}>{title}</span><span className="mt-1 block text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>{description}</span></span></label>;
}
