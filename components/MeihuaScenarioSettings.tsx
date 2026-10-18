'use client';

import { MEIHUA_SCENARIOS, type MeihuaScenarioKey } from '@/lib/meihua/scenario-types';
import styles from './MeihuaScenarioSettings.module.css';

export default function MeihuaScenarioSettings({ value = 'none', onChange }: { value?: MeihuaScenarioKey; onChange: (value: MeihuaScenarioKey) => void }) {
  return <div className={styles.settings}>
    <label>本次占类<select aria-label="本次占类" value={value} onChange={event => onChange(event.target.value as MeihuaScenarioKey)}>
      {Object.entries(MEIHUA_SCENARIOS).map(([key, label]) => <option key={key} value={key}>{key === 'none' ? '未指定 · 只看通用体用' : label}</option>)}
    </select></label>
    <p>由你明确选择，不从占问文字推测。更换占类后需重新预览；起卦方式、固定体与互卦口径各自保留。</p>
  </div>;
}
