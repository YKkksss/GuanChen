import MeihuaWorkspace from '@/components/MeihuaWorkspace';
export const metadata={title:'梅花占问 · 观辰'};
export default async function MeihuaPage({params}:{params:Promise<{id:string}>}){const{id}=await params;return<MeihuaWorkspace key={id} id={id}/>;}
