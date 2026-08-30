'use client';

import { ShieldCheck } from '@phosphor-icons/react';
import styles from './ResultNotice.module.css';

const NOTICE = '命理分析仅供传统文化学习与个人参考，请勿过度代入，也不应替代现实判断。事在人为，人定胜天，真正决定人生走向的始终是你的选择与行动。';

export default function ResultNotice({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`${styles.notice} ${compact ? styles.compact : ''}`} role="note" aria-label="命理分析温馨提示">
      <ShieldCheck size={18} weight="duotone" aria-hidden="true" />
      <p><strong>温馨提示：</strong>{NOTICE}</p>
    </aside>
  );
}

