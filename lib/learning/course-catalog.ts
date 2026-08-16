import {
  LEARNING_KNOWLEDGE_VERSION,
  LEARNING_METHODOLOGY_VERSION,
  LEARNING_SOURCES,
  getLearningKnowledgePoint,
} from './catalog';
import type {
  LearningCourse,
  LearningCourseLesson,
  LearningQuizGrade,
  LearningQuizQuestion,
  LearningSourceReference,
} from './types';

export const LEARNING_COURSE_VERSION = 'chart-foundation-course-v1';

const LESSON_IDS = [
  'locate-palace',
  'ming-shen',
  'star-layers',
  'sanfang-sizheng',
  'natal-sihua',
  'empty-palace',
  'timing-boundary',
] as const;

const lessons: LearningCourseLesson[] = [
  lesson({
    id: 'locate-palace',
    order: 1,
    title: '先建立宫位坐标',
    summary: '理解十二宫是生活主题坐标，养成先确认宫名与地支、再读取星曜的顺序。',
    durationMinutes: 8,
    knowledgePointIds: ['chart-palace'],
    objectives: ['能说出宫位在读盘中的作用', '看到星曜时先确认它落在哪个宫位', '区分宫名、宫干与宫支三个字段'],
    sections: [
      section('palace-coordinate', '宫位是问题的坐标', [
        '一张紫微命盘把十二类生活主题放入十二个宫位。宫位先回答“正在观察什么主题”，星曜再描述这个主题中的结构特征。',
        '项目命盘会明确保存宫名、宫干和宫支。学习时先把这三个程序事实读出来，不凭图面位置猜测。',
      ], ['先主题、后星曜', '宫名与地支共同定位当前宫位', '相邻格子不等于固定的三合关系']),
      section('palace-practice', '在自己的命盘里怎么练', [
        '任选一个宫位，只做事实复述：这是哪个宫、位于哪个地支、宫内有哪些星曜。先不要解释吉凶。',
        '完成事实复述后，再切换到另一个宫位重复练习，直到不再跳过宫位定位。',
      ], ['练习目标是结构识别，不是背结论', '无法确认的字段应回到命盘数据核对']),
    ],
    commonMistakes: ['看到熟悉的星曜就立刻下结论', '只记宫名，不核对宫位地支', '把命盘图上的相邻宫位当作固定关系'],
    sourceIds: ['project:chart-engine', 'project:chart-types', 'classic:gusuifu:reading-order'],
    quiz: [
      question('palace-first', 'single_choice', '开始读取一个宫位时，第一步最合适做什么？', [['locate', '确认宫名、宫干与宫支'], ['judge', '直接判断吉凶'], ['year', '先加入流年四化']], 'locate', '宫位是观察主题的坐标，应先定位，再读取星曜和关系。', ['project:chart-engine']),
      question('palace-star', 'true_false', '只要认得宫内主星，就可以忽略它落在哪一个宫位。', [['true', '正确'], ['false', '错误']], 'false', '同一星曜落入不同宫位，所处主题不同；读盘不能脱离宫位。', ['classic:gusuifu:reading-order']),
    ],
  }),
  lesson({
    id: 'ming-shen',
    order: 2,
    title: '识别命宫与身宫',
    summary: '把命宫、身宫视为确定性位置标记，先识别是否同宫，再进入传统解释。',
    durationMinutes: 8,
    knowledgePointIds: ['chart-ming-shen'],
    objectives: ['能在命盘中找到命宫和身宫', '知道命宫与身宫可能同宫', '避免把身宫简单当成第二个命宫'],
    sections: [
      section('ming-shen-facts', '先把位置读对', [
        '命宫和身宫都由排盘程序根据出生信息确定。它们首先是位置事实，而不是由 AI 根据性格描述猜出来的标签。',
        '二者可能落在同一宫，也可能分处不同宫位。课程只要求先识别位置；更深的传统解释应放在结构完整后进行。',
      ], ['命宫、身宫由规则引擎确定', '允许同宫，不强行拆分', '位置事实与解释结论分开']),
      section('ming-shen-practice', '最小练习', [
        '打开学习模式并点选命宫，确认界面是否同时标记身宫；随后再点选身宫，复述它的宫名和地支。',
      ], ['先回答“在哪里”', '暂不回答“必然代表什么”']),
    ],
    commonMistakes: ['把身宫固定理解为晚年而忽略完整结构', '认为命宫与身宫不可能同宫', '根据现实经历反推并篡改程序位置'],
    sourceIds: ['project:chart-engine', 'project:chart-types', 'classic:gusuifu:reading-order'],
    quiz: [
      question('ming-shen-kind', 'single_choice', '本课程首先把命宫和身宫看作什么？', [['position', '规则引擎生成的位置事实'], ['prediction', 'AI 生成的未来预测'], ['event', '用户已经确认的人生事件']], 'position', '命宫、身宫位置来自确定性排盘，应先识别位置，再讨论传统解释。', ['project:chart-types']),
      question('ming-shen-same', 'true_false', '命宫与身宫可能落在同一个宫位。', [['true', '正确'], ['false', '错误']], 'true', '项目结构允许命宫与身宫同宫，界面会同时显示两个标记。', ['project:chart-engine']),
    ],
  }),
  lesson({
    id: 'star-layers',
    order: 3,
    title: '分层读取星曜',
    summary: '先主星、再辅吉与煞曜，只读取命盘中实际存在的星曜，不让文字模型补算。',
    durationMinutes: 10,
    knowledgePointIds: ['chart-stars'],
    objectives: ['区分主星、辅吉星与煞星', '掌握先主后辅的记录顺序', '理解无主星不等于没有信息'],
    sections: [
      section('star-hierarchy', '为什么要分层', [
        '命盘中的星曜具有类型字段。课程采用“主星—辅吉星—煞星”的稳定读取顺序，目的是避免把所有星曜视为同一权重。',
        '学习阶段先准确列出星名和类型，不从单颗星直接推导现实事件，也不补充命盘快照里不存在的星曜。',
      ], ['星曜来自命盘快照', '记录顺序稳定可复核', '单星不能替代整宫和三方结构']),
      section('empty-is-not-none', '无主星不是无信息', [
        '某宫没有主星时称为空宫，但宫位主题、辅煞星、对宫和三方关系仍然存在。空宫的处理会在第六章单独学习。',
      ], ['空宫仅表示本宫无主星', '不要把“无主星”写成“什么都没有”']),
    ],
    commonMistakes: ['把辅星和主星按同一层级罗列', '看到一颗煞星便作绝对负面判断', '命盘无主星时由 AI 编造一颗主星'],
    sourceIds: ['project:chart-types', 'method:learning-boundary'],
    quiz: [
      question('star-order', 'single_choice', '本课程推荐的星曜读取顺序是什么？', [['major-first', '主星，再辅吉星与煞星'], ['sha-first', '煞星，再主星'], ['random', '按熟悉程度任意读取']], 'major-first', '稳定的分层顺序有助于复核，也能避免所有星曜权重混杂。', ['project:chart-types']),
      question('empty-info', 'true_false', '某宫没有主星，就表示这个宫位完全没有可读信息。', [['true', '正确'], ['false', '错误']], 'false', '空宫仍有宫位主题、辅煞星及三方四正关系。', ['project:chart-types']),
    ],
  }),
  lesson({
    id: 'sanfang-sizheng',
    order: 4,
    title: '建立三方四正',
    summary: '把本宫、对宫和两个三合宫组成四宫结构，摆脱孤立看单宫的习惯。',
    durationMinutes: 12,
    knowledgePointIds: ['chart-sanfang'],
    objectives: ['说出三方四正的四个组成部分', '知道三合宫不是相邻宫位', '能使用命盘连线核对关系'],
    sections: [
      section('four-palace-frame', '四宫结构', [
        '本课程把三方四正定义为本宫、对宫和两个三合宫。项目规则引擎会依据宫位地支计算关系，学习界面用连线和高亮呈现。',
        '三方四正不是把四个宫位混成一个宫，而是要求分析本宫时同步查看其支持、牵引和对照结构。',
      ], ['本宫一处', '对宫一处', '三合宫两处']),
      section('relation-practice', '关系跳转练习', [
        '在命盘学习模式中选中任一宫位，依次点击“本宫、对宫、三合”标签，核对宫名和地支是否随选择变化。',
      ], ['关系由程序计算', '不靠图形距离猜测', '切换后仍应先读宫位再读星曜']),
    ],
    commonMistakes: ['只看本宫，不查看对宫和三合宫', '把左右相邻的格子当成三合宫', '把四宫星曜全部写成本宫原生星曜'],
    sourceIds: ['project:chart-engine', 'classic:gusuifu:sanfang'],
    quiz: [
      question('sanfang-members', 'single_choice', '三方四正由哪些宫位组成？', [['four', '本宫、对宫、两个三合宫'], ['adjacent', '本宫和左右相邻三宫'], ['only-trine', '本宫和一个三合宫']], 'four', '项目学习方法固定使用本宫、对宫与两个三合宫形成四宫结构。', ['project:chart-engine', 'classic:gusuifu:sanfang']),
      question('sanfang-adjacent', 'true_false', '命盘图上与本宫相邻的宫位，就一定是它的三合宫。', [['true', '正确'], ['false', '错误']], 'false', '三合关系由地支关系计算，不能用图面相邻代替。', ['project:chart-engine']),
    ],
  }),
  lesson({
    id: 'natal-sihua',
    order: 5,
    title: '检查本命四化',
    summary: '先确认四化所属时间层，本章只读取命盘快照中的本命禄、权、科、忌。',
    durationMinutes: 10,
    knowledgePointIds: ['chart-sihua'],
    objectives: ['识别星曜上的本命四化标记', '形成先问时间层级的习惯', '不把未显示的运限四化混入本命'],
    sections: [
      section('sihua-layer', '四化先问层级', [
        '项目命盘会把化禄、化权、化科、化忌标记在对应星曜上。学习基础盘时，只读取命盘快照中的本命四化。',
        '大限四化和流年四化属于时间运势层。即使名称相同，也必须保留来源层级，不能在没有时间标签时混写。',
      ], ['先识别四化星曜', '同时标记“本命”层级', '没有数据就不补算']),
      section('sihua-record', '建议记录格式', [
        '使用“本命：某星化某，落某宫”的格式记录。这个格式同时保留星曜、四化类型、宫位和时间层级。',
      ], ['事实字段完整', '不直接等同现实事件']),
    ],
    commonMistakes: ['把本命、大限和流年四化写成同一组', '只写“化忌”而不写对应星曜和宫位', '根据四化名称直接断定现实结果'],
    sourceIds: ['project:chart-types', 'method:learning-boundary'],
    quiz: [
      question('sihua-layer-first', 'single_choice', '看到四化标记时，首先还要确认什么？', [['level', '它属于本命、大限还是流年层'], ['color', '界面颜色是否醒目'], ['neighbor', '相邻宫位的名称']], 'level', '四化名称必须与来源层级一起记录，避免本命和运限混写。', ['method:learning-boundary']),
      question('sihua-event', 'true_false', '看到某星化忌，就可以直接断定现实中一定发生坏事。', [['true', '正确'], ['false', '错误']], 'false', '四化属于命盘结构信息，不能脱离宫位、三方、时间和现实证据作绝对判断。', ['method:learning-boundary']),
    ],
  }),
  lesson({
    id: 'empty-palace',
    order: 6,
    title: '处理空宫与借对宫',
    summary: '空宫表示本宫没有主星；读取对宫主星时必须保留“借自对宫”的来源标签。',
    durationMinutes: 10,
    knowledgePointIds: ['chart-empty-palace'],
    objectives: ['正确解释“空宫”的数据含义', '能找到空宫的对宫', '借星时保留来源而不改写原始命盘'],
    sections: [
      section('empty-definition', '空宫的精确定义', [
        '在当前项目里，空宫是一个程序字段，表示该宫没有主星。它不表示该生活主题不存在，也不表示宫内没有辅星或煞星。',
        '程序会保存借自哪个对宫以及可借读的主星名称，学习界面直接读取这组事实。',
      ], ['空宫等于无主星', '对宫关系仍然存在', '辅煞星和三方结构仍需记录']),
      section('borrow-label', '借星必须带来源', [
        '正确记录方式是“本宫为空宫，借对宫某宫的某主星观察”。不能把借来的主星改写成本宫原生星曜。',
      ], ['保留“借”字', '保留对宫宫名', '不改动命盘快照']),
    ],
    commonMistakes: ['把空宫说成什么事情都不会发生', '只借主星却不查看三方结构', '把对宫主星复制成本宫原生星曜'],
    sourceIds: ['project:chart-engine', 'project:chart-types', 'classic:gusuifu:empty-palace'],
    quiz: [
      question('empty-means', 'single_choice', '当前项目中“空宫”的准确含义是什么？', [['no-major', '本宫没有主星'], ['nothing', '本宫完全没有任何信息'], ['bad', '这个宫位必然不好']], 'no-major', '空宫是结构字段，只表示本宫无主星。', ['project:chart-types']),
      question('borrow-origin', 'true_false', '借读对宫主星时，应明确标记它借自对宫，不能写成本宫原生星曜。', [['true', '正确'], ['false', '错误']], 'true', '来源标签能避免篡改命盘事实，也是后续结论可追溯的基础。', ['classic:gusuifu:empty-palace']),
    ],
  }),
  lesson({
    id: 'timing-boundary',
    order: 7,
    title: '区分本命与运限',
    summary: '完成基础读盘闭环：先固定本命结构，再把大限、流年作为带时间标签的叠加层。',
    durationMinutes: 12,
    knowledgePointIds: ['chart-levels'],
    objectives: ['区分本命、大限与流年三个层级', '知道基础课程为什么先固定本命', '能复述七步读盘顺序和分析边界'],
    sections: [
      section('timing-layers', '不同层级回答不同问题', [
        '本命命盘提供基础结构，大限描述十年阶段，流年描述具体年份。三个层级可以组合，但每条事实必须保留自己的时间标签。',
        '基础课程先固定本命，是为了建立稳定坐标。没有坐标就直接叠加运限，容易把某一年的变化误写成终身特征。',
      ], ['本命是基础结构', '大限和流年是时间叠加', '同名宫位或四化也要标记层级']),
      section('seven-steps', '七步最小读盘闭环', [
        '依次完成：确定本宫、识别命身宫、分层读取星曜、建立三方四正、检查本命四化、处理空宫、确认分析边界。',
        '走完七步得到的是可复核的结构事实。之后才能进入传统解释、现实验证或 AI 辅助说明。',
      ], ['先事实后解释', '先结构后时间', '传统文化结论不等于现实事实']),
    ],
    commonMistakes: ['用某一年发生的事情替代本命结构', '叠加流年后忘记标注年份', '结构尚未核对就直接要求 AI 给出绝对结论'],
    sourceIds: ['project:chart-engine', 'method:learning-boundary', 'classic:gusuifu:reading-order'],
    quiz: [
      question('timing-base', 'single_choice', '基础课程为什么先固定本命层？', [['coordinate', '先建立稳定结构坐标，再叠加大限和流年'], ['forecast', '因为本命可以直接预测每一天'], ['ignore', '因为大限和流年没有任何作用']], 'coordinate', '本命是基础坐标，运限应作为带时间标签的叠加层。', ['method:learning-boundary']),
      question('facts-first', 'true_false', '完成结构事实核对后，再进入传统解释和现实验证，是本课程推荐的顺序。', [['true', '正确'], ['false', '错误']], 'true', '先事实后解释能减少混层、补算和过度断言。', ['classic:gusuifu:reading-order', 'method:learning-boundary']),
    ],
  }),
];

export const LEARNING_COURSES: LearningCourse[] = [
  {
    schemaVersion: 1,
    id: 'ziwei-chart-foundation',
    slug: 'ziwei-chart-foundation',
    version: LEARNING_COURSE_VERSION,
    title: '紫微斗数命盘结构入门',
    subtitle: '从宫位坐标到本命与运限，完成第一条可复核的七步读盘路径',
    description: '面向第一次系统学习紫微斗数的用户。课程不要求背诵吉凶断语，而是先训练命盘结构识别、来源追溯和分析边界。',
    level: 'beginner',
    estimatedMinutes: lessons.reduce((total, item) => total + item.durationMinutes, 0),
    methodologyVersion: LEARNING_METHODOLOGY_VERSION,
    knowledgeVersion: LEARNING_KNOWLEDGE_VERSION,
    lessons,
    sourceIds: [...new Set(lessons.flatMap(item => item.sourceIds))],
    boundary: '课程用于传统文化学习与命盘结构训练，不提供确定的人生预测，也不替代医疗、法律、投资或心理等专业意见。',
  },
];

export function getLearningCourse(slugOrId: string): LearningCourse | null {
  return LEARNING_COURSES.find(course => course.slug === slugOrId || course.id === slugOrId) ?? null;
}

export function getLearningCourseLesson(course: LearningCourse, slugOrId: string): LearningCourseLesson | null {
  return course.lessons.find(item => item.slug === slugOrId || item.id === slugOrId) ?? null;
}

export function getCourseSources(course: LearningCourse): LearningSourceReference[] {
  return LEARNING_SOURCES.filter(source => course.sourceIds.includes(source.id));
}

export function getLessonSources(lessonItem: LearningCourseLesson): LearningSourceReference[] {
  return LEARNING_SOURCES.filter(source => lessonItem.sourceIds.includes(source.id));
}

export function gradeLearningQuiz(
  lessonItem: LearningCourseLesson,
  answers: Record<string, string>,
): LearningQuizGrade {
  const results = lessonItem.quiz.map(item => {
    const selectedOptionId = typeof answers[item.id] === 'string' ? answers[item.id] : null;
    return {
      questionId: item.id,
      selectedOptionId,
      correctOptionId: item.correctOptionId,
      correct: selectedOptionId === item.correctOptionId,
      explanation: item.explanation,
    };
  });
  const correctCount = results.filter(item => item.correct).length;
  const score = results.length ? Math.round((correctCount / results.length) * 100) : 0;
  return { score, passed: score >= lessonItem.passScore, correctCount, totalCount: results.length, results };
}

function lesson(input: Omit<LearningCourseLesson, 'slug' | 'prerequisiteLessonIds' | 'passScore'>): LearningCourseLesson {
  const knowledgePoints = input.knowledgePointIds.map(id => getLearningKnowledgePoint(id));
  if (knowledgePoints.some(item => !item)) throw new Error(`课程章节 ${input.id} 引用了不存在的知识点`);
  return {
    ...input,
    slug: input.id,
    prerequisiteLessonIds: input.order > 1 ? [LESSON_IDS[input.order - 2]] : [],
    passScore: 100,
  };
}

function section(id: string, title: string, paragraphs: string[], keyPoints: string[]) {
  return { id, title, paragraphs, keyPoints };
}

function question(
  id: string,
  type: LearningQuizQuestion['type'],
  prompt: string,
  options: Array<[string, string]>,
  correctOptionId: string,
  explanation: string,
  sourceIds: string[],
): LearningQuizQuestion {
  return { id, type, prompt, options: options.map(([optionId, label]) => ({ id: optionId, label })), correctOptionId, explanation, sourceIds };
}
