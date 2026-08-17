import type { Metadata } from 'next';
import FoundationPracticeWorkspace from '@/components/FoundationPracticeWorkspace';

export const metadata: Metadata = { title: '命盘结构跨章节复习 · 紫微学习', description: '覆盖七个基础知识点的确定性综合选择题。' };

export default function FoundationPracticePage() { return <FoundationPracticeWorkspace />; }
