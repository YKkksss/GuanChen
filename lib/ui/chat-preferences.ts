export interface ChatPreferences {
  fontSize: number;
  separateAiSize: boolean;
  aiFontSize: number;
  font: 'serif' | 'sans';
  lineHeight: 1.6 | 1.75 | 1.85;
  messageGap: 10 | 14 | 20;
  contentWidth: 'fill' | 'comfortable';
  autoGrow: boolean;
  maxRows: 4 | 6 | 8;
  sendKey: 'enter' | 'modified';
  autoFollow: boolean;
  showTopics: boolean;
  collapseCandidates: boolean;
  reduceMotion: boolean;
}

export const CHAT_PREFERENCES_KEY = 'ziwei-chart-chat-preferences';
export const DEFAULT_CHAT_PREFERENCES: Readonly<ChatPreferences> = Object.freeze({
  fontSize: 16, separateAiSize: false, aiFontSize: 16, font: 'serif',
  lineHeight: 1.75, messageGap: 14, contentWidth: 'fill', autoGrow: true,
  maxRows: 6, sendKey: 'enter', autoFollow: true, showTopics: true,
  collapseCandidates: true, reduceMotion: false,
});

/** 只接受已知字段和有限取值，损坏或过期的浏览器偏好回退到默认值。 */
export function normalizeChatPreferences(value: unknown): ChatPreferences {
  const result = { ...DEFAULT_CHAT_PREFERENCES };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
  const input = value as Record<string, unknown>;
  for (const key of ['fontSize', 'aiFontSize'] as const) {
    const size = input[key];
    if (typeof size === 'number' && Number.isInteger(size) && size >= 14 && size <= (key === 'fontSize' ? 22 : 24)) result[key] = size;
  }
  for (const key of ['separateAiSize', 'autoGrow', 'autoFollow', 'showTopics', 'collapseCandidates', 'reduceMotion'] as const) {
    if (typeof input[key] === 'boolean') result[key] = input[key];
  }
  if (input.font === 'serif' || input.font === 'sans') result.font = input.font;
  if (input.lineHeight === 1.6 || input.lineHeight === 1.75 || input.lineHeight === 1.85) result.lineHeight = input.lineHeight;
  if (input.messageGap === 10 || input.messageGap === 14 || input.messageGap === 20) result.messageGap = input.messageGap;
  if (input.contentWidth === 'fill' || input.contentWidth === 'comfortable') result.contentWidth = input.contentWidth;
  if (input.maxRows === 4 || input.maxRows === 6 || input.maxRows === 8) result.maxRows = input.maxRows;
  if (input.sendKey === 'enter' || input.sendKey === 'modified') result.sendKey = input.sendKey;
  return result;
}

export function readChatPreferences(raw: string | null): ChatPreferences {
  try {
    const parsed: unknown = JSON.parse(raw ?? 'null');
    if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 1 || !('preferences' in parsed)) return { ...DEFAULT_CHAT_PREFERENCES };
    return normalizeChatPreferences(parsed.preferences);
  } catch { return { ...DEFAULT_CHAT_PREFERENCES }; }
}

export function serializeChatPreferences(preferences: ChatPreferences) {
  return JSON.stringify({ version: 1, preferences: normalizeChatPreferences(preferences) });
}

export function getChatFontFamily(font: ChatPreferences['font']) {
  return font === 'serif' ? "'Noto Serif SC', 'Songti SC', 'STSong', serif" : "'Microsoft YaHei', 'PingFang SC', sans-serif";
}

/** 输入区最多使用聊天面板的三成高度，至少容纳一行和可点击按钮。 */
export function getChatInputHeight({ contentHeight, lineHeight, verticalPadding, panelHeight, autoGrow, maxRows }: {
  contentHeight: number; lineHeight: number; verticalPadding: number; panelHeight: number;
  autoGrow: boolean; maxRows: number;
}) {
  const minimum = Math.max(44, lineHeight + verticalPadding);
  const maximum = Math.max(minimum, Math.min(lineHeight * maxRows + verticalPadding, panelHeight * 0.3));
  return Math.ceil(autoGrow ? Math.max(minimum, Math.min(contentHeight, maximum)) : minimum);
}
