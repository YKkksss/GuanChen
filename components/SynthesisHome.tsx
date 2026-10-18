'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { BirthInfo } from '@/lib/ziwei/types';
import type { SynthesisPolicy, SynthesisSession } from '@/lib/synthesis/types';
import styles from './SynthesisWorkspace.module.css';
async function json<T>(url: string, init?: RequestInit): Promise<T> { const r = await fetch(url, { cache: 'no-store', ...init }); let v: T & { error?: string }; try { v = await r.json(); } catch { throw new Error('服务没有返回有效数据，请稍后重试'); } if (!r.ok) throw new Error(v.error || '操作失败，请稍后重试'); return v; }
type Form = { displayName: string; birthDate: string; birthTime: string; gender: '' | 'male' | 'female'; unknownTime: boolean; timeStandard: 'civil_time' | 'apparent_solar_time'; lateZiPolicy: 'same_day' | 'next_day'; longitude: string };
export default function SynthesisHome({ sourceId = '' }: { sourceId?: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Form>({ displayName: '', birthDate: '', birthTime: '', gender: '', unknownTime: false, timeStandard: 'civil_time', lateZiPolicy: 'next_day', longitude: '' });
  const [sessions, setSessions] = useState<SynthesisSession[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(''), [query, setQuery] = useState(''), [removeId, setRemoveId] = useState(''), [refresh, setRefresh] = useState(0);
  const [preview, setPreview] = useState<{ policy: SynthesisPolicy; pillars: string[]; ziweiLunarYear: number } | null>(null), [sourceTitle, setSourceTitle] = useState('');
  const seeded = useRef(false), operation = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    void json<{ sessions: SynthesisSession[]; source: { title: string; birth: BirthInfo } | null }>(`/api/synthesis${sourceId ? `?source=${encodeURIComponent(sourceId)}` : ''}`, { signal: controller.signal }).then(v => {
      if (controller.signal.aborted) return;
      setSessions(v.sessions);
      if (v.source && !seeded.current) { seeded.current = true; const b = v.source.birth; setSourceTitle(v.source.title); setForm(f => ({ ...f, displayName: b.name ?? v.source!.title, birthDate: `${b.year}-${String(b.month).padStart(2, '0')}-${String(b.day).padStart(2, '0')}`, gender: b.gender, unknownTime: Boolean(b.unknownTime), longitude: b.longitude === undefined ? '' : String(b.longitude) })); }
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sourceId, refresh]);
  useEffect(() => () => operation.current?.abort(), []);
  const update = <K extends keyof Form>(key: K, value: Form[K]) => { setForm(f => ({ ...f, [key]: value, ...(key === 'unknownTime' && value ? { birthTime: '', timeStandard: 'civil_time' as const } : {}) })); setPreview(null); setError(''); };
  const body = () => ({ displayName: form.displayName, birthDate: form.birthDate, ...(form.unknownTime ? {} : { birthTime: form.birthTime }), gender: form.gender, unknownTime: form.unknownTime, timeStandard: form.timeStandard, lateZiPolicy: form.lateZiPolicy, timeZoneId: 'Etc/GMT-8', ...(form.longitude.trim() ? { longitude: Number(form.longitude) } : {}), ...(sourceId ? { sourceConversationId: sourceId } : {}) });
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'preview' ? 'preview' : 'create';
    if (busy) return;
    const controller = new AbortController(); operation.current = controller; setBusy(action); setError('');
    try { if (action === 'preview') { const v = await json<NonNullable<typeof preview>>('/api/synthesis/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()), signal: controller.signal }); if (!controller.signal.aborted) setPreview(v); }
      else { const v = await json<{ session: SynthesisSession }>('/api/synthesis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body()), signal: controller.signal }); if (!controller.signal.aborted) router.push(`/synthesis/${v.session.id}`); }
    } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : '建立双盘失败'); }
    finally { if (!controller.signal.aborted) setBusy(''); }
  };
  const remove = async (id: string) => { setBusy(id); setError(''); try { await json(`/api/synthesis/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}' }); setRemoveId(''); setRefresh(v => v + 1); } catch (e) { setError(e instanceof Error ? e.message : '移除失败'); } finally { setBusy(''); } };
  return <main className={styles.workspace}>
    <header className={styles.header}><div><p className={styles.eyebrow}>同一份出生资料 · 两套独立观察</p><h1>紫微与八字合参</h1><p>先分别看懂两套命盘，再比较同一主题的共同观察与不同观点。</p></div></header>
    {error && <div role="alert" className={styles.error}>{error}<button type="button" onClick={() => setRefresh(v => v + 1)}>重新加载</button></div>}
    <div className={styles.homeGrid}><section className={styles.card}><h2>建立双盘</h2><p className={styles.note}>本入口使用北京时间标准时（UTC+08:00）。其他时区或历史夏令时记录请先换算为标准时。</p>
      {sourceTitle && <p className={styles.caution}>来自“{sourceTitle}”的日期与性别仅作预填。旧盘只保存时辰，请核对原始公历日期并补充准确时分，原来的命盘仍可独立查看。</p>}
      <form onSubmit={e => void submit(e)}><fieldset disabled={Boolean(busy) || loading} className={styles.fields}>
        <label>命盘名称<input required maxLength={80} value={form.displayName} onChange={e => update('displayName', e.target.value)} placeholder="给这份合参命盘起个名称" /></label>
        <label>出生日期<input type="date" required min="1900-01-01" max="2100-12-31" value={form.birthDate} onChange={e => update('birthDate', e.target.value)} /></label>
        <label className={styles.checkbox}><input type="checkbox" checked={form.unknownTime} onChange={e => update('unknownTime', e.target.checked)} />出生时间未知</label>
        {!form.unknownTime && <label>出生时间<input type="time" step="1" required value={form.birthTime} onChange={e => update('birthTime', e.target.value)} /></label>}
        <label>性别<select required value={form.gender} onChange={e => update('gender', e.target.value as Form['gender'])}><option value="">请选择</option><option value="male">男</option><option value="female">女</option></select></label>
        <details className={styles.evidence}><summary>时间与排盘设置</summary><label>时间标准<select value={form.timeStandard} disabled={form.unknownTime} onChange={e => update('timeStandard', e.target.value as Form['timeStandard'])}><option value="civil_time">北京时间标准时</option><option value="apparent_solar_time">统一换算为真太阳时</option></select></label><label>出生地经度<input type="number" step="any" min="-180" max="180" required={form.timeStandard === 'apparent_solar_time'} value={form.longitude} onChange={e => update('longitude', e.target.value)} placeholder="东经为正，例如 116.4" /></label><label>晚子时设置<select value={form.lateZiPolicy} onChange={e => update('lateZiPolicy', e.target.value as Form['lateZiPolicy'])}><option value="next_day">23 点起按次日</option><option value="same_day">23 点仍按当日</option></select></label><p className={styles.note}>真太阳时两盘只校正一次；时辰未知时不假设时间做校正。晚子时口径会分别记录到两盘。</p></details>
        <div className={styles.actions}><button type="submit" value="preview" className={styles.secondary}>{busy === 'preview' ? '正在核对…' : '预览时间口径'}</button><button type="submit" value="create" className={styles.primary}>{busy === 'create' ? '正在建立…' : '建立并保存双盘'}</button></div>
      </fieldset></form>
      {preview && <div className={styles.preview} role="status"><strong>口径预览</strong><p>有效日期：{preview.policy.effectiveDate} · {preview.policy.effectiveTime}</p><p>紫微：{preview.policy.ziweiDate} · {preview.policy.ziweiTimeLabel}</p><p>八字：{preview.pillars.join(' · ')}</p><p className={styles.note}>紫微农历出生年：{preview.ziweiLunarYear}。年/月界按两套规则分别处理；预览尚未保存档案。</p></div>}
    </section><section className={styles.card} aria-label="我的合参命盘"><h2>我的合参命盘</h2><p className={styles.note}>最近 100 份，双盘与报告均保存在当前账号。</p><label className={styles.search}>按名称查找<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="输入命盘名称" /></label>
      {loading ? <p role="status">正在加载…</p> : sessions.filter(s => s.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).length ? <ul className={styles.entries}>{sessions.filter(s => s.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).map(s => <li key={s.id}><div className={styles.entry}><Link href={`/synthesis/${s.id}`}><strong>{s.title}</strong><small>{s.input.birthDate} · {s.policy.unknownTime ? '时辰未知' : s.input.birthTime} · {s.policy.timeStandard === 'civil_time' ? '标准时' : '真太阳时'}</small></Link><button type="button" className={styles.textButton} disabled={Boolean(busy)} aria-label={`移除合参 ${s.title}`} onClick={() => setRemoveId(s.id)}>移除</button></div>{removeId === s.id && <div className={styles.caution} role="alert"><p>移除这份合参及其报告？独立的紫微和八字档案会保留。</p><div className={styles.actions}><button type="button" onClick={() => setRemoveId('')}>取消</button><button type="button" disabled={Boolean(busy)} onClick={() => void remove(s.id)}>确定移除</button></div></div>}</li>)}</ul> : <p className={styles.empty}>{query ? '没有匹配的合参命盘。' : '还没有合参命盘，录入一次出生资料即可开始。'}</p>}
    </section></div>
  </main>;
}
