import { tdlibSend } from "./tdlib";
import type { chatBoostFeatures, chatBoostStatus, chat } from "tdlib-types";

export interface ChatBoostInfo {
  level: number;
  boostCount: number;
  nextLevelBoostCount: number;
  features: chatBoostFeatures | null;
}

export async function loadChatBoostInfo(chat: chat | undefined | null): Promise<ChatBoostInfo> {
  const empty: ChatBoostInfo = {
    level: 0,
    boostCount: 0,
    nextLevelBoostCount: 0,
    features: null,
  };
  if (!chat || chat.type._ !== "chatTypeSupergroup") return empty;
  try {
    const isChannel = !!chat.type.is_channel;
    const [status, features] = await Promise.all([
      tdlibSend({ _: "getChatBoostStatus", chat_id: chat.id }),
      tdlibSend({ _: "getChatBoostFeatures", is_channel: isChannel }),
    ]);
    const st = status as chatBoostStatus;
    return {
      level: st.level ?? 0,
      boostCount: st.boost_count ?? 0,
      nextLevelBoostCount: st.next_level_boost_count ?? 0,
      features: features as chatBoostFeatures,
    };
  } catch {
    return empty;
  }
}

export function minAutoTranslateLevel(features: chatBoostFeatures | null): number {
  return features?.min_automatic_translation_boost_level ?? 1;
}

export function minEmojiStatusLevel(features: chatBoostFeatures | null): number {
  return features?.min_emoji_status_boost_level ?? 1;
}

export function minCustomBackgroundLevel(features: chatBoostFeatures | null): number {
  return features?.min_custom_background_boost_level ?? 1;
}
