import { computed, type ComputedRef } from "vue";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { chat } from "tdlib-types";
import { settings, type ChatWallpaperVisual } from "../store/settings";

/**
 * 对话壁纸视觉（与 ChatDetail / HomeView 一致）：
 * 专属背景优先，否则用全局 settings.chatWallpaper。
 */
export function useChatWallpaper(chat: ComputedRef<chat | undefined>) {
  const hasChatSpecificBackground = computed(() => {
    const bg = chat.value?.background?.background;
    if (!bg) return false;
    if (bg.type._ === "backgroundTypeFill") return true;
    return !!bg.document?.thumbnail?.file.local.path;
  });

  const chatBackgroundVisual = computed<ChatWallpaperVisual | null>(() => {
    const background = chat.value?.background?.background;
    if (!background) return settings.chatWallpaper;
    if (background.type._ === "backgroundTypeFill" && background.type.fill._ === "backgroundFillSolid") {
      return {
        kind: "color",
        color: `#${(background.type.fill.color & 0xffffff).toString(16).padStart(6, "0")}`,
      };
    }
    if (background.document?.thumbnail?.file.local.path) {
      return { kind: "image", path: background.document.thumbnail.file.local.path };
    }
    return settings.chatWallpaper;
  });

  const chatBackgroundStyle = computed(() => {
    const visual = chatBackgroundVisual.value;
    return { backgroundColor: visual?.color || "#f5f5f5" };
  });

  const chatWallpaperLayerStyle = computed(() => {
    const visual = chatBackgroundVisual.value;
    const style: Record<string, string> = {
      backgroundColor: visual?.color || "#f5f5f5",
      filter: `blur(${settings.chatWallpaperBlur}px)`,
      transform: settings.chatWallpaperBlur > 0 ? "scale(1.05)" : "none",
    };
    if (visual?.kind === "image" && visual.path) {
      style.backgroundImage = `url("${convertFileSrc(visual.path)}")`;
      style.backgroundSize = "cover";
      style.backgroundPosition = "center";
    }
    return style;
  });

  const chatWallpaperOverlayStyle = computed(() => ({
    opacity: settings.chatWallpaperOverlayOpacity / 100,
  }));

  /** 无专属背景时，页面透明，露出 HomeView 底层默认壁纸 */
  const rootStyle = computed(() =>
    hasChatSpecificBackground.value ? chatBackgroundStyle.value : undefined
  );

  return {
    hasChatSpecificBackground,
    chatBackgroundVisual,
    chatBackgroundStyle,
    chatWallpaperLayerStyle,
    chatWallpaperOverlayStyle,
    rootStyle,
  };
}
