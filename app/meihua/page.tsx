import MeihuaHome from '@/components/MeihuaHome';
import {beijingDateTime} from '@/lib/meihua/engine';
export const metadata={title:'梅花易数 · 观辰'};export const dynamic='force-dynamic';
export default function MeihuaPage(){return <MeihuaHome dateTime={beijingDateTime()}/>;}
