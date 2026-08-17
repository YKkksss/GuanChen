import type { ChatMessage } from '@/lib/ai/deepseek';
import { createChatCompletion, getProviderConfig } from '@/lib/ai/deepseek';
import { getConversation } from '@/lib/db/conversations';
import {
  completeOpenPracticeAttempt,
  createOpenPracticeAttempt,
  failOpenPracticeAttempt,
  getOpenPracticeAttempt,
  listOpenPracticeAttempts,
  retryOpenPracticeAttempt,
} from '@/lib/db/learning-open-practice';
import {
  buildOpenPracticeExercise,
  gradeOpenPracticeAnswer,
  listOpenPracticeTemplates,
} from './open-practice-catalog';
import type {
  LearningOpenAiFeedback,
  LearningOpenExercise,
  LearningOpenExerciseTemplateId,
  LearningOpenGrade,
  LearningOpenPracticeAttempt,
} from './types';

const FEEDBACK_DISCLAIMER = 'AI 反馈仅解释程序评分量表中的覆盖、遗漏、事实一致性和表达方式，不能修改程序得分，也不构成现实人生判断。';

export function getOpenPracticeWorkspace(
  conversationId: string,
  templateId: LearningOpenExerciseTemplateId,
) {
  const conversation = getConversation(conversationId);
  if (!conversation) throw new Error('单人命盘会话不存在');
  return {
    templates: listOpenPracticeTemplates(),
    exercise: buildOpenPracticeExercise(conversation, templateId),
    attempts: listOpenPracticeAttempts({ conversationId, exerciseTemplateId: templateId, limit: 30 }),
  };
}

export async function submitOpenPractice(input: {
  conversationId: string;
  templateId: LearningOpenExerciseTemplateId;
  answer: string;
  parentAttemptId?: string | null;
}): Promise<LearningOpenPracticeAttempt> {
  const answer = normalizeAnswer(input.answer);
  const conversation = getConversation(input.conversationId);
  if (!conversation) throw new Error('单人命盘会话不存在');
  const exercise = buildOpenPracticeExercise(conversation, input.templateId);
  if (input.parentAttemptId) validateParentAttempt(input.parentAttemptId, exercise);
  const grade = gradeOpenPracticeAnswer(exercise, answer);
  const provider = getProviderConfig();
  const attempt = createOpenPracticeAttempt({
    exercise,
    answer,
    grade,
    parentAttemptId: input.parentAttemptId,
    provider: provider.provider,
    model: provider.model,
  });
  return generateAndStoreFeedback(attempt);
}

export async function retryOpenPracticeFeedback(attemptId: string): Promise<LearningOpenPracticeAttempt> {
  const existing = getOpenPracticeAttempt(attemptId);
  if (!existing) throw new Error('开放式练习记录不存在');
  if (existing.status === 'completed') return existing;
  const provider = getProviderConfig();
  const attempt = retryOpenPracticeAttempt(attemptId, provider.provider, provider.model)!;
  return generateAndStoreFeedback(attempt);
}

async function generateAndStoreFeedback(attempt: LearningOpenPracticeAttempt) {
  try {
    const result = await createChatCompletion(
      buildOpenPracticeFeedbackMessages(attempt.exercise, attempt.grade, attempt.answer),
      { temperature: 0.15, maxTokens: 1_800, thinking: false },
    );
    const feedback = parseOpenPracticeFeedback(result.content, attempt.exercise, attempt.grade);
    return completeOpenPracticeAttempt({
      id: attempt.id,
      feedback,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    });
  } catch (error) {
    return failOpenPracticeAttempt(
      attempt.id,
      error instanceof Error ? error.message : 'open_practice_feedback_failed',
    );
  }
}

export function buildOpenPracticeFeedbackMessages(
  exercise: LearningOpenExercise,
  grade: LearningOpenGrade,
  answer: string,
): ChatMessage[] {
  const evidence = exercise.evidencePoints.map(point => ({ id: point.id, label: point.label, fact: point.fact }));
  const rubric = exercise.rubric.map(criterion => ({
    id: criterion.id,
    title: criterion.title,
    description: criterion.description,
    maxScore: criterion.maxScore,
    evidencePointIds: criterion.evidencePointIds,
  }));
  return [
    {
      role: 'system',
      content: `你是紫微斗数学习练习的批改解释助手。程序已经根据命盘快照和固定量表完成最终评分，你只能解释评分结果，不能重新排盘、补造盘面事实、增加或减少分数。

输出必须是合法 JSON 对象，不要使用 Markdown 代码块，不要输出 JSON 以外的文字。格式：
{
  "summary": "80至180字总评",
  "strengths": ["1至4条已做好的部分"],
  "omissions": ["0至5条遗漏要点"],
  "factIssues": ["0至4条事实或层级问题"],
  "reasoningSuggestions": ["1至5条推理顺序建议"],
  "expressionSuggestions": ["0至4条表达改进"],
  "nextRevisionFocus": ["1至4条下一版优先修改项"],
  "criterionComments": [{"criterionId":"输入中的评分项ID","comment":"该项解释","evidencePointIds":["输入中存在的证据ID"]}]
}

硬性规则：
1. 最终得分、各项分数、扣分和通过状态均由程序决定，不得修改、重算或提出另一个分数。
2. 只能引用输入中的权威事实和证据 ID，不得自行计算宫位、星曜、四化或现实经历。
3. 对遗漏项应说明如何补齐，不要直接代写一篇完整答案。
4. 区分程序盘面事实、传统解释与现实验证，不使用必然、注定、百分百等绝对措辞。
5. 每个评分项输出一条 criterionComments；引用的 evidencePointIds 必须来自输入。`,
    },
    {
      role: 'user',
      content: [
        `【练习题】${exercise.prompt}`,
        `【权威盘面事实】${JSON.stringify(evidence)}`,
        `【固定评分量表】${JSON.stringify(rubric)}`,
        `【程序评分结果】${JSON.stringify(grade)}`,
        `【用户答案】${answer}`,
        '请严格依据程序评分结果，给出可执行的学习反馈。',
      ].join('\n'),
    },
  ];
}

export function parseOpenPracticeFeedback(
  raw: string,
  exercise: LearningOpenExercise,
  grade: LearningOpenGrade,
): LearningOpenAiFeedback {
  const parsed = parseJsonObject(raw);
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  if (!summary) throw new Error('AI 反馈缺少总评');
  const validEvidenceIds = new Set(exercise.evidencePoints.map(point => point.id));
  const comments: unknown[] = Array.isArray(parsed.criterionComments) ? parsed.criterionComments : [];
  return {
    schemaVersion: 1,
    summary,
    strengths: normalizeStringArray(parsed.strengths, 4),
    omissions: normalizeStringArray(parsed.omissions, 5),
    factIssues: normalizeStringArray(parsed.factIssues, 4),
    reasoningSuggestions: normalizeStringArray(parsed.reasoningSuggestions, 5),
    expressionSuggestions: normalizeStringArray(parsed.expressionSuggestions, 4),
    nextRevisionFocus: normalizeStringArray(parsed.nextRevisionFocus, 4),
    criterionComments: exercise.rubric.map(criterion => {
      const candidate = comments.find((item): item is Record<string, unknown> => isObject(item) && item.criterionId === criterion.id);
      const rawEvidenceIds: unknown[] = candidate && Array.isArray(candidate.evidencePointIds) ? candidate.evidencePointIds : [];
      const evidenceIds = rawEvidenceIds
        .filter((id): id is string => typeof id === 'string' && validEvidenceIds.has(id));
      const deterministic = grade.criteria.find(item => item.criterionId === criterion.id);
      return {
        criterionId: criterion.id,
        comment: candidate && typeof candidate.comment === 'string' && candidate.comment.trim()
          ? candidate.comment.trim()
          : `程序评分 ${deterministic?.score ?? 0}/${criterion.maxScore}，请优先补齐该项缺失证据。`,
        evidencePointIds: [...new Set(evidenceIds)],
      };
    }),
    disclaimer: FEEDBACK_DISCLAIMER,
  };
}

function validateParentAttempt(parentAttemptId: string, exercise: LearningOpenExercise) {
  const parent = getOpenPracticeAttempt(parentAttemptId);
  if (!parent) throw new Error('上一版练习记录不存在');
  if (parent.conversationId !== exercise.conversationId || parent.exerciseTemplateId !== exercise.templateId) {
    throw new Error('上一版练习与当前题目不匹配');
  }
}

function normalizeAnswer(value: string) {
  const answer = value.trim();
  if (!answer) throw new Error('请先填写解盘答案');
  if (answer.length > 8_000) throw new Error('答案不能超过 8000 个字符');
  return answer;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 反馈不是合法 JSON');
  try {
    const value = JSON.parse(trimmed.slice(start, end + 1));
    if (!isObject(value)) throw new Error('AI 反馈结构错误');
    return value;
  } catch (error) {
    if (error instanceof Error && error.message === 'AI 反馈结构错误') throw error;
    throw new Error('AI 反馈 JSON 解析失败');
  }
}

function normalizeStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map(item => item.trim())
    .slice(0, limit);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isOpenExerciseTemplateId(value: unknown): value is LearningOpenExerciseTemplateId {
  return typeof value === 'string' && listOpenPracticeTemplates().some(item => item.id === value);
}
