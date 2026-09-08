import type { Metadata } from 'next';
import MonthlyReviewWorkspace from '@/components/MonthlyReviewWorkspace';

export const metadata: Metadata = {
  title: '月度复盘 · 观辰',
  description: '记录现实反馈、检验既往判断，并在确认后沉淀人生事件与长期记忆。',
};

export default async function MonthlyReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === 'string' ? params[key] as string : '';
  return (
    <MonthlyReviewWorkspace
      initialConversationId={value('conversationId')}
      initialMonth={value('month')}
      initialReminderInstanceId={value('reminderInstanceId')}
    />
  );
}
