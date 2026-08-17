import type { Metadata } from 'next';
import ReviewWorkspace from '@/components/ReviewWorkspace';

export const metadata: Metadata = { title: '错题本与复习队列 · 紫微学习', description: '复习章节小测和综合练习中的错误题目，持续跟踪掌握状态。' };

export default function ReviewPage() { return <ReviewWorkspace />; }
