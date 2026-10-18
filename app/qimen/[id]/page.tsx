import QimenWorkspace from '@/components/QimenWorkspace';
export const metadata={title:'奇门占问 · 观辰'};
export default async function QimenPage({params}:{params:Promise<{id:string}>}){const{id}=await params;return<QimenWorkspace key={id} id={id}/>;}
