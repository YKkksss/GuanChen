'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { STAR_DESCRIPTIONS } from '@/lib/ziwei/constants';
import { STAR_TO_SLUG } from '@/lib/seo/knowledge';
import type { Palace, Star } from '@/lib/ziwei/types';
import styles from './StarKnowledgeDialog.module.css';

const STAR_TYPES = { major: '主星', minor: '辅星', lucky: '吉曜', sha: '煞曜' };
const BRIGHTNESS = { bright: '庙旺', normal: '平', dim: '落陷' };

export default function StarKnowledgeDialog({ selection, onClose }: {
  selection: { star: Star; palace: Palace } | null;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!selection) return;
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [selection]);
  if (!selection) return null;
  const { star, palace } = selection;
  const knowledge = STAR_DESCRIPTIONS[star.name];
  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="star-knowledge-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={styles.body}>
        <header><div><small>星曜知识</small><h2 id="star-knowledge-title">{star.name}</h2></div>
          <button type="button" onClick={onClose} aria-label="关闭星曜知识">关闭 ×</button></header>
        <p>{palace.name} · {STAR_TYPES[star.type]}{star.brightness ? ` · ${BRIGHTNESS[star.brightness]}` : ''}{star.siHua ? ` · 本命化${star.siHua}` : ''}</p>
        {knowledge ? <>
          <h3>基础含义</h3><p className={styles.keywords}>{knowledge.keywords}</p>
          <dl><dt>五行</dt><dd>{knowledge.element}</dd><dt>传统星性</dt><dd>{knowledge.nature}</dd></dl>
          <p className={styles.note}>以上为知识库的基础概念，具体含义需要结合所在宫位、四化与三方四正。</p>
          <Link href={`/knowledge/${STAR_TO_SLUG[star.name]}/overview`}>阅读{star.name}知识条目 →</Link>
        </> : <p className={styles.note}>知识库尚未收录该星曜的基础条目，当前展示命盘已有的星曜信息。</p>}
      </div>
    </dialog>
  );
}
