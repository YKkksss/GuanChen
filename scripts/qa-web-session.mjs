import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

// 全链路验收专用：真实应用与独立 SQLite，仅供应商响应由本机模拟。
const directory = process.env.GUANCHEN_QA_DIRECTORY
  ? path.resolve(process.env.GUANCHEN_QA_DIRECTORY)
  : mkdtempSync(path.join(tmpdir(), 'guanchen-full-qa-'));
if (path.dirname(directory) !== path.resolve(tmpdir()) || !path.basename(directory).startsWith('guanchen-full-qa-')) {
  throw new Error('验收目录必须是系统临时目录下的 guanchen-full-qa-* 独立目录');
}
let mode = 'normal';
let requestCount = 0;
const mock = http.createServer(async (req, res) => {
  if (req.url === '/__qa/stats') { res.end(JSON.stringify({ requestCount })); return; }
  if (req.url?.startsWith('/__qa/')) {
    mode = req.url.split('/').at(-1);
    res.end(JSON.stringify({ mode }));
    return;
  }
  let raw = '';
  for await (const chunk of req) raw += chunk;
  try {
    const input = JSON.parse(raw);
    requestCount++;
    appendFileSync(path.join(directory, 'ai-requests.jsonl'), JSON.stringify({ at: new Date().toISOString(), mode, stream: input.stream, messages: input.messages }) + '\n');
    if (mode === 'fail') { res.writeHead(503); res.end('QA 模拟供应商不可用'); return; }
    const all = input.messages.map(item => item.content).join('\n');
    const line = label => all.split('\n').find(item => item.startsWith(label))?.slice(label.length);
    const sectionText = line('【必须输出的章节】') ?? line('【章节】');
    let content = '## 测试回复\n\n这是本地模拟供应商生成的 **验收内容**，用于检查流式显示与保存。\n\n- 核对当前命盘事实\n- 记录已确认的现实反馈\n\n不替代真实模型质量验收。';
    if (all.includes('你是观辰奇门遁甲的中文解读助手')) {
      const facts=JSON.parse(input.messages.at(-1).content);
      content=JSON.stringify({content:`## 合成奇门观察\n\n当前采用 **${facts.result.ju.label}**，值符${facts.result.chief.star}落${facts.result.chief.starPalace}宫，值使${facts.result.chief.door}落${facts.result.chief.doorPalace}宫。\n\n- 核对实际节气、三元及换日口径\n- 分清天地盘、九星八门八神与中五寄宫\n- 结合单件占问记录现实条件\n\n这是本机模拟供应商的功能验收内容，不代表真实解读质量。`,evidenceIds:['ju:method','chief:placement',`palace:${facts.result.chief.starPalace}`]});
      if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,1800));
      if(facts.result.reading){const reply=JSON.parse(content),reading=facts.result.reading,palace=reading.focus.palaces[0]??facts.result.chief.starPalace;reply.content+='\n\n本记录参考对象为'+reading.focus.label+'。'+reading.focus.items.map(item=>item.label+item.symbol+(item.hiddenJia?'遁'+item.matchedSymbol:'')+'，地盘原'+item.earthOrigin+'宫、天盘落'+item.palaces.join('、')+'宫').join('；')+'。门迫与宫制门分别核对，星门伏反吟分层，应期只列条件地支，不指定公历发生日。';reply.evidenceIds=['reading:focus','reading:palace:'+palace,'reading:structures'];content=JSON.stringify(reply);}
      if(facts.result.reading?.scenario){const reply=JSON.parse(content),scenario=facts.result.reading.scenario;reply.content+='\n\n占类条件：'+scenario.label+'。'+(scenario.key==='none'?'本盘没有指定占类，不补造取用角色。':'逐角色保留比较层级、双方宫位与自身条件；求财星自身五行和其他条目的宫五行分别解释。角色同宫不合并，宫内其他干的刑墓不能转嫁。')+'本段只验收保存与引用，不判断成绩、收益或实际出行安全。';reply.evidenceIds=['reading:scenario:policy',...facts.result.evidence.filter(item=>item.id.startsWith('reading:scenario:role:')).slice(0,2).map(item=>item.id)];content=JSON.stringify(reply);}
    } else if (all.includes('你是观辰六爻纳甲的中文解读助手')) {
      const facts=JSON.parse(input.messages.at(-1).content);
      content=JSON.stringify({content:`## 合成六爻观察\n\n当前本卦为 **${facts.result.primary.fullName}**，${facts.result.movingLines.length?`第${facts.result.movingLines.join('、')}爻动`:'六爻均静'}，之卦为${facts.result.changed.fullName}。\n\n- 本卦${facts.result.palace.name}宫，世${facts.result.palace.shi}爻、应${facts.result.palace.ying}爻\n- 变爻六亲沿用本卦宫五行，静爻不当作变出爻\n- 核对日月与所选用神类别，记录待核条件\n\n这是本机模拟供应商的功能验收内容，不代表真实解读质量。`,evidenceIds:facts.result.reading?['reading:focus','reading:line:1','reading:timing']:['gua:primary','gua:changed','calendar:day']});
      if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,1800));
      if(facts.result.reading){const reply=JSON.parse(content),focus=facts.result.reading.focus;reply.content+='\n\n用神复核：'+focus.label+'，'+(focus.selected?'当前定位第'+focus.selected.position+'爻'+(focus.selected.hidden?'伏神':'本爻'):'当前尚未唯一定位')+'。月令与日辰分别复核，暗动或日破为条件候选；进退与回头生克只看实际动爻，应期只列地支条件，不给确定日期。';content=JSON.stringify(reply);}
      if(facts.result.reading?.influence){const reply=JSON.parse(content),influence=facts.result.reading.influence;reply.content+='\n\n作用证据链：'+(influence.selection.selectedId?'按保存时用神逐项核对来源与目标':'多个候选分别查看，不替用户取用')+'。来源自身的回头克、空破与生扶入口同时保留；忌元及仇忌共同发动仅表示原明动的结构，不抵消原有制约，也不裁定实际效力。';reply.evidenceIds=['reading:influence:policy',...facts.result.evidence.filter(item=>item.id.startsWith('reading:influence:target:')).slice(0,2).map(item=>item.id)];content=JSON.stringify(reply);}
    } else if (all.includes('你是观辰梅花易数的中文解读助手')) {
      const facts=JSON.parse(input.messages.at(-1).content);
      content=JSON.stringify({content:`## 合成卦象观察\n\n当前本卦为 **${facts.result.primary.fullName}**，第${facts.result.movingLine}爻动，变卦为${facts.result.changed.fullName}。\n\n- 体为${facts.result.body.trigram.name}，用为${facts.result.use.trigram.name}\n- 按保存的互卦口径核对计算过程\n- 结合已知现实条件记录待核问题\n\n这是模拟供应商的功能验收内容，不代表真实解读质量。`,evidenceIds:['gua:primary','gua:changed','relation:primary']});
      if(mode==='slow')await new Promise(resolve=>setTimeout(resolve,1800));
      if(facts.result.reading){const reply=JSON.parse(content),reading=facts.result.reading;reply.content+='\n\n季节复核：'+(reading.context?reading.context.label+'，'+reading.context.monthBranch+'月属'+reading.context.monthElement:'没有明确时间，当前季节未定位')+'。应期明确参考'+reading.timing.label+reading.timing.trigram.name+'，只列卦气月份条件；象数不换算确定日期，互变共享爻不作为独立证据投票。';reply.evidenceIds=['reading:season','reading:relations','reading:timing'];content=JSON.stringify(reply);}
      if(facts.result.reading?.imagery){const reply=JSON.parse(content),imagery=facts.result.reading.imagery;reply.content+='\n\n取象与溯源：五个结构位置分别保留自然、器物和形态候选；当前互卦读取'+(imagery.mutualSource==='changed'?'变卦':'本卦')+'。包含原动位和实际读取翻转值分开，重复卦与共享爻仍来自同一次起卦，不认定现实对象或按数量投票。';reply.evidenceIds=['reading:imagery:policy','reading:imagery:node:body','reading:imagery:change'];content=JSON.stringify(reply);}
      if(facts.result.reading?.scenario){const reply=JSON.parse(content),scenario=facts.result.reading.scenario;reply.content+='\n\n明确占类：'+scenario.label+'。'+(scenario.status==='selected'?scenario.primaryCondition.focus+'；'+scenario.primaryCondition.observation+'上下互与变用只作通用辅助参考，两侧季节另列，不按条数计票。':'未建立占类角色，不从占问猜测求谋、求财或出行。')+'只核对已保存条件，不作成败、收益、事故或精确日期判断。';reply.evidenceIds=['reading:imagery:policy','reading:scenario:policy',...(scenario.primaryCondition?[scenario.primaryCondition.evidenceId]:[])];content=JSON.stringify(reply);}
    } else if (all.includes('你是观辰紫微与八字合参的中文解读助手')) {
      const facts = JSON.parse(input.messages.at(-1).content);
      const z = facts.evidence.find(e => e.id.startsWith(facts.dynamic ? 'ziwei:dynamic:' : 'ziwei:')).id, b = facts.evidence.find(e => e.id.startsWith(facts.dynamic ? 'bazi:dynamic:' : 'bazi:')).id;
      content = JSON.stringify({ summary: `${facts.topic}主题的合成双盘观察，仅用于核对五章解读、引用、保存与版本功能；两套传统解释不构成独立事实的互证。`, sections: ['ziwei', 'bazi', 'common', 'differences', 'action'].map((key, i) => ({ key, content: `第${i + 1}节 **合成观察**：${key}。分别核对紫微宫位与八字月令，保留方法差异和待核条件。\n\n- 核对出生资料与时间口径\n- 记录现实反馈供后续观察\n\n仅用于功能验收。`, evidenceIds: key === 'ziwei' ? [z] : key === 'bazi' ? [b] : [z, b] })) });
      if (facts.dynamic) {
        const reply = JSON.parse(content), stage = facts.dynamic;
        reply.summary = `${stage.label}的${facts.topic}合成阶段观察，仅用于验证同一北京时间的双体系定位与固定保存，不代表真实解读质量。`;
        reply.sections = reply.sections.map(section => ({ ...section, content: section.content + `\n\n观察点${stage.selection.dateTime}；紫微${stage.ziwei.annual.year.ganZhi}年，八字${stage.bazi.year.ganZhi}年。八字大运状态${stage.bazi.luck.status}。农历月与节令月分别核对，不合成为吉凶分数。` }));
        if (stage.review) reply.sections = reply.sections.map(section => ({ ...section, content: section.content + `\n\n主题复核：紫微区分本命与阶段主题宫位；八字跨层关系只列结构，表干与藏干分开。当前适用状态${stage.review.status}。共同观察不构成独立事实的证明，出生当日未知时刻不升级个人适用。` }));
        content = JSON.stringify(reply);
      }
      if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 1800));
    } else if (all.includes('你是观辰八字论命总览的中文解读助手')) {
      const facts = JSON.parse(input.messages.at(-1).content);
      const keys = ['strength', 'pattern', 'climate', 'useful', 'action'];
      content = JSON.stringify({ summary: `${facts.chart.dayMaster.stem}${facts.chart.dayMaster.element}日主、${facts.chart.pillars.month.branch}月的合成论命摘要，仅用于核对保存、版本与依据功能。`,
        sections: keys.map((key, i) => ({ key, content: `第 ${i + 1} 节 **合成观察**：${key}。按实际月令、根气和方法条件核对，不补写时柱，也不强行裁定喜忌。\n\n- 区分表层与藏干位置\n- 对照已开放规则和待核条件\n\n本段仅用于功能验收。`, evidenceIds: [key === 'action' ? 'chart:policy' : facts.evidence.find(e => e.id.startsWith(key+':')).id] })) });
      if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 1800));
      if (facts.natalReview) {
        const reply = JSON.parse(content), natal = facts.natalReview;
        reply.sections = reply.sections.map(section => ({ ...section,
          content: section.content + `\n\n原局作用复核：${natal.period.label}。${natal.period.detail}近合入口通过不等于合化成功，藏根受冲也不能说明已经拔根。`,
          evidenceIds: [section.key === 'climate' ? 'climate:natal-period' : section.key === 'strength' ? facts.evidence.find(e => e.id.startsWith('strength:natal-root:')).id : section.key === 'pattern' ? facts.evidence.find(e => e.id.startsWith('pattern:natal-contact:') || e.id.startsWith('pattern:')).id : section.evidenceIds[0]],
        }));
        content = JSON.stringify(reply);
      }
      if (facts.methodReview) {
        const reply = JSON.parse(content), method = facts.methodReview;
        reply.sections = reply.sections.map(section => ({ ...section,
          content: section.content + `\n\n分方法复核：保留${method.patterns.length}条月令候选。${method.balancing.label}。调候与扶抑分别核对，不按五行数量投票；通关势均与效力仍待核。`,
          evidenceIds: [section.key === 'strength' ? 'strength:method-premises' : section.key === 'climate' ? 'climate:method-premises' : section.key === 'useful' ? 'useful:method-balancing' : section.key === 'pattern' && method.patterns.length ? `pattern:method:${method.patterns[0].id}` : section.evidenceIds[0]],
        }));
        content = JSON.stringify(reply);
      }
      if (facts.monthCommandReview) {
        const reply = JSON.parse(content), review = facts.monthCommandReview;
        reply.sections = reply.sections.map(section => ({ ...section,
          content: section.content + `\n\n司事分日复核：${review.label}。${review.detail}原表、已保存藏干与原调候分支分别核对；只验收定位和引用，不裁定旺衰或格局结果。`,
          evidenceIds: section.key === 'strength' ? ['strength:month-command:policy'] : section.key === 'pattern' ? ['pattern:month-command:comparison'] : section.evidenceIds,
        }));
        content = JSON.stringify(reply);
      }
    } else if (all.includes('你是观辰紫微运势专题的中文分析助手')) {
      const facts = JSON.parse(input.messages.at(-1).content);
      const keys = facts.b ? ['background', 'a_focus', 'a_attention', 'b_focus', 'b_attention', 'comparison', 'actions'] : ['background', 'a_focus', 'a_attention', 'actions'];
      content = JSON.stringify({ summary: `${facts.a.period.label}的${facts.topic}合成专题，${facts.b ? `与${facts.b.period.label}对比，` : ''}用于核对生成、保存、版本与阶段一致性。内容仅用于功能验收。`,
        sections: keys.map((key, i) => ({ key, content: `第 ${i + 1} 节 **合成观察**：${key}。结合所选阶段的宫位和四化，记录可核对的观察方向。\n\n- 核对现实条件与时间范围\n- 记录阶段变化，下次回看验证\n\n本段仅用于功能验收。`,
          evidenceIds: key === 'background' ? [facts.evidence.find(e => e.id.startsWith('natal:')).id, 'a:decadal'] : key === 'comparison' ? ['a:flow', 'b:flow'] : key.startsWith('b_') ? ['b:flow'] : ['a:flow'] })) });
      if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 1800));
    } else if (all.includes('你是观辰紫微运势日历的中文解读助手')) {
      const facts = JSON.parse(input.messages.at(-1).content);
      content = JSON.stringify({ summary: `${facts.date}的${facts.topic}主题合成解读，用于验证日历与保存回看。这一天可以结合阶段变化安排观察与复盘。`,
        sections: ['overview', 'focus', 'attention', 'action'].map((key, index) => ({ key,
          content: `${facts.date} · ${facts.topic}：第${index + 1}节**合成观察**。围绕${['当天主题', '关注方向', '需要核对的条件', '行动与复盘'][index]}，回看给定宫位和四化依据，并记录实际感受。此段仅用于功能测试。`,
          evidenceIds: [['stage:day'], ['stage:year'], ['stage:month'], ['stage:decadal']][index] })) });
      if (mode === 'slow') await new Promise(resolve => setTimeout(resolve, 1800));
    } else if (sectionText) {
      const sections = JSON.parse(sectionText);
      const evidence = JSON.parse(line('【可引用的权威证据】') ?? line('【可引用证据】') ?? '[]');
      content = JSON.stringify({ title: 'QA 专项验收报告', summary: '本报告由本机模拟供应商生成，用于验证完整生成、持久化、版本与导出链路。',
        sections: sections.map((item, i) => ({ ...item, content: `${item.title}：这是第 ${i + 1} 节独立验收内容。综合观察：仅核对给定事实与引用，不补造经历。请记录本节观察结果，后续结合实际反馈复核。`, evidenceIds: evidence[i] ? [evidence[i].id ?? evidence[i].evidenceKey] : [] })),
        actionItems: ['记录一条观察及日期，下次回顾时核对变化。'], openQuestions: ['哪些现实信息仍需要补充？'] });
    } else if (all.includes('你是人生事件候选提取器')) {
      const source = JSON.parse(input.messages.at(-1).content).user_message;
      content = JSON.stringify({ candidates: source.includes('QA候选') ? [
        { title: 'QA候选：入职', category: 'career', startDate: '2018-06-15', datePrecision: 'day', description: '仅用于验收的合成经历', impactLevel: 3, confidence: 0.95, sourceExcerpt: source, reviewNotes: [] },
        { title: 'QA候选：搬家', category: 'relocation', startDate: '2019', datePrecision: 'year', description: '仅用于验收的合成经历', impactLevel: 3, confidence: 0.95, sourceExcerpt: source, reviewNotes: [] },
      ] : [] });
    } else if (all.includes('你负责压缩八字规则证据对话')) {
      content = JSON.stringify({ topicsDiscussed: ['QA 八字功能验收'], explainedFacts: [], userQuestions: [], corrections: [], openQuestions: [], boundariesReiterated: [], doNotAssume: [] });
    } else if (all.includes('记忆提取器')) {
      content = JSON.stringify({ items: [] });
    } else if (all.includes('滚动对话摘要器')) {
      content = JSON.stringify({ user_context: [], confirmed_events: [], topics_discussed: ['QA 网页功能验收'], previous_conclusions: [], corrections: [], open_questions: [], user_preferences: [], disputed_or_uncertain: [], do_not_assume: [] });
    } else if (all.includes('【程序评分结果】')) {
      content = JSON.stringify({ summary: '本地验收反馈：请以程序评分为准核对覆盖情况。', strengths: ['答案已提交并保存。'], omissions: [], factIssues: [], reasoningSuggestions: ['逐项回查程序证据。'], expressionSuggestions: ['区分事实与解释。'], nextRevisionPriorities: ['按评分量表补充遗漏。'] });
    }
    if (!input.stream) {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 150 } }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    for (let i = 0; i < content.length; i += 8) {
      if (res.destroyed) return;
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(i, i + 8) } }] })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, mode === 'slow' ? 300 : 15));
    }
    res.end('data: [DONE]\n\n');
  } catch (error) { res.writeHead(500); res.end(String(error)); }
});
mock.listen(30003, '127.0.0.1', () => {
  const production = process.env.GUANCHEN_QA_PRODUCTION === '1';
  const env = { ...process.env, ACCOUNT_DATA_DIR: path.join(directory, 'accounts'), AUTH_COOKIE_SECURE: '0', AUTH_REGISTRATION_ENABLED: '1', SQLITE_PATH: path.join(directory, 'test.sqlite'), REPORT_EXPORT_DIR: path.join(directory, 'exports'), ZIWEI_NEXT_DIST_DIR: process.env.GUANCHEN_QA_DIST || (production ? '.next-qa-production' : '.next-full-qa'),
    AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'qa-local-only', DEEPSEEK_BASE_URL: 'http://127.0.0.1:30003', DEEPSEEK_MODEL: 'deepseek-chat' };
  writeFileSync(path.join(directory, 'session.json'), JSON.stringify({ directory, appUrl: 'http://127.0.0.1:30002', sqlitePath: env.SQLITE_PATH }));
  console.log(`QA_DIRECTORY=${directory}`);
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...(production ? ['start'] : ['dev', '--turbopack']), '-H', '127.0.0.1', '-p', '30002'], { env, stdio: 'inherit', windowsHide: true });
  const stop = () => { child.kill(); mock.close(); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', () => { mock.close(); process.exitCode = 0; });
});
