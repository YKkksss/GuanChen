import type { Metadata } from 'next';
import ChartPracticeWorkspace from '@/components/ChartPracticeWorkspace';

export const metadata: Metadata = { title: '我的命盘识别练习 · 紫微学习', description: '根据已保存的单人命盘快照生成确定性结构识别题。' };

export default function ChartPracticePage() { return <ChartPracticeWorkspace />; }
