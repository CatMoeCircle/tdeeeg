import { reactive } from 'vue';
import type { background, emojiChatTheme } from 'tdlib-types';
import { onTdlibUpdate } from './tdlibBus';

/**
 * TDLib 侧的背景数据缓存（走 `tdlib-other` 通道）。
 *
 * - `updateDefaultBackground`：默认背景（明/暗各一份）。TDLib 没有
 *   `getDefaultBackground` 请求，授权完成后由该 update 推送。
 * - `updateEmojiChatThemes`：emoji 聊天主题列表。`backgroundTypeChatTheme`
 *   只带主题名，必须按名查表才知道真正的背景长什么样。
 */
export const chatBackgroundState = reactive({
  defaultLight: null as background | null,
  defaultDark: null as background | null,
  emojiThemes: new Map<string, emojiChatTheme>(),
});

let initialized = false;

export function initChatBackgroundStore(): void {
  if (initialized) return;
  initialized = true;

  onTdlibUpdate('other', (update) => {
    if (update._ === 'updateDefaultBackground') {
      const payload = update as unknown as { for_dark_theme?: boolean; background?: background };
      const value = payload.background ?? null;
      if (payload.for_dark_theme) chatBackgroundState.defaultDark = value;
      else chatBackgroundState.defaultLight = value;
      return;
    }

    if (update._ === 'updateEmojiChatThemes') {
      const payload = update as unknown as { chat_themes?: emojiChatTheme[] };
      const next = new Map<string, emojiChatTheme>();
      for (const theme of payload.chat_themes ?? []) next.set(theme.name, theme);
      chatBackgroundState.emojiThemes = next;
    }
  });
}

/** 当前明暗下的 TDLib 默认背景；未收到 update 时为 null */
export function defaultBackgroundFor(dark: boolean): background | null {
  return dark ? chatBackgroundState.defaultDark : chatBackgroundState.defaultLight;
}

export function emojiChatThemes(): ReadonlyMap<string, emojiChatTheme> {
  return chatBackgroundState.emojiThemes;
}
