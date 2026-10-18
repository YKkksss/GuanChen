import assert from 'node:assert/strict';
import { Solar } from 'lunar-javascript';
import { hexagram, hexagramFromLines } from '../lib/meihua/engine';
import { calculateLiuyao, coinValue, xunFor } from '../lib/liuyao/engine';
import { assignLines, kinFor, palaceFor, sixSpirits } from '../lib/liuyao/rules';
import type { Line, LineValue } from '../lib/liuyao/types';
import { createBrowserRequestId } from '../lib/ui/request-id';
export function testLiuyaoEngine() {
  let checks=0;const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
  const fallback={getRandomValues:<T extends ArrayBufferView|null>(array:T):T=>{if(array instanceof Uint8Array)for(let i=0;i<array.length;i++)array[i]=i;return array;}};
  check(createBrowserRequestId(fallback)==='00010203-0405-4607-8809-0a0b0c0d0e0f','非安全上下文请求标识保持UUID版本与变体');
  check(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(createBrowserRequestId()),'请求标识满足后端幂等格式');
  const base={method:'lines',dateTime:'2026-10-13T10:30:00',lateZiPolicy:'midnight',focusKind:'none'};
  // 原典八宫列表作为独立核对值，不由待测的翻爻算法生成。
  const expectedPalaces=[[1,44,33,12,20,23,35,14],[58,47,45,31,39,15,62,54],[30,56,50,64,4,59,6,13],[51,16,40,32,46,48,28,17],[57,9,37,42,25,21,27,18],[29,60,3,63,49,55,36,7],[52,22,26,41,38,10,61,53],[2,24,19,11,34,43,5,8]];
  const all=Array.from({length:8},(_,u)=>Array.from({length:8},(_,l)=>hexagram(u+1,l+1))).flat();
  for(let palace=0;palace<8;palace++)for(let stage=0;stage<8;stage++){
    const h=all.find(h=>h.number===expectedPalaces[palace][stage])!,p=palaceFor(h);
    check(p.trigram===palace+1&&p.shi===[6,1,2,3,4,5,4,3][stage]&&Math.abs(p.shi-p.ying)===3,'64卦八宫与世应独立列表');
  }
  const expectedNajia=[['甲子','甲寅','甲辰','壬午','壬申','壬戌'],['丁巳','丁卯','丁丑','丁亥','丁酉','丁未'],['己卯','己丑','己亥','己酉','己未','己巳'],['庚子','庚寅','庚辰','庚午','庚申','庚戌'],['辛丑','辛亥','辛酉','辛未','辛巳','辛卯'],['戊寅','戊辰','戊午','戊申','戊戌','戊子'],['丙辰','丙午','丙申','丙戌','丙子','丙寅'],['乙未','乙巳','乙卯','癸丑','癸亥','癸酉']];
  for(let n=1;n<=8;n++)check(assignLines(hexagram(n,n),'金').map(l=>l.stem+l.branch).join()===expectedNajia[n-1].join(),'八纯六爻纳甲与原典方向');
  for(const h of all)for(let mask=0;mask<64;mask++){
    const values:LineValue[]=h.lines.map((b,i)=>mask&(1<<i)?b?9:6:b?7:8),r=calculateLiuyao({...base,lineValues:values});
    const target:Line[]=h.lines.map((b,i)=>mask&(1<<i)?b===1?0:1:b);
    check(r.primary.number===h.number&&r.changed.number===hexagramFromLines(target).number,'4096种四象记录对应本变卦');
    check(r.movingLines.join()===h.lines.flatMap((_,i)=>mask&(1<<i)?[i+1]:[]).join(),'全部动爻组合无漏爻');
    const changed=assignLines(r.changed,r.palace.element);
    check(r.lines.every((l,i)=>l.changed.kin===changed[i].kin&&l.role===(i+1===r.palace.shi?'世':i+1===r.palace.ying?'应':'')),'之卦六亲沿用原宫且世应固定');
    check(r.lines.every(l=>!l.hidden||r.missingKinds.includes(l.hidden.kin)),'伏神只补本卦缺亲');
  }
  const distribution=[0,0,0,0];for(let n=0;n<8;n++){const sides=[n&1,(n>>1)&1,(n>>2)&1] as Array<0|1>;distribution[coinValue(sides)-6]++;}
  check(distribution.join()==='1,3,3,1','八种等概率三钱记录为1比3比3比1');
  const coins=calculateLiuyao({...base,method:'coins',coins:[[1,1,1],[0,0,1],[1,1,1],[0,0,0],[0,1,0],[0,0,0]]});
  check(coins.primary.number===5&&coins.changed.number===6&&coins.movingLines.join()==='1,3,4,6','原典水天需之天水讼三钱对应');
  const example=calculateLiuyao({...base,lineValues:[9,7,9,6,7,6]});
  check(example.palace.name==='坤'&&example.palace.shi===4&&example.palace.ying===1,'需为坤宫游魂');
  check(example.lines.map(l=>l.kin+l.branch+l.element).join()==='妻财子水,官鬼寅木,兄弟辰土,子孙申金,兄弟戌土,妻财子水','原典需卦六亲纳支');
  check(example.lines.filter(l=>l.moving).map(l=>l.changed.kin+l.changed.branch+l.changed.element).join()==='官鬼寅木,父母午火,父母午火,兄弟戌土','原典四个实际变出爻');
  const gu=calculateLiuyao({...base,lineValues:[8,7,7,7,7,7],focusKind:'妻财'});
  check(gu.primary.number===44&&gu.missingKinds.includes('妻财')&&gu.lines[1].hidden?.branch==='寅'&&gu.lines[1].hidden?.kin==='妻财'&&gu.focus.hidden.join()==='2','姤卦缺财取乾宫二爻伏神');
  check(calculateLiuyao({...base,lineValues:[6,6,6,6,6,6]}).changed.number===1,'六阴全动为乾');
  check(calculateLiuyao({...base,lineValues:[9,9,9,9,9,9]}).changed.number===2,'六阳全动为坤');
  const staticGua=calculateLiuyao({...base,lineValues:[7,7,7,7,7,7]});check(staticGua.movingLines.length===0&&staticGua.changed.number===1,'静卦本变相同');
  const before=calculateLiuyao({...base,dateTime:'2026-03-05T21:58:59',lineValues:[7,7,7,7,7,7]}),after=calculateLiuyao({...base,dateTime:'2026-03-05T21:59:00',lineValues:[7,7,7,7,7,7]});
  check(before.calendar.monthBranch==='寅'&&after.calendar.monthBranch==='卯','惊蛰实际交节秒前后月建切换');
  const first=calculateLiuyao({...base,dateTime:'2026-10-14T22:59:59',lineValues:[7,7,7,7,7,7]}),late=calculateLiuyao({...base,dateTime:'2026-10-14T23:00:00',lineValues:[7,7,7,7,7,7]}),zi=calculateLiuyao({...base,lateZiPolicy:'zi_start',dateTime:'2026-10-14T23:00:00',lineValues:[7,7,7,7,7,7]}),next=calculateLiuyao({...base,dateTime:'2026-10-15T00:00:00',lineValues:[7,7,7,7,7,7]});
  check(first.calendar.day===late.calendar.day&&late.calendar.day!==zi.calendar.day&&zi.calendar.day===next.calendar.day,'午夜与子初换日显式区分');
  check(late.lines[0].spirit!==zi.lines[0].spirit,'换日后六神随实际日干变化');
  for(let n=0;n<60;n++){const day=Solar.fromYmd(2026,1,n<31?n+1:1).getLunar().getEightChar() as unknown as {getDay():string};if(n<31){const d=day.getDay(),x=xunFor(d);check(!x.emptyBranches.includes(d[1])&&x.emptyBranches.length===2,'旬空不含当前日支');}}
  const stems=['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'],branches=['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  for(let n=0;n<60;n++){const d=stems[n%10]+branches[n%12],x=xunFor(d);check(x.xun==='甲'+branches[(Math.floor(n/10)*10)%12]&&!x.emptyBranches.includes(d[1]),'六十日干支各旬独立核对');}
  for(const [stem,start] of [['甲','青龙'],['乙','青龙'],['丙','朱雀'],['丁','朱雀'],['戊','勾陈'],['己','螣蛇'],['庚','白虎'],['辛','白虎'],['壬','玄武'],['癸','玄武']])check(sixSpirits(stem)[0]===start&&new Set(sixSpirits(stem)).size===6,'十日干六神起点完整循环');
  for(const [element,expected] of [['金','兄弟'],['土','父母'],['水','子孙'],['木','妻财'],['火','官鬼']] as const)check(kinFor('金',element)===expected,'六亲生克方向');
  check(xunFor('甲子').emptyBranches.join('')==='戌亥'&&xunFor('甲戌').emptyBranches.join('')==='申酉','原典旬空起例');
  for(const raw of [null,[],{...base,method:'other'},{...base,lineValues:[1,7,7,7,7,7]},{...base,lineValues:[7,7,7,7,7,'7']},{...base,lineValues:[7,7,7]},{...base,lineValues:[7.5,7,7,7,7,7]},{...base,method:'coins',coins:[]},{...base,method:'coins',coins:Array(6).fill([1,0])},{...base,method:'coins',coins:Array(6).fill([1,0,2])},{...base,method:'coins',coins:Array(6).fill([true,0,1])},{...base,lineValues:[7,7,7,7,7,7],dateTime:'2026-02-30T10:00'},{...base,lineValues:[7,7,7,7,7,7],dateTime:'2026-10-13T24:00'},{...base,lineValues:[7,7,7,7,7,7],dateTime:'2101-01-01T10:00'},{...base,lineValues:[7,7,7,7,7,7],dateTime:'2026-10-13T10:00Z'},{...base,lineValues:[7,7,7,7,7,7],lateZiPolicy:'hidden'},{...base,lineValues:[7,7,7,7,7,7],focusKind:'custom'}]){assert.throws(()=>calculateLiuyao(raw));checks++;}
  for(const dateTime of ['1900-01-01T00:00','2100-12-31T23:59:59'])check(Boolean(calculateLiuyao({...base,dateTime,lineValues:[7,7,7,7,7,7]}).calendar.day),'起卦时间上下限');
  return checks;
}
