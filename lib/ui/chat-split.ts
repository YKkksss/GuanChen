export const CHAT_SPLIT_DEFAULT = 45;
export const CHAT_SPLIT_STORAGE_KEY = 'ziwei-chart-chat-width';
export const CHAT_SPLIT_GAP = 16;
export const CHART_MIN_WIDTH = 520;
export const CHAT_MIN_WIDTH = 420;

export function readChatSplitPreference(value: string | null) {
  const ratio = value === null ? NaN : Number(value);
  return Number.isFinite(ratio) && ratio >= 20 && ratio <= 80 ? ratio : CHAT_SPLIT_DEFAULT;
}

/** 比例作用于两栏净宽；窄工作区由样式切换单栏，不挤压十二宫或聊天正文。 */
export function measureChatSplit(width: number, ratio: number) {
  const available = Math.max(0, width - CHAT_SPLIT_GAP);
  const canSplit = available >= CHART_MIN_WIDTH + CHAT_MIN_WIDTH;
  const chatWidth = canSplit ? Math.min(available - CHART_MIN_WIDTH, Math.max(CHAT_MIN_WIDTH, available * ratio / 100)) : available;
  return { canSplit, chatWidth, ratio: available ? chatWidth / available * 100 : CHAT_SPLIT_DEFAULT,
    min: canSplit ? CHAT_MIN_WIDTH / available * 100 : 0,
    max: canSplit ? (available - CHART_MIN_WIDTH) / available * 100 : 100 };
}
