'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import { DEFAULT_CHAT_PREFERENCES, getChatFontFamily, type ChatPreferences } from '@/lib/ui/chat-preferences';
import { useBodyScrollLock } from '@/lib/ui/use-body-scroll-lock';
import styles from './ChatSettingsDialog.module.css';

const TABS = [{ id: 'reading', label: '阅读' }, { id: 'input', label: '输入' }, { id: 'behavior', label: '行为' }] as const;

export default function ChatSettingsDialog({ preferences, onChange, onCancel, onSave }: {
  preferences: ChatPreferences;
  onChange: (value: ChatPreferences) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<string>('reading');
  const id = useId();
  useBodyScrollLock(true);
  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);
  const update = <K extends keyof ChatPreferences>(key: K, value: ChatPreferences[K]) => onChange({ ...preferences, [key]: value });

  return <dialog ref={dialogRef} className={styles.dialog} aria-labelledby={`${id}-title`}
    onCancel={event => { event.preventDefault(); onCancel(); }}
    onKeyDown={event => { if (event.key === 'Escape') event.stopPropagation(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onCancel();
    }}>
    <div className={styles.shell}>
      <header className={styles.header}><h2 id={`${id}-title`}>对话框设置</h2><button type="button" className={styles.close} onClick={onCancel} aria-label="关闭对话框设置"><X size={18} aria-hidden="true" /></button></header>
      <div className={styles.tabs} role="tablist" aria-label="对话设置分类">
        {TABS.map((item, index) => <button type="button" key={item.id} role="tab" id={`${id}-${item.id}-tab`} aria-controls={`${id}-${item.id}`} aria-selected={tab === item.id} tabIndex={tab === item.id ? 0 : -1}
          onClick={() => setTab(item.id)} onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
            setTab(TABS[next].id);
            document.getElementById(`${id}-${TABS[next].id}-tab`)?.focus();
          }}>{item.label}</button>)}
      </div>
      <div className={styles.body}>
        <section role="tabpanel" id={`${id}-reading`} aria-labelledby={`${id}-reading-tab`} hidden={tab !== 'reading'}>
          <Range label="聊天字号" id={`${id}-font`} value={preferences.fontSize} max={22} onChange={value => update('fontSize', value)} />
          <Toggle label="单独调整 AI 回复字号" checked={preferences.separateAiSize} onChange={value => update('separateAiSize', value)} />
          {preferences.separateAiSize && <Range label="AI 回复字号" id={`${id}-ai-font`} value={preferences.aiFontSize} max={24} onChange={value => update('aiFontSize', value)} />}
          <Field label="字体"><select value={preferences.font} onChange={event => update('font', event.target.value as ChatPreferences['font'])}><option value="serif">书院宋体</option><option value="sans">简洁黑体</option></select></Field>
          <Field label="行间距"><select value={preferences.lineHeight} onChange={event => update('lineHeight', Number(event.target.value) as ChatPreferences['lineHeight'])}><option value={1.6}>紧凑 · 1.6 倍</option><option value={1.75}>适中 · 1.75 倍</option><option value={1.85}>宽松 · 1.85 倍</option></select></Field>
          <Field label="消息间距"><select value={preferences.messageGap} onChange={event => update('messageGap', Number(event.target.value) as ChatPreferences['messageGap'])}><option value={10}>紧凑</option><option value={14}>适中</option><option value={20}>宽松</option></select></Field>
          <Field label="内容宽度"><select value={preferences.contentWidth} onChange={event => update('contentWidth', event.target.value as ChatPreferences['contentWidth'])}><option value="fill">铺满聊天区域</option><option value="comfortable">舒适阅读 · 最大 820px</option></select></Field>
          <div className={styles.preview} style={{ fontFamily: getChatFontFamily(preferences.font), fontSize: preferences.separateAiSize ? preferences.aiFontSize : preferences.fontSize, lineHeight: preferences.lineHeight }}>先确定主题，再逐步阅读。<br />文字大小与行距即时预览。</div>
        </section>
        <section role="tabpanel" id={`${id}-input`} aria-labelledby={`${id}-input-tab`} hidden={tab !== 'input'}>
          <Toggle label="输入框随内容自动增高" checked={preferences.autoGrow} onChange={value => update('autoGrow', value)} />
          <Field label="最多显示行数"><select disabled={!preferences.autoGrow} value={preferences.maxRows} onChange={event => update('maxRows', Number(event.target.value) as ChatPreferences['maxRows'])}><option value={4}>4 行</option><option value={6}>6 行</option><option value={8}>8 行</option></select></Field>
          <p className={styles.note}>长问题超过上限时可在输入框内滚动。较矮的窗口会自动减少输入区高度。</p>
          <Field label="发送快捷键"><select value={preferences.sendKey} onChange={event => update('sendKey', event.target.value as ChatPreferences['sendKey'])}><option value="enter">Enter 发送，Shift + Enter 换行</option><option value="modified">Ctrl / ⌘ + Enter 发送，Enter 换行</option></select></Field>
        </section>
        <section role="tabpanel" id={`${id}-behavior`} aria-labelledby={`${id}-behavior-tab`} hidden={tab !== 'behavior'}>
          <Toggle label="跟随最新回复" checked={preferences.autoFollow} onChange={value => update('autoFollow', value)} />
          <p className={styles.note}>上翻阅读旧消息时暂停跟随；点击“回到最新消息”可返回底部。</p>
          <Toggle label="显示快捷提问栏" checked={preferences.showTopics} onChange={value => update('showTopics', value)} />
          <Toggle label="事件候选默认折叠" checked={preferences.collapseCandidates} onChange={value => update('collapseCandidates', value)} />
          <Toggle label="减少消息动画" checked={preferences.reduceMotion} onChange={value => update('reduceMotion', value)} />
          <p className={styles.note}>也会遵循设备的减少动态效果偏好。</p>
        </section>
      </div>
      <footer className={styles.footer}>
        <p>保存后应用于当前浏览器中的命盘聊天。</p>
        <div><button type="button" className={styles.reset} onClick={() => onChange({ ...DEFAULT_CHAT_PREFERENCES })}>恢复默认</button><button type="button" onClick={onCancel}>取消</button><button type="button" className={styles.save} onClick={onSave}>保存设置</button></div>
      </footer>
    </div>
  </dialog>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}
function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className={styles.toggle}><span>{label}</span><input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} /></label>;
}
function Range({ label, id, value, max, onChange }: { label: string; id: string; value: number; max: number; onChange: (value: number) => void }) {
  return <div className={styles.field}><div className={styles.rangeLabel}><label htmlFor={id}>{label}</label><output htmlFor={id}>{value}px</output></div><input id={id} type="range" min={14} max={max} step={1} value={value} onChange={event => onChange(Number(event.target.value))} /></div>;
}
