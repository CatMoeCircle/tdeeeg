import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { ChatTheme, background, chat } from 'tdlib-types';
import { settings } from '../store/settings';
import { defaultBackgroundFor, emojiChatThemes } from '../store/chatBackground';
import { isDark } from '../store/theme';
import { onTdlibUpdate } from '../store/tdlibBus';
import { safeDownloadFile } from '../utils/tdlib';
import { DL_PRIORITY } from '../utils/downloadPriority';
import {
  backgroundDocumentFile,
  localWallpaperRender,
  resolveChatBackground,
  type ChatBackgroundRender,
} from '../utils/chatBackground';

/**
 * 对话背景渲染。
 *
 * 取背景的优先级（对齐 Unigram ChatBackgroundControl）：
 *   1. 对话专属背景 `chat.background`
 *   2. 纯本地壁纸 `settings.chatWallpaper`（source=local，云端没有记录，必须本地覆盖）
 *   3. TDLib 默认背景 `updateDefaultBackground`（明/暗各一份）
 *   4. 本地缓存 `settings.chatWallpaper`（图案 / 渐变背景对象 → 纯色 / 图片兜底）
 *
 * `backgroundTypeChatTheme` 只带主题名，真正背景在 emoji 主题缓存里，
 * 缓存到达后会再次解析，因此这里用响应式 watcher 而不是一次性求值。
 */
export function useChatWallpaper(chat: Ref<chat | undefined>) {
  const chatBackground = computed(() => chat.value?.background ?? null);
  /** 对话专属背景 */
  const specific = computed(() => chatBackground.value?.background ?? null);

  const own = useResolvedBackground(specific, {
    theme: computed(() => chat.value?.theme ?? null),
    /** 深色主题压暗只来自对话背景（TDLib 文档：仅影响 wallpaper / fill） */
    dimming: computed(() =>
      isDark.value ? chatBackground.value?.dark_theme_dimming ?? 0 : 0
    ),
    localFallback: computed(() => null),
  });

  const fallback = useDefaultBackground();

  const render = computed(() => own.render.value ?? fallback.render.value);

  /** 需要本页自己铺壁纸：有专属背景，或全屏显示关闭时的默认背景 */
  const drawsOwnWallpaper = computed(
    () => !!own.render.value || (!settings.chatWallpaperFullScreen && !!fallback.render.value)
  );

  /** 不自己铺时留空，透出 HomeView 底层默认背景 */
  const rootStyle = computed<Record<string, string> | undefined>(() =>
    drawsOwnWallpaper.value && render.value
      ? { backgroundColor: render.value.baseColor }
      : undefined
  );

  /**
   * 遮罩与图片模糊只对「全屏显示」的壁纸生效。
   * 关闭全屏后壁纸只铺聊天区，属于本页自己铺的那一层，保持原图不受这两项影响
   * （模糊本身只作用于图片壁纸，见 ChatBackgroundLayers）。
   */
  const fullScreen = computed(() => settings.chatWallpaperFullScreen);

  return {
    drawsOwnWallpaper,
    render,
    rootStyle,
    overlayOpacity: computed(() => (fullScreen.value ? settings.chatWallpaperOverlayOpacity : 0)),
    blurPx: computed(() => (fullScreen.value ? settings.chatWallpaperBlur : 0)),
  };
}

/**
 * 默认背景（不含对话专属背景）。
 * 纯本地壁纸优先于 TDLib 默认背景——它从来没被上传，云端那份是别的来源。
 */
function useDefaultBackground() {
  const localOnly = computed(() =>
    settings.chatWallpaper?.source === 'local'
      ? localWallpaperRender(settings.chatWallpaper)
      : null
  );

  const cloud = useResolvedBackground(
    /**
     * 云端默认背景优先；没到（TDLib 没推 / 只推了另一主题那一份）就回落本地缓存里
     * 同一份 TDLib 背景对象——`color` 那个平均色画不出渐变和图案，正是
     * 「设置页预览正常、实际聊天只剩纯色」的根因。
     */
    computed(() => defaultBackgroundFor(isDark.value) ?? settings.chatWallpaper?.background ?? null),
    {
      /** 本地壁纸盖住云端时，不必再为云端背景下载图案 / 原图 */
      downloadFiles: computed(() => !localOnly.value),
      localFallback: computed(() => localWallpaperRender(settings.chatWallpaper)),
    }
  );

  return { render: computed(() => localOnly.value ?? cloud.render.value) };
}

/** HomeView 用的默认背景（全屏铺满整块内容区时） */
export function useDefaultChatBackground() {
  const { render } = useDefaultBackground();

  return {
    render,
    show: computed(() => settings.chatWallpaperFullScreen && !!render.value),
    overlayOpacity: computed(() => settings.chatWallpaperOverlayOpacity),
    blurPx: computed(() => settings.chatWallpaperBlur),
  };
}

interface ResolvedBackgroundOptions {
  theme?: ComputedRef<ChatTheme | null | undefined>;
  /** 深色主题压暗百分比 */
  dimming?: ComputedRef<number>;
  /** 是否为该背景下载原图（图案 / 壁纸）；默认 true */
  downloadFiles?: ComputedRef<boolean>;
  /** 解析不出来时用什么 */
  localFallback?: ComputedRef<ChatBackgroundRender | null>;
}

function useResolvedBackground(
  source: ComputedRef<background | null | undefined>,
  options: ResolvedBackgroundOptions = {},
) {
  const render = ref<ChatBackgroundRender | null>(null) as Ref<ChatBackgroundRender | null>;
  /** 正在等的背景原图文件 id（图案 / 壁纸下载完要重算） */
  const pendingFileId = ref<number | null>(null);
  let token = 0;

  async function refresh() {
    const current = ++token;
    const background = source.value;
    const fallback = options.localFallback?.value ?? null;

    if (!background) {
      render.value = fallback;
      return;
    }

    const resolved = await resolveChatBackground(background, {
      dark: isDark.value,
      emojiThemes: emojiChatThemes(),
      theme: options.theme?.value ?? null,
      files: 'full',
    });
    if (current !== token) return;

    const dimming = options.dimming?.value ?? 0;
    render.value = resolved ? { ...resolved, dimming } : fallback;

    if (options.downloadFiles?.value === false) pendingFileId.value = null;
    else requestDocument(background);
  }

  /** 图案 / 壁纸原图常未下载：发起后台下载，完成事件到达后重算 */
  function requestDocument(background: background) {
    const document = backgroundDocumentFile(background);
    if (!document?.id || document.local?.is_downloading_completed) {
      pendingFileId.value = null;
      return;
    }
    pendingFileId.value = document.id;
    if (!document.local?.is_downloading_active && document.local?.can_be_downloaded) {
      void safeDownloadFile(document.id, false, DL_PRIORITY.DEFAULT);
    }
  }

  const off = onTdlibUpdate('file', (update) => {
    if (update._ !== 'updateFile' || pendingFileId.value == null) return;
    const file = (update as { file?: { id?: number; local?: { is_downloading_completed?: boolean } } })
      .file;
    if (file?.id !== pendingFileId.value) return;
    if (file.local?.is_downloading_completed) void refresh();
  });
  onScopeDispose(off);

  watch(
    [source, isDark, () => options.theme?.value, () => options.dimming?.value, () => options.downloadFiles?.value, () => options.localFallback?.value],
    () => void refresh(),
    { immediate: true, deep: false }
  );

  return { render };
}
