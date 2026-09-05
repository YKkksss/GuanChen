import type { Palace } from '@/lib/ziwei/types';
import { BRANCHES, STEMS } from '@/lib/ziwei/constants';
import styles from './PalaceFacts.module.css';

export default function PalaceFacts({ palace, busy, onAnalyze }: {
  palace: Palace | null; busy: boolean; onAnalyze: (palace: Palace) => void;
}) {
  return <section className={styles.facts} aria-label="选中宫位信息">
    {palace ? <>
      <div aria-live="polite"><h2>{palace.name} · {STEMS[palace.stem]}{BRANCHES[palace.branch]}</h2>
        <p>本命星曜：{palace.stars.map(star => `${star.name}${star.siHua ? `化${star.siHua}` : ''}`).join('、') || '无星曜记录'}</p>
        {palace.daXianAge && <p>大限年龄：{palace.daXianAge[0]}–{palace.daXianAge[1]} 岁</p>}
      </div>
      <button type="button" disabled={busy} onClick={() => onAnalyze(palace)}>{busy ? 'AI 正在解读…' : 'AI 分析此宫'}</button>
      <small>点击按钮会提交本命宫位分析。选宫、查看星曜知识仅在本地进行。</small>
    </> : <p>选择宫位查看本命信息与三方四正；点击星曜可阅读知识。需要 AI 解读时，再点击“AI 分析此宫”。</p>}
  </section>;
}
