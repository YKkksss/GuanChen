import FortuneCalendarWorkspace from '@/components/FortuneCalendarWorkspace';
import { isCalendarTopic } from '@/lib/fortune-calendar/types';
import { validateCalendarDate } from '@/lib/fortune-calendar/dates';
export const metadata = { title: '运势日历 · 观辰' };
export default async function CalendarPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ date?: string; topic?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  let date: string | undefined;
  try { if (typeof query.date === 'string') date = validateCalendarDate(query.date); } catch { /* 无效书签日期回到默认可用日期。 */ }
  return <FortuneCalendarWorkspace key={id} conversationId={id} initialDate={date} initialTopic={isCalendarTopic(query.topic) ? query.topic : 'overview'} />;
}
