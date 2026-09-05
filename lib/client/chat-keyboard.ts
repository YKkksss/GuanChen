export interface ChatKeyboardEventLike {
  key: string;
  shiftKey: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
  };
}

/** 仅在非输入法组合态下，将 Enter 解释为发送。 */
export function shouldSendChatMessage(event: ChatKeyboardEventLike, mode?: 'enter' | 'modified'): boolean {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing === true || event.nativeEvent?.keyCode === 229) return false;
  // 未配置偏好的其他聊天页继续采用原发送规则。
  if (!mode) return true;
  if (event.altKey) return false;
  return mode === 'modified' ? Boolean(event.ctrlKey || event.metaKey) : !event.ctrlKey && !event.metaKey;
}
