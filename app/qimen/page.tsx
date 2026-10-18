import QimenHome from '@/components/QimenHome';
import {beijingDateTime} from '@/lib/qimen/engine';
export const metadata={title:'奇门遁甲 · 观辰'};export const dynamic='force-dynamic';
export default function QimenPage(){return <QimenHome dateTime={beijingDateTime()}/>;}
