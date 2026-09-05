'use client';
import { useState } from 'react';
import type { ChatMessage } from '@/lib/chat/session';
import type { ConversationChat } from '@/lib/ui/use-conversation-chat';
import styles from './ChatRecoveryActions.module.css';

export function ChatRecoveryActions({ message, chat }: { message: ChatMessage; chat: ConversationChat }) {
  const [confirmRecovery, setConfirmRecovery] = useState(false);
  if (message.status === 'streaming' || message.status === 'pending') return <p className={styles.status} role="status">正在生成…</p>;
  const recover = () => {
    const question = chat.session.questionFor(message.id);
    if (chat.input.trim() && chat.input !== question) { setConfirmRecovery(true); return; }
    chat.session.setInput(question);
  };
  return <div className={styles.actions}>
    {message.status === 'cancelled' && <p role="status">{message.content ? '已停止生成，部分内容已保留。' : '已停止生成，尚未收到正文。'}</p>}
    {message.status === 'failed' && <p role="alert">{message.error ?? '生成失败，可重试。'}</p>}
    {message.question && <div>
      <button type="button" disabled={chat.busy} onClick={() => chat.session.retry(message.id)}>{message.status === 'failed' ? '重试这条回答' : '重新生成'}</button>
      <button type="button" disabled={chat.busy} onClick={recover}>恢复原问题</button>
    </div>}
    {confirmRecovery && <div role="group" aria-label="恢复原问题确认">
      <span>输入框已有草稿，是否替换为原问题？</span>
      <button type="button" disabled={chat.busy} onClick={() => { chat.session.setInput(chat.session.questionFor(message.id)); setConfirmRecovery(false); }}>替换草稿</button>
      <button type="button" onClick={() => setConfirmRecovery(false)}>保留草稿</button>
    </div>}
  </div>;
}

export function ChatGenerationControls({ chat }: { chat: ConversationChat }) {
  return <div className={styles.controls}>
    {chat.error && <p role="alert">{chat.error}<button type="button" onClick={() => void chat.session.refresh()}>刷新状态</button></p>}
    {chat.busy && <button type="button" disabled={chat.phase === 'stopping'} onClick={() => void chat.session.stop()}>{chat.phase === 'stopping' ? '正在停止…' : '停止生成'}</button>}
  </div>;
}
