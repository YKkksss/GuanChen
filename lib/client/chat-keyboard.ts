export interface ChatKeyboardEventLike {
  key: string;
  shiftKey: boolean;
  nativeEvent?: {
    isComposing?: boolean;
    keyCode?: number;
  };
}

/** 仅在非输入法组合态下，将 Enter 解释为发送。 */
export function shouldSendChatMessage(event: ChatKeyboardEventLike): boolean {
  return event.key === 'Enter'
    && !event.shiftKey
    && event.nativeEvent?.isComposing !== true
    && event.nativeEvent?.keyCode !== 229;
}
