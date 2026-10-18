import ElectionWorkspace from '@/components/ElectionWorkspace';
import { beijingToday } from '@/lib/fortune-calendar/dates';
export const metadata = { title:'择日方案 · 观辰' };
export default async function ElectionPlanPage({ params }: {params:Promise<{id:string}>}) { const {id} = await params; return <ElectionWorkspace key={id} id={id} today={beijingToday()} />; }
