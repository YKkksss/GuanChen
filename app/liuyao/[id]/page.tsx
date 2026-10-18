import LiuyaoWorkspace from '@/components/LiuyaoWorkspace';
export const metadata={title:'六爻占问 · 观辰'};
export default async function LiuyaoPage({params}:{params:Promise<{id:string}>}){const{id}=await params;return<LiuyaoWorkspace key={id} id={id}/>;}
