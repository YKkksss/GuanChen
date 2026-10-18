import ElectionWorkspace from '@/components/ElectionWorkspace';
import { beijingToday } from '@/lib/fortune-calendar/dates';
export const metadata = { title:'择日工具 · 观辰' };
export const dynamic = 'force-dynamic';
export default async function ElectionPage({ searchParams }: {searchParams:Promise<{from?:string}>}) { const {from} = await searchParams; return <ElectionWorkspace key={from || 'new'} today={beijingToday()} fromId={typeof from === 'string' ? from : ''} />; }
