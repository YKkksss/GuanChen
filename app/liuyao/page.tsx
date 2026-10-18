import LiuyaoHome from '@/components/LiuyaoHome';
import {beijingDateTime} from '@/lib/liuyao/engine';
export const metadata={title:'六爻纳甲 · 观辰'};export const dynamic='force-dynamic';
export default function LiuyaoPage(){return <LiuyaoHome dateTime={beijingDateTime()}/>;}
