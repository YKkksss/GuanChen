import { calculateBazi } from './engine';
import { analyzeBaziInterpretation } from './interpretation-engine';
import { analyzeBaziClimate } from './reading-engine';
export const BAZI_READING_EXAMPLES = [
  { id: 'winter', title: '冬季温暖与扶抑的区别', birthDate: '1992-12-18', birthTime: '09:30', question: '同一个火元素在调候法和扶抑法中，是否承担同一种含义？' },
  { id: 'summer', title: '夏季滋润与原局位置', birthDate: '1992-07-09', birthTime: '09:30', question: '润燥方向已列出，但相关元素是表层出现还是仅在藏干？' },
  { id: 'storage', title: '杂气月的多个格局入口', birthDate: '1992-10-20', birthTime: '09:30', question: '月令多个候选并存时，为什么不能只挑第一个当成最终格局？' },
  { id: 'unknown', title: '时辰未知的判断边界', birthDate: '1992-07-09', birthTime: undefined, question: '少了时柱，未见某个元素是否还能称为全盘缺失？' },
] as const;
export function baziReadingExample(id: string) {
  const example = BAZI_READING_EXAMPLES.find(e => e.id === id);
  if (!example) throw new Error('示例不存在');
  const chart = calculateBazi({ birthDate: example.birthDate, birthTime: example.birthTime, unknownTime: example.id === 'unknown', gender: 'female', timeZoneId: 'Asia/Shanghai', timeStandard: 'civil_time', lateZiPolicy: 'next_day' });
  return { id: example.id, title: example.title, question: example.question, synthetic: true as const, chart, interpretation: analyzeBaziInterpretation(chart), climate: analyzeBaziClimate(chart), note: '合成教学资料，用于理解规则与缺失信息，未记录现实经历，也不用于相似命盘的命运推断。' };
}
