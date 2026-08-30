'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  Bell,
  CalendarBlank,
  Clock,
  Plus,
  Repeat,
  X,
} from '@phosphor-icons/react';
import type { ConversationListItem } from '@/lib/conversations/types';
import type { LifeEventWithTransits } from '@/lib/events/types';
import type {
  CustomReminderRecurrence,
  ReminderConfig,
  ReminderInstance,
  ReminderInstanceStatus,
  ReminderKind,
  ReminderRule,
  ReminderRuleStatus,
  ReminderTransitLevel,
} from '@/lib/reminders/types';

type WorkspaceView = 'instances' | 'rules';
const DEFAULT_TITLES: Record<ReminderKind, string> = {
  monthly_review: '每月复盘', birthday_review: '生日年度回顾',
  transit_change: '运限阶段观察', event_anniversary: '人生事件周年回顾',
  custom: '自定义提醒',
};
const KIND_LABELS: Record<ReminderKind, string> = {
  monthly_review: '月度复盘', birthday_review: '生日回顾', transit_change: '流年或大限',
  event_anniversary: '事件周年', custom: '自定义',
};

export default function ReminderCenterWorkspace() {
  const [view, setView] = useState<WorkspaceView>('instances');
  const [rules, setRules] = useState<ReminderRule[]>([]);
  const [instances, setInstances] = useState<ReminderInstance[]>([]);
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const materializeResponse = await fetch('/api/reminders/materialize', { method: 'POST' });
      if (!materializeResponse.ok) {
        const materializeData = await materializeResponse.json().catch(() => ({})) as { error?: string };
        throw new Error(materializeData.error || '提醒生成失败');
      }
      const [ruleResponse, instanceResponse, conversationResponse] = await Promise.all([
        fetch('/api/reminders?limit=100', { cache: 'no-store' }),
        fetch('/api/reminder-instances?limit=200', { cache: 'no-store' }),
        fetch('/api/conversations?type=chart&status=active&limit=100', { cache: 'no-store' }),
      ]);
      const [ruleData, instanceData, conversationData] = await Promise.all([
        ruleResponse.json() as Promise<{ rules?: ReminderRule[]; error?: string }>,
        instanceResponse.json() as Promise<{ instances?: ReminderInstance[]; error?: string }>,
        conversationResponse.json() as Promise<{ conversations?: ConversationListItem[]; error?: string }>,
      ]);
      if (!ruleResponse.ok) throw new Error(ruleData.error || '提醒规则加载失败');
      if (!instanceResponse.ok) throw new Error(instanceData.error || '提醒实例加载失败');
      if (!conversationResponse.ok) throw new Error(conversationData.error || '命盘列表加载失败');
      setRules(ruleData.rules ?? []);
      setInstances(instanceData.instances ?? []);
      setConversations(conversationData.conversations ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '提醒中心加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  const due = useMemo(() => instances.filter(item => item.displayStatus === 'due'), [instances]);
  const upcoming = useMemo(() => instances.filter(item => item.displayStatus === 'upcoming'), [instances]);
  const history = useMemo(() => instances.filter(item => item.status !== 'pending').reverse(), [instances]);

  async function updateInstance(id: string, status: ReminderInstanceStatus) {
    setBusyId(id);
    setError('');
    try {
      const response = await fetch(`/api/reminder-instances/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      const data = await response.json() as { instance?: ReminderInstance; error?: string };
      if (!response.ok || !data.instance) throw new Error(data.error || '提醒状态更新失败');
      setInstances(current => current.map(item => item.id === id ? data.instance! : item));
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '提醒状态更新失败');
    } finally {
      setBusyId('');
    }
  }

  async function updateRule(rule: ReminderRule, status: ReminderRuleStatus) {
    setBusyId(rule.id);
    setError('');
    try {
      const response = await fetch(`/api/reminders/${rule.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      });
      const data = await response.json() as { rule?: ReminderRule; error?: string };
      if (!response.ok || !data.rule) throw new Error(data.error || '提醒规则更新失败');
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '提醒规则更新失败');
    } finally {
      setBusyId('');
    }
  }

  async function deleteRule(rule: ReminderRule) {
    if (!window.confirm(`确定删除提醒规则“${rule.title}”吗？相关提醒实例也会删除。`)) return;
    setBusyId(rule.id);
    try {
      const response = await fetch(`/api/reminders/${rule.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || '提醒规则删除失败');
      }
      await loadData();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '提醒规则删除失败');
    } finally {
      setBusyId('');
    }
  }

  return (
    <main className="case-form mx-auto min-h-screen max-w-[1180px] px-4 py-7 sm:px-6 sm:py-10">
      <header className="mb-7 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-xs" style={{ color: 'var(--t-faint)' }}>← 返回首页</Link>
          <div className="mt-5 text-[10px] font-medium tracking-[.28em]" style={{ color: 'var(--t-gold)' }}>LOCAL REMINDER CENTER</div>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl" style={{ color: 'var(--t-text)' }}>本地提醒中心</h1>
          <p className="mt-3 max-w-3xl text-xs leading-7" style={{ color: 'var(--t-text2)' }}>管理周期复盘、生日回顾、流年大限和事件周年。本页只在应用打开时检查本地提醒，不发送短信、邮件或第三方通知。</p>
        </div>
        <div className="flex flex-wrap gap-2"><Link href="/reviews" className="flex items-center gap-2 rounded-lg px-5 py-3 text-xs" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)' }}>月度复盘</Link><button type="button" onClick={() => setFormOpen(true)} className="flex items-center gap-2 rounded-lg px-5 py-3 text-xs" style={{ color: '#fffaf3', background: 'var(--ac)' }}><Plus size={14} />新建提醒</button></div>
      </header>

      <section className="mb-5 grid grid-cols-3 gap-3">
        <OverviewMetric label="当前到期" value={due.length} color={due.length ? '#f59e0b' : '#22c55e'} />
        <OverviewMetric label="未来计划" value={upcoming.length} color="var(--t-gold)" />
        <OverviewMetric label="启用规则" value={rules.filter(rule => rule.status === 'enabled').length} color="#60a5fa" />
      </section>

      <section className="mb-6 flex rounded-xl p-1" style={{ border: '1px solid var(--t-border)', background: 'var(--t-card)' }}>
        <ViewButton active={view === 'instances'} onClick={() => setView('instances')} title="待办与历史" subtitle="处理已经生成的提醒" />
        <ViewButton active={view === 'rules'} onClick={() => setView('rules')} title="规则管理" subtitle="启用、停用与归档" />
      </section>

      {error && <div className="mb-5 rounded-lg p-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.3)' }}>{error}</div>}
      {loading ? <PageState text="正在检查本地提醒…" /> : view === 'instances' ? (
        <div className="space-y-7">
          <InstanceSection title="当前到期" subtitle="已经到达提醒时间，处理后会进入历史" count={due.length} accent="#f59e0b" emptyText="当前没有待处理提醒。">
            {due.map(item => <InstanceCard key={item.id} item={item} busy={busyId === item.id} onStatus={status => updateInstance(item.id, status)} />)}
          </InstanceSection>
          <InstanceSection title="未来计划" subtitle="按照时间顺序显示未来 400 天的提醒" count={upcoming.length} accent="var(--t-gold)" emptyText="还没有未来提醒，可以先新建一条规则。">
            {upcoming.map(item => <InstanceCard key={item.id} item={item} busy={busyId === item.id} onStatus={status => updateInstance(item.id, status)} />)}
          </InstanceSection>
          <InstanceSection title="处理历史" subtitle="完成和忽略记录保留在本地，可重新打开" count={history.length} accent="var(--t-faint)" emptyText="还没有处理历史。">
            {history.map(item => <InstanceCard key={item.id} item={item} busy={busyId === item.id} onStatus={status => updateInstance(item.id, status)} />)}
          </InstanceSection>
        </div>
      ) : (
        <RuleList rules={rules} busyId={busyId} onStatus={updateRule} onDelete={deleteRule} onCreate={() => setFormOpen(true)} />
      )}

      {formOpen && <ReminderRuleForm conversations={conversations} onClose={() => setFormOpen(false)} onCreated={async () => { setFormOpen(false); await loadData(); }} />}
    </main>
  );
}

function ReminderRuleForm({ conversations, onClose, onCreated }: { conversations: ConversationListItem[]; onClose: () => void; onCreated: () => Promise<void> }) {
  const [kind, setKind] = useState<ReminderKind>('monthly_review');
  const [title, setTitle] = useState(DEFAULT_TITLES.monthly_review);
  const [conversationId, setConversationId] = useState('');
  const [events, setEvents] = useState<LifeEventWithTransits[]>([]);
  const [eventId, setEventId] = useState('');
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [leadDays, setLeadDays] = useState(7);
  const [hour, setHour] = useState(9);
  const [minute, setMinute] = useState(0);
  const [transitLevel, setTransitLevel] = useState<ReminderTransitLevel>('annual');
  const [customDate, setCustomDate] = useState('');
  const [recurrence, setRecurrence] = useState<CustomReminderRecurrence>('none');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (kind !== 'event_anniversary' || !conversationId) { setEvents([]); setEventId(''); return; }
    const controller = new AbortController();
    fetch(`/api/conversations/${conversationId}/events`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const data = await response.json() as { events?: LifeEventWithTransits[]; error?: string };
        if (!response.ok) throw new Error(data.error || '事件列表加载失败');
        setEvents((data.events ?? []).filter(event => event.confirmedByUser && event.datePrecision === 'day'));
      })
      .catch(loadError => {
        if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
        setError(loadError instanceof Error ? loadError.message : '事件列表加载失败');
      });
    return () => controller.abort();
  }, [conversationId, kind]);

  function changeKind(value: ReminderKind) {
    setKind(value);
    setTitle(DEFAULT_TITLES[value]);
    setConversationId('');
    setEventId('');
    setError('');
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const config: ReminderConfig = kind === 'monthly_review'
        ? { kind, dayOfMonth, hour, minute }
        : kind === 'birthday_review'
          ? { kind, leadDays, hour, minute }
          : kind === 'transit_change'
            ? { kind, level: transitLevel, leadDays, hour, minute }
            : kind === 'event_anniversary'
              ? { kind, leadDays, hour, minute }
              : { kind, date: customDate, recurrence, hour, minute };
      const response = await fetch('/api/reminders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, kind, timezone: 'Asia/Shanghai', config,
          conversationId: supportsConversation(kind) && conversationId ? conversationId : null,
          eventId: kind === 'event_anniversary' ? eventId : null,
        }),
      });
      const data = await response.json() as { rule?: ReminderRule; error?: string };
      if (!response.ok || !data.rule) throw new Error(data.error || '提醒规则创建失败');
      await onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '提醒规则创建失败');
    } finally {
      setSaving(false);
    }
  }

  const eligibleEvents = events;
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-5"><section role="dialog" aria-modal="true" aria-labelledby="reminder-form-title" className="max-h-[92vh] w-full max-w-[720px] overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl sm:p-6" style={{ background: 'var(--t-bg)', border: '1px solid var(--t-border-acc)' }}><div className="flex items-start justify-between gap-4"><div><div className="text-[9px] tracking-[.22em]" style={{ color: 'var(--t-gold)' }}>NEW LOCAL REMINDER</div><h2 id="reminder-form-title" className="mt-1 text-lg font-semibold" style={{ color: 'var(--t-text)' }}>新建本地提醒</h2><p className="mt-2 text-[10px] leading-5" style={{ color: 'var(--t-faint)' }}>提醒只保存在这台设备的 SQLite 中，应用未运行时不会弹出通知。</p></div><button type="button" aria-label="关闭新建提醒" onClick={onClose} className="rounded-lg p-2" style={{ color: 'var(--t-faint)', border: '1px solid var(--t-border)' }}><X size={15} /></button></div>
    <form onSubmit={submit} className="mt-6 space-y-5">
      <div className="grid gap-2 sm:grid-cols-5">{(Object.keys(KIND_LABELS) as ReminderKind[]).map(value => <button key={value} type="button" onClick={() => changeKind(value)} className="rounded-lg px-3 py-3 text-[10px]" style={kind === value ? { color: '#fffaf3', background: 'var(--ac)' } : { color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>{KIND_LABELS[value]}</button>)}</div>
      <Field label="提醒标题"><input required maxLength={80} value={title} onChange={event => setTitle(event.target.value)} className="field-control" /></Field>
      {kind === 'monthly_review' && <Field label="关联单人命盘（建议选择）"><select value={conversationId} onChange={event => setConversationId(event.target.value)} className="field-control"><option value="">暂不关联</option>{conversations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><Hint text="关联后，从提醒开始复盘时会自动选中对应命盘。" /></Field>}
      {requiresConversation(kind) && <Field label="关联单人命盘"><select required value={conversationId} onChange={event => setConversationId(event.target.value)} className="field-control"><option value="">请选择命盘</option>{conversations.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>{!conversations.length && <Hint text="还没有可关联的单人命盘，请先完成一次起盘。" />}</Field>}
      {kind === 'event_anniversary' && conversationId && <Field label="已确认的精确日期事件"><select required value={eventId} onChange={event => setEventId(event.target.value)} className="field-control"><option value="">请选择事件</option>{eligibleEvents.map(item => <option key={item.id} value={item.id}>{item.startDate} · {item.title}</option>)}</select>{!eligibleEvents.length && <Hint text="这个命盘还没有精确到日且已确认的人生事件。" />}</Field>}
      {kind === 'monthly_review' && <Field label="每月日期"><input type="number" min={1} max={31} value={dayOfMonth} onChange={event => setDayOfMonth(Number(event.target.value))} className="field-control" /><Hint text="短月份会自动落到当月最后一天。" /></Field>}
      {kind === 'transit_change' && <Field label="观察层级"><select value={transitLevel} onChange={event => setTransitLevel(event.target.value as ReminderTransitLevel)} className="field-control"><option value="annual">新流年观察</option><option value="daxian">新大限阶段</option></select></Field>}
      {kind === 'custom' && <div className="grid gap-4 sm:grid-cols-2"><Field label="提醒日期"><input required type="date" value={customDate} onChange={event => setCustomDate(event.target.value)} className="field-control" /></Field><Field label="重复方式"><select value={recurrence} onChange={event => setRecurrence(event.target.value as CustomReminderRecurrence)} className="field-control"><option value="none">仅一次</option><option value="monthly">每月</option><option value="yearly">每年</option></select></Field></div>}
      {(kind === 'birthday_review' || kind === 'transit_change' || kind === 'event_anniversary') && <Field label="提前提醒"><div className="flex items-center gap-3"><input type="number" min={0} max={60} value={leadDays} onChange={event => setLeadDays(Number(event.target.value))} className="field-control" /><span className="shrink-0 text-xs" style={{ color: 'var(--t-faint)' }}>天</span></div></Field>}
      <div className="grid gap-4 sm:grid-cols-2"><Field label="提醒小时"><input type="number" min={0} max={23} value={hour} onChange={event => setHour(Number(event.target.value))} className="field-control" /></Field><Field label="提醒分钟"><input type="number" min={0} max={59} value={minute} onChange={event => setMinute(Number(event.target.value))} className="field-control" /></Field></div>
      <div className="rounded-lg p-3 text-[10px] leading-5" style={{ color: 'var(--t-text2)', background: 'var(--ac-bg)', border: '1px solid var(--t-border)' }}>时区固定为中国标准时间（Asia/Shanghai）。流年和大限提醒只是观察待办，具体分析仍使用项目已有的确定性运限引擎。</div>
      {error && <div className="rounded-lg p-3 text-xs text-red-500" style={{ border: '1px solid rgba(239,68,68,.3)' }}>{error}</div>}
      <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg px-5 py-3 text-xs" style={{ color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>取消</button><button type="submit" disabled={saving} className="rounded-lg px-5 py-3 text-xs disabled:opacity-40" style={{ color: '#fffaf3', background: 'var(--ac)' }}>{saving ? '正在生成提醒…' : '保存并生成提醒'}</button></div>
    </form>
  </section></div>;
}

function InstanceSection({ title, subtitle, count, accent, emptyText, children }: { title: string; subtitle: string; count: number; accent: string; emptyText: string; children: ReactNode }) { return <section><div className="mb-3 flex items-end justify-between"><div><h2 className="text-base font-semibold" style={{ color: 'var(--t-text)' }}>{title}</h2><p className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>{subtitle}</p></div><span className="text-[10px]" style={{ color: accent }}>{count} 条</span></div>{count ? <div className="grid gap-3 md:grid-cols-2">{children}</div> : <div className="rounded-xl card-glass px-5 py-12 text-center text-xs" style={{ color: 'var(--t-faint)' }}>{emptyText}</div>}</section>; }
function InstanceCard({ item, busy, onStatus }: { item: ReminderInstance; busy: boolean; onStatus: (status: ReminderInstanceStatus) => void }) { const isPending = item.status === 'pending'; return <article className="rounded-xl card-glass p-4"><div className="flex items-start justify-between gap-3"><div><span className="rounded-full px-2 py-1 text-[8px]" style={instanceBadgeStyle(item)}>{displayStatusLabel(item)}</span><h3 className="mt-3 text-sm font-medium" style={{ color: 'var(--t-text)' }}>{item.title}</h3></div><Bell size={17} style={{ color: item.displayStatus === 'due' ? '#f59e0b' : 'var(--t-gold)' }} /></div><div className="mt-3 space-y-1.5 text-[9px]" style={{ color: 'var(--t-text2)' }}><p className="flex items-center gap-2"><Clock size={12} />{formatTimestamp(item.dueAt)}</p><p className="flex items-center gap-2"><CalendarBlank size={12} />对应日期：{item.scheduledFor}</p><p>{item.payload.sourceLabel}</p></div><details className="mt-3 rounded-lg p-3 text-[9px]" style={{ background: 'var(--ac-bg)', color: 'var(--t-faint)' }}><summary className="cursor-pointer">查看计算边界</summary><p className="mt-2 leading-5">{item.payload.boundaryNote}</p></details>{item.payload.kind === 'monthly_review' && <Link href={monthlyReviewLink(item)} className="mr-3 mt-3 inline-block text-[9px]" style={{ color: 'var(--t-gold)' }}>开始月度复盘 →</Link>}{item.payload.conversationId && <Link href={`/chart/${item.payload.conversationId}`} className="mt-3 inline-block text-[9px]" style={{ color: 'var(--t-gold)' }}>打开关联命盘 →</Link>}<div className="mt-4 flex flex-wrap justify-end gap-2">{isPending ? <><ActionButton disabled={busy} onClick={() => onStatus('dismissed')} label="忽略" /><ActionButton disabled={busy} onClick={() => onStatus('completed')} label="完成" accent /></> : <ActionButton disabled={busy} onClick={() => onStatus('pending')} label="重新打开" />}</div></article>; }
function RuleList({ rules, busyId, onStatus, onDelete, onCreate }: { rules: ReminderRule[]; busyId: string; onStatus: (rule: ReminderRule, status: ReminderRuleStatus) => void; onDelete: (rule: ReminderRule) => void; onCreate: () => void }) { if (!rules.length) return <div className="rounded-2xl card-glass px-5 py-20 text-center"><p className="text-sm" style={{ color: 'var(--t-text)' }}>还没有提醒规则</p><button type="button" onClick={onCreate} className="mt-5 rounded-lg px-5 py-3 text-xs" style={{ color: 'var(--t-gold)', border: '1px solid var(--t-border-acc)' }}>创建第一条提醒</button></div>; return <div className="grid gap-3 md:grid-cols-2">{rules.map(rule => <article key={rule.id} className="rounded-xl card-glass p-4"><div className="flex items-start justify-between gap-3"><div><span className="text-[9px]" style={{ color: 'var(--t-gold)' }}>{KIND_LABELS[rule.kind]}</span><h2 className="mt-2 text-sm font-medium" style={{ color: 'var(--t-text)' }}>{rule.title}</h2></div><RuleStatus status={rule.status} /></div><p className="mt-3 text-[9px] leading-5" style={{ color: 'var(--t-text2)' }}>{describeRule(rule)}</p><div className="mt-3 flex items-center gap-2 text-[8px]" style={{ color: 'var(--t-faint)' }}><Repeat size={11} />{rule.timezone} · {rule.engineVersion}</div><div className="mt-4 flex flex-wrap justify-end gap-2">{rule.status === 'enabled' && <ActionButton disabled={busyId === rule.id} onClick={() => onStatus(rule, 'disabled')} label="停用" />}{rule.status === 'disabled' && <ActionButton disabled={busyId === rule.id} onClick={() => onStatus(rule, 'enabled')} label="启用" accent />}{rule.status !== 'archived' ? <ActionButton disabled={busyId === rule.id} onClick={() => onStatus(rule, 'archived')} label="归档" /> : <ActionButton disabled={busyId === rule.id} onClick={() => onStatus(rule, 'enabled')} label="恢复" accent />}<button type="button" disabled={busyId === rule.id} onClick={() => onDelete(rule)} className="rounded-lg px-3 py-2 text-[9px] text-red-500 disabled:opacity-40">删除</button></div></article>)}</div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block text-[10px]" style={{ color: 'var(--t-faint)' }}>{label}<div className="mt-2">{children}</div></label>; }
function Hint({ text }: { text: string }) { return <p className="mt-1.5 text-[9px] leading-5" style={{ color: 'var(--t-faint)' }}>{text}</p>; }
function ViewButton({ active, onClick, title, subtitle }: { active: boolean; onClick: () => void; title: string; subtitle: string }) { return <button type="button" onClick={onClick} className="flex-1 rounded-lg px-4 py-3 text-left transition" style={active ? { color: '#fffaf3', background: 'var(--ac)' } : { color: 'var(--t-text2)' }}><span className="block text-xs font-medium">{title}</span><span className="mt-1 block text-[9px] opacity-70">{subtitle}</span></button>; }
function OverviewMetric({ label, value, color }: { label: string; value: number; color: string }) { return <div className="rounded-xl card-glass p-4 text-center"><div className="text-xl font-semibold" style={{ color }}>{value}</div><div className="mt-1 text-[9px]" style={{ color: 'var(--t-faint)' }}>{label}</div></div>; }
function ActionButton({ label, onClick, disabled, accent = false }: { label: string; onClick: () => void; disabled: boolean; accent?: boolean }) { return <button type="button" disabled={disabled} onClick={onClick} className="rounded-lg px-3 py-2 text-[9px] disabled:opacity-40" style={accent ? { color: '#fffaf3', background: 'var(--ac)' } : { color: 'var(--t-text2)', border: '1px solid var(--t-border)' }}>{label}</button>; }
function RuleStatus({ status }: { status: ReminderRuleStatus }) { const config = status === 'enabled' ? { label: '已启用', color: '#22c55e' } : status === 'disabled' ? { label: '已停用', color: '#f59e0b' } : { label: '已归档', color: 'var(--t-faint)' }; return <span className="rounded-full px-2 py-1 text-[8px]" style={{ color: config.color, border: `1px solid ${config.color}` }}>{config.label}</span>; }
function PageState({ text }: { text: string }) { return <div className="rounded-xl card-glass px-5 py-20 text-center text-sm" style={{ color: 'var(--t-faint)' }}>{text}</div>; }
function requiresConversation(kind: ReminderKind) { return kind === 'birthday_review' || kind === 'transit_change' || kind === 'event_anniversary'; }
function supportsConversation(kind: ReminderKind) { return kind === 'monthly_review' || requiresConversation(kind); }
function monthlyReviewLink(item: ReminderInstance) { const params = new URLSearchParams({ month: item.scheduledFor.slice(0, 7), reminderInstanceId: item.id }); if (item.payload.conversationId) params.set('conversationId', item.payload.conversationId); return `/reviews?${params.toString()}`; }
function formatTimestamp(value: number) { return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value)); }
function displayStatusLabel(item: ReminderInstance) { return item.displayStatus === 'due' ? '已到期' : item.displayStatus === 'upcoming' ? '未来' : item.displayStatus === 'completed' ? '已完成' : '已忽略'; }
function instanceBadgeStyle(item: ReminderInstance) { const color = item.displayStatus === 'due' ? '#f59e0b' : item.displayStatus === 'upcoming' ? 'var(--t-gold)' : item.displayStatus === 'completed' ? '#22c55e' : 'var(--t-faint)'; return { color, border: `1px solid ${color}` }; }
function describeRule(rule: ReminderRule) { const config = rule.config; if (config.kind === 'monthly_review') return `每月 ${config.dayOfMonth} 日 ${clock(config.hour, config.minute)} 提醒复盘，短月份自动取最后一天。`; if (config.kind === 'birthday_review') return `公历生日前 ${config.leadDays} 天 ${clock(config.hour, config.minute)} 提醒年度回顾。`; if (config.kind === 'transit_change') return `${config.level === 'annual' ? '新流年' : '新大限'}开始前 ${config.leadDays} 天 ${clock(config.hour, config.minute)} 提醒观察。`; if (config.kind === 'event_anniversary') return `已确认事件周年前 ${config.leadDays} 天 ${clock(config.hour, config.minute)} 提醒回顾。`; return `${config.date} ${clock(config.hour, config.minute)} · ${config.recurrence === 'none' ? '仅一次' : config.recurrence === 'monthly' ? '每月重复' : '每年重复'}。`; }
function clock(hour: number, minute: number) { return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`; }
