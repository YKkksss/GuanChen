import assert from 'node:assert/strict';
import {calculateQimen,buildQimenBoard,yuanFor,ganZhiIndex} from '../lib/qimen/engine';
import {TERM_JU,STEMS,BRANCHES,GRID} from '../lib/qimen/rules';
export function testQimenEngine(){
  let checks=0;const check=(v:unknown,n:string)=>{assert.ok(v,n);checks++;};
  // 表与具体排例作为独立核对值，不从待测函数生成期望值。
  const terms=['冬至','小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至','小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪'];
  const expected=[[1,7,4],[2,8,5],[3,9,6],[8,5,2],[9,6,3],[1,7,4],[3,9,6],[4,1,7],[5,2,8],[4,1,7],[5,2,8],[6,3,9],[9,3,6],[8,2,5],[7,1,4],[2,5,8],[1,4,7],[9,3,6],[7,1,4],[6,9,3],[5,8,2],[6,9,3],[5,8,2],[4,7,1]];
  check(Object.keys(TERM_JU).length===24,'24节气完整唯一');for(let i=0;i<24;i++)check(TERM_JU[terms[i]].numbers.join()===expected[i].join()&&TERM_JU[terms[i]].dun===(i<12?'yang':'yin'),'古籍24节气三元阴阳表');
  const yuan=['上元','中元','下元','上元','中元','下元','上元','中元','下元','上元','中元','下元'];
  for(let n=0;n<60;n++){const day=STEMS[n%10]+BRANCHES[n%12],r=yuanFor(day);check(r.yuan===yuan[Math.floor(n/5)]&&r.fuTou===STEMS[Math.floor(n/5)*5%10]+BRANCHES[Math.floor(n/5)*5%12],'六十日的五日符头与三元');}
  for(const dun of ['yang','yin'] as const)for(let number=1;number<=9;number++)for(let n=0;n<60;n++){
    const hour=STEMS[n%10]+BRANCHES[n%12],b=buildQimenBoard(dun,number,hour),outer=b.palaces.filter(p=>p.number!==5);
    check(b.palaces.length===9&&new Set(b.palaces.map(p=>p.earthStem)).size===9,'1080种局时地盘九干完整');
    check(outer.flatMap(p=>p.stars).length===9&&new Set(outer.flatMap(p=>p.stars)).size===9,'1080种九星无漏或重复');
    check(outer.flatMap(p=>p.heavenStems).length===9&&new Set(outer.flatMap(p=>p.heavenStems)).size===9,'1080种天盘九干及中五随禽完整');
    check(new Set(outer.map(p=>p.door)).size===8&&outer.every(p=>p.door)&&new Set(outer.map(p=>p.god)).size===8,'1080种八门八神完整');
    check(b.palaces[b.chief.starPalace-1].stars.includes(b.chief.star)&&b.palaces[b.chief.starPalace-1].god==='值符'&&b.palaces[b.chief.doorPalace-1].door===b.chief.door,'值符星神与值使门正确落位');
    const center=b.palaces[4],host=b.palaces.find(p=>p.stars.includes('天禽'))!;
    check(!center.door&&!center.god&&!center.stars.length&&host.stars.includes('天芮')&&host.heavenStems.includes(center.earthStem),'中五不独布门神且禽芮连动');
    check(b.emptyBranches.length===2&&!b.emptyBranches.includes(hour[1])&&outer.flatMap(p=>p.emptyBranches).sort().join()===b.emptyBranches.slice().sort().join(),'时旬空地支方位映射无遗漏');
    if(n%10===0)check(b.starSteps===0&&b.doorSteps===0,'旬首甲时天地星门原位');
  }
  const yang=buildQimenBoard('yang',1,'乙丑');check(yang.palaces.map(p=>p.earthStem).join()==='戊,己,庚,辛,壬,癸,丁,丙,乙','阳一局独立地盘');
  check(yang.palaces.map(p=>p.stars.join('+')).join()==='天英,天任,天柱,天心,,天辅,天冲,天芮+天禽,天蓬','阳一乙丑九星独立环转例');
  check(yang.palaces.map(p=>p.heavenStems.join('+')).join()==='乙,丙,丁,癸,,辛,庚,己+壬,戊','阳一乙丑天盘干跟星同行');
  check(yang.chief.starPalace===9&&yang.chief.doorPalace===2&&yang.palaces[1].door==='休门','星门各自取不同旋转步数');
  check(yang.palaces.map(p=>p.god||'').join()==='白虎,螣蛇,九地,九天,,六合,太阴,玄武,值符','阳遁八神顺外环');
  const yin=buildQimenBoard('yin',9,'乙丑');check(yin.palaces.map(p=>p.earthStem).join()==='乙,丙,丁,癸,壬,辛,庚,己,戊','阴九局独立逆布地盘');
  check(yin.chief.star==='天英'&&yin.chief.starPalace===1&&yin.chief.door==='景门'&&yin.chief.doorPalace===8,'阴九乙丑值符值使独立例');
  check(yin.palaces.map(p=>p.god||'').join()==='值符,六合,九地,玄武,,螣蛇,太阴,九天,白虎','阴遁八神逆外环');
  const central=buildQimenBoard('yang',5,'乙丑');check(central.chief.origin===5&&central.chief.star==='天禽'&&central.chief.doorRawPalace===6&&central.chief.doorPalace===6,'旬首中五从原5计时，不能先寄2起数');
  const arrive=buildQimenBoard('yang',1,'戊辰');check(arrive.chief.doorRawPalace===5&&arrive.chief.doorPalace===2,'值使到达中五后才寄坤');
  const book=calculateQimen({method:'chaibu',dateTime:'2026-06-18T08:30',lateZiPolicy:'midnight'});check(book.calendar.day==='癸亥'&&book.calendar.hour==='丙辰'&&book.ju.term==='芒种'&&book.ju.yuan==='下元'&&book.ju.label==='阳遁9局','原典芒种癸亥丙辰拆补阳九');
  check(book.chief.origin===5&&book.chief.star==='天禽'&&book.chief.starPalace===7&&book.chief.door==='死门'&&book.chief.doorPalace===7&&book.palaces[6].heavenStems.includes('癸'),'原典阳九旬首中五、天禽与死门同到兑七');
  const second=calculateQimen({method:'manual',dateTime:'2026-10-17T14:30',manualDun:'yin',manualJu:8});check(second.calendar.hour==='辛未'&&second.chief.star==='天任'&&second.chief.starPalace===2&&second.chief.door==='生门'&&second.chief.doorPalace===1,'阴八辛未原典值使坎一，时干入中按本版寄坤');
  check(second.ju.automaticNumber!==8&&second.input.method==='manual','手动覆盖明确保留自动拆补参考');
  const common={method:'chaibu',lateZiPolicy:'midnight'},summerBefore=calculateQimen({...common,dateTime:'2026-06-21T16:24:29'}),summer=calculateQimen({...common,dateTime:'2026-06-21T16:24:30'}),winterBefore=calculateQimen({...common,dateTime:'2026-12-22T04:50:13'}),winter=calculateQimen({...common,dateTime:'2026-12-22T04:50:14'});
  check(summerBefore.ju.dun==='yang'&&summer.ju.dun==='yin'&&summer.ju.term==='夏至','夏至交节秒界切阴遁');check(winterBefore.ju.dun==='yin'&&winter.ju.dun==='yang'&&winter.ju.term==='冬至','冬至交节秒界切阳遁');
  const midnight=calculateQimen({...common,dateTime:'2026-10-14T23:30'}),zi=calculateQimen({...common,lateZiPolicy:'zi_start',dateTime:'2026-10-14T23:30'}),next=calculateQimen({...common,dateTime:'2026-10-15T00:30'});
  check(midnight.calendar.day==='辛酉'&&midnight.calendar.hour==='戊子'&&zi.calendar.day==='壬戌'&&zi.calendar.hour==='庚子','显式换日日时五鼠遁同步');check(zi.calendar.day===next.calendar.day&&zi.calendar.hour===next.calendar.hour,'子初与下一日早子一致');
  check(midnight.chief.xun!==zi.chief.xun,'时旬首随所选时干支同步切换');
  for(const dateTime of ['1900-01-01T00:00','2100-12-31T23:59:59','2024-02-29T12:30','2026-01-01T00:30','2025-07-25T12:30'])check(Boolean(calculateQimen({...common,dateTime}).ju.label),'时间上下限、闰日、跨年及闰月可排');
  check(GRID.join()==='4,9,2,3,5,7,8,1,6'&&[0,1,2].every(i=>GRID.slice(i*3,i*3+3).reduce((a,b)=>a+b,0)===15),'南上北下洛书行列');
  const normalized=calculateQimen({...common,dateTime:'2026-06-18T08:30',manualDun:'yin',manualJu:2});check(normalized.input.manualJu===undefined&&normalized.ju.number===9,'自动局忽略遗留手动字段');
  for(const raw of [null,[],{method:'other'},{...common,dateTime:'2026-02-30T10:00'},{...common,dateTime:'1900-02-29T10:00'},{...common,dateTime:'2101-01-01T10:00'},{...common,dateTime:'2026-10-13T10:00Z'},{...common,dateTime:'2026-10-13T24:00'},{...common,dateTime:'2026-10-13T10:00',lateZiPolicy:'other'},{method:'manual',dateTime:'2026-10-13T10:00',manualDun:'yin',manualJu:0},{method:'manual',dateTime:'2026-10-13T10:00',manualDun:'yin',manualJu:10},{method:'manual',dateTime:'2026-10-13T10:00',manualDun:'yin',manualJu:'1'},{method:'manual',dateTime:'2026-10-13T10:00',manualDun:'yin',manualJu:1.5},{method:'manual',dateTime:'2026-10-13T10:00',manualDun:'other',manualJu:1}]){assert.throws(()=>calculateQimen(raw));checks++;}
  assert.throws(()=>ganZhiIndex('甲丑'));checks++;assert.throws(()=>buildQimenBoard('yang',0,'甲子'));checks++;
  return checks;
}
