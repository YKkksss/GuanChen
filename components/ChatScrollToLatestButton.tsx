'use client';

import { ArrowDown } from '@phosphor-icons/react';

interface ChatScrollToLatestButtonProps {
  visible: boolean;
  loading?: boolean;
  onClick: () => void;
}

export default function ChatScrollToLatestButton({
  visible,
  loading = false,
  onClick,
}: ChatScrollToLatestButtonProps) {
  if (!visible) return null;

  return (
    <button
      type="button"
      aria-label="回到最新消息"
      onClick={onClick}
      className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[10px] shadow-lg backdrop-blur-md transition hover:-translate-y-0.5"
      style={{
        color: 'var(--t-gold, var(--ac, #a43f31))',
        border: '1px solid var(--t-border-acc, var(--ac-bdr, rgba(164,63,49,.24)))',
        background: 'var(--t-card, var(--bg-card, rgba(255,253,249,.94)))',
      }}
    >
      <ArrowDown size={12} weight="bold" aria-hidden="true" />
      {loading ? '回到最新 · 正在生成' : '回到最新消息'}
    </button>
  );
}
