import type { Metadata } from 'next';
import PracticeCenterWorkspace from '@/components/PracticeCenterWorkspace';

export const metadata: Metadata = { title: '结构化练习中心 · 紫微学习', description: '跨章节练习、真实命盘识别、错题本与知识点掌握度。' };

export default function PracticePage() { return <PracticeCenterWorkspace />; }
