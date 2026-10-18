import assert from 'node:assert/strict';
import {calculateBazi} from '../lib/bazi/engine';
import {BAZI_MONTHLY_CLIMATE_REFERENCES,CLIMATE_BRANCH_ORDER} from '../lib/bazi/monthly-climate-rules';
import {buildBaziFineReview,reviewSpecialPatterns} from '../lib/bazi/fine-reading-engine';
import {analyzeBaziClimate,buildBaziReadingFacts,buildBaziReadingChatSnapshot} from '../lib/bazi/reading-engine';
import {analyzeBaziInterpretation} from '../lib/bazi/interpretation-engine';
import {BAZI_READING_METHODOLOGY_VERSION} from '../lib/bazi/climate-rules';
import {fingerprintBaziReading} from '../lib/db/bazi-readings';
import type {BaziCalculationResult,BaziElement,BaziPillar} from '../lib/bazi/types';
let checks=0;function check(v:unknown,label:string){assert.ok(v,label);checks++;}
const elements:Record<string,BaziElement>={甲:'木',乙:'木',丙:'火',丁:'火',戊:'土',己:'土',庚:'金',辛:'金',壬:'水',癸:'水'};
const hidden:Record<string,string>={子:'癸',丑:'己癸辛',寅:'甲丙戊',卯:'乙',辰:'戊乙癸',巳:'丙庚戊',午:'丁己',未:'己丁乙',申:'庚壬戊',酉:'辛',戌:'戊辛丁',亥:'壬甲'};
const base=calculateBazi({birthDate:'1992-07-09',birthTime:'09:30',gender:'female'});
// 以下是规则边界的人工四柱结构，不冒充与基准出生日期一致的实际命盘。
function fixture(pairs:string[],unknown=false):BaziCalculationResult{
 const pillars=Object.fromEntries(['year','month','day','time'].map((key,i)=>{const original=base.pillars[key as keyof typeof base.pillars]!;const [stem,branch]=pairs[i];return[key,key==='time'&&unknown?null:{...original,stem,branch,ganZhi:stem+branch,stemElement:elements[stem],hiddenStems:[...hidden[branch]].map(s=>({stem:s,element:elements[s],tenGod:'合成角色'}))}]})) as BaziCalculationResult['pillars'];
 return{...base,pillars,dayMaster:{stem:pillars.day.stem,element:pillars.day.stemElement},completeness:unknown?'partial_unknown_time':'complete'};
}
check(Object.keys(BAZI_MONTHLY_CLIMATE_REFERENCES).length===120,'十干十二月索引完整');
for(const stem of Object.keys(elements))for(const branch of CLIMATE_BRANCH_ORDER){
 const r=BAZI_MONTHLY_CLIMATE_REFERENCES[`${stem}:${branch}`];
 check(Boolean(r)&&r.coreStems.length>0&&r.sourceUrl.includes('#三')&&r.section.includes(stem),'每组合有明确取用入口与章节');
 check(r.stems.every(s=>Object.hasOwn(elements,s))&&new Set(r.stems).size===r.stems.length&&r.coreStems.every(s=>r.stems.includes(s)),'天干合法且无重复');
 check(r.basis!=='period_conditional'||Boolean(r.periodNote),'月内条件必须有说明');
 const c={...base,dayMaster:{stem,element:elements[stem]},pillars:{...base.pillars,month:{...base.pillars.month,branch}}};
 const f=buildBaziFineReview(c),climate=analyzeBaziClimate(c);
 check(f.stemChecks.length===r.stems.length&&climate.reference?.basis===r.basis,'规则与实际复核清单一致');
 check(f.specialPatterns.length===8&&f.stemChecks.every(s=>!s.surface.some(v=>v.startsWith('日柱'))),'排除日干自充候选并保留八类特殊入口');
}
// 独立核对原典中有区别的月份，防止整季复制或把同五行当天干替代。
for(const [key,expected] of [['甲:辰','庚壬'],['甲:未','丁庚'],['乙:戌','癸辛'],['丙:亥','甲戊庚'],['丁:午','壬庚'],['戊:午','壬甲'],['己:卯','甲癸'],['庚:戌','甲壬'],['辛:寅','己壬庚'],['壬:卯','戊辛庚'],['癸:申','丁甲'],['辛:丑','丙壬']])check(BAZI_MONTHLY_CLIMATE_REFERENCES[key].coreStems.join('')===expected,'原典分月用干核对');
check(BAZI_MONTHLY_CLIMATE_REFERENCES['乙:丑'].basis==='shared_paragraph'&&BAZI_MONTHLY_CLIMATE_REFERENCES['己:午'].basis==='shared_paragraph','未单列月断如实显示合论');
for(const key of ['乙:午','乙:酉','壬:丑','癸:辰','癸:未'])check(BAZI_MONTHLY_CLIMATE_REFERENCES[key].basis==='period_conditional','月内分支保留待核');
let c=fixture(['壬子','乙卯','丙午','己未']);let s=buildBaziFineReview(c).stemChecks.find(s=>s.stem==='壬')!;
check(s.surface.join()==='年柱壬'&&s.exactRoots.length===0&&s.sameElementRoots.includes('年柱子藏癸'),'壬透而子藏癸不能叫壬有同干根');
c=fixture(['壬亥','乙卯','丙午','丁巳']);s=buildBaziFineReview(c).stemChecks.find(s=>s.stem==='壬')!;
check(s.exactRoots.includes('年柱亥藏壬')&&s.rootClashes.some(x=>x.includes('巳')),'同干根与根支相冲同时保留');
check(s.combinations.some(x=>x.includes('丁'))&&s.combinations.every(x=>x.includes('未判')),'丁壬合只记录位置');
c=fixture(['乙卯','丁酉','辛亥','壬子']);s=buildBaziFineReview(c).stemChecks.find(s=>s.stem==='甲')!;
check(s.role==='conditional'&&s.condition==='not_observed','辛酉无土时甲支线未满足位置入口');
c=fixture(['戊辰','丁酉','辛亥','壬子']);s=buildBaziFineReview(c).stemChecks.find(s=>s.stem==='甲')!;
check(s.condition==='position_observed'&&s.cautions.some(x=>x.includes('不证明土厚')),'见土只打开复核不判土厚');
c=fixture(['乙卯','丁巳','壬午','己未']);s=buildBaziFineReview(c).stemChecks.find(s=>s.stem==='壬')!;
check(s.status==='not_observed'&&s.surface.length===0,'壬日主自身不能算其他壬比助已经出现');
const unknown=fixture(['乙卯','丁巳','壬午','己未'],true);s=buildBaziFineReview(unknown).stemChecks.find(s=>s.stem==='壬')!;
check(s.status==='unknown_time'&&s.cautions.some(x=>x.includes('缺少时柱')),'缺时柱对用干未见降级');
c=fixture(['甲寅','乙卯','甲辰','壬亥']);let special=reviewSpecialPatterns(c);
check(special.find(p=>p.id==='exclusive:木')?.status==='entry_observed','木日主完整木会结构为复核入口');
c=fixture(['甲寅','乙卯','甲辰','庚申']);special=reviewSpecialPatterns(c);
check(special.find(p=>p.id==='exclusive:木')?.status==='counterevidence','金的表层或藏干作为木专旺反证保留');
c=fixture(['戊辰','己丑','甲午','戊戌']);special=reviewSpecialPatterns(c);
check(special.find(p=>p.id==='follow-wealth')?.status==='counterevidence','财表层多但仍见根印不能宣告从财');
c=fixture(['己酉','乙卯','甲辰','壬亥']);special=reviewSpecialPatterns(c);
check(special.find(p=>p.id==='transformation')?.status==='not_observed'&&special.find(p=>p.id==='transformation')?.observations.some(x=>x.includes('远隔')),'年干远合不充当日干近邻五合');
c=fixture(['乙酉','己卯','甲辰','壬亥']);special=reviewSpecialPatterns(c);
check(special.find(p=>p.id==='transformation')?.status==='entry_observed'&&special.find(p=>p.id==='transformation')?.pending.some(x=>x.includes('不等于')),'近邻五合也不判化气');
check(reviewSpecialPatterns({...c,pillars:{...c.pillars,time:null},completeness:'partial_unknown_time'}).find(p=>p.id==='transformation')?.status==='unknown_time','时柱缺失不裁定化气入口');
const source=Object.values(BAZI_MONTHLY_CLIMATE_REFERENCES);const coverage=buildBaziFineReview(base).coverage;
check(coverage.total===coverage.monthParagraphs+coverage.sharedParagraphs+coverage.periodConditional&&coverage.sharedParagraphs>0&&coverage.periodConditional===5,'来源粒度统计完整且不假称全部独立月断');
check(source.every(r=>!/[富贵贫贱]|寿命|妻贤|残疾/.test(r.rationale)),'数据不继承原文命运断语');
const snapshot=buildBaziReadingChatSnapshot(base);check(snapshot.includes('具体用干复核')&&snapshot.includes('特殊格局复核')&&snapshot.includes(BAZI_READING_METHODOLOGY_VERSION),'连续问答携带同版本精细复核');
check(!buildBaziReadingChatSnapshot(base,'请解释2026年的藏干触达条件').includes('具体用干复核')&&buildBaziReadingChatSnapshot(base,'请解释调候用神的条件').includes('具体用干复核'),'按问题带入详细月令资料避免挤掉岁运证据');
const interpretation=analyzeBaziInterpretation(base);
const minimalPatterns={candidates:[],monthCommand:{isStorageMonth:false}} as unknown as Parameters<typeof buildBaziReadingFacts>[2];
const facts=buildBaziReadingFacts(base,interpretation,minimalPatterns,'synthetic-fingerprint');
check(facts.evidence.some(e=>e.id.startsWith('climate:check:'))&&facts.evidence.filter(e=>e.id.startsWith('pattern:special:')).length===8,'新依据可供报告引用且每类唯一');
check(new Set(facts.evidence.map(e=>e.id)).size===facts.evidence.length,'依据标识不重复');
check(fingerprintBaziReading(facts)!==fingerprintBaziReading({...facts,methodologyVersion:'bazi-reading-v1-seasonal-cross-method',fineReview:undefined}),'新版指纹不复用旧规则报告');
const seasonalFixture=fixture(['甲子','乙午','乙亥','壬子']);const f=buildBaziReadingFacts(seasonalFixture,analyzeBaziInterpretation(seasonalFixture),minimalPatterns,'period');
check(f.usefulElements.filter(e=>f.climate.rule.elements.includes(e.element)).every(e=>e.status==='conditions_pending'),'月内分支不把所有列项同时当无条件取用');
console.log(`八字精细论命专项通过：${checks}项；120组来源粒度、原典用干、同干根区别、条件支线、五合根冲、特殊格局入口与反证、未知时辰、报告引用和版本指纹。`);
