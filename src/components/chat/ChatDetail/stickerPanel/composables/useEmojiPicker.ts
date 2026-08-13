import { computed, ref, watch } from 'vue';
import type { sticker } from 'tdlib-types';
import { tdlibSend } from '../../../../../utils/tdlib';
import { EMOJI_PAYLOAD } from '../data/emojiPayload';
import { useLocalEmojiPrefs } from './useLocalEmojiPrefs';
import { useCustomEmojiData } from './useCustomEmojiData';

/** 搜索关键词 → 本地 emoji 匹配（用 emoji-datasource 未内嵌关键词，简化：按 native 精确/前缀匹配） */

export interface EmojiSearchResult {
  /** 普通/自定义 emoji 是否为普通本地 emoji */
  isCustom: boolean;
  /** 普通 emoji 原生串 或 自定义 emoji id */
  key: string;
  /** 展示文本（普通=emoji，自定义=用 alt 展示） */
  display: string;
}

/**
 * Emoji 面板的 ViewModel。
 *
 * 职责：
 *  - 本地 8 大分类 + 最近使用 + 收藏
 *  - 搜索（本地过滤 + TDLib searchEmojis / searchStickers(CustomEmoji)）
 *  - 自定义 emoji（动画表情）：已安装 / 热门 lazily 加载
 *  - 肤色选择状态
 *  - Activate/Deactivate 生命周期（首次数据加载、卸载时清理）
 */
export function useEmojiPicker(opts: {
  isPremium: () => boolean;
  /** 打开时的首次数据加载回调（加载自定义 emoji 分组等） */
  activate?: () => void;
}) {
  const { isPremium } = opts;
  const prefs = useLocalEmojiPrefs();

  /** 激活状态 */
  const active = ref(false);
  /** 搜索关键词 */
  const query = ref('');
  /** 搜索进行中 */
  const searching = ref(false);
  /** 搜索结果（普通 emoji + 自定义 emoji 合并） */
  const searchResults = ref<EmojiSearchResult[]>([]);

  /** 当前展开的肤色选择 popup 的 emoji（string）或 id */
  const skinToneTarget = ref<string | null>(null);

  const customData = useCustomEmojiData();
  /** 最近使用的 custom emoji ids（持久化——复用 settings 的普通 recentEmoji 不合适，单独存） */
  const recentCustomIds = ref<string[]>([]);
  /** 已解析的最近 custom emoji stickers */
  const recentCustomStickers = ref<sticker[]>([]);

  /** 本地 8 大分类（含最近/收藏前置区由渲染层决定） */
  const categories = EMOJI_PAYLOAD;

  /** 有搜索词时显示搜索结果 */
  const hasQuery = computed(() => query.value.trim().length > 0);

  async function activate() {
    active.value = true;
    opts.activate?.();
    await loadRecentCustom();
    await customData.ensureInstalledCustomEmoji();
    await customData.ensureTrendingCustomEmoji();
    // 首次加载已安装的每个 set 的完整内容（保证一打开就有内容）——首包全量
    for (const set of customData.installedSets.value.slice(0, 1)) {
      await customData.loadSet(set.id);
    }
  }

  function deactivate() {
    active.value = false;
    query.value = '';
    searchResults.value = [];
    skinToneTarget.value = null;
    recentCustomIds.value = [];
    recentCustomStickers.value = [];
  }

  // ─── 最近 custom emoji（临时存内存；如需持久化可并入 settings）───
  async function loadRecentCustom() {
    if (recentCustomIds.value.length === 0) {
      recentCustomStickers.value = [];
      return;
    }
    recentCustomStickers.value = await customData.resolveCustomEmojis(recentCustomIds.value);
  }

  function recordRecentCustom(id: string) {
    recentCustomIds.value = [id, ...recentCustomIds.value.filter((x) => x !== id)].slice(0, 32);
    loadRecentCustom();
  }

  // ─── 搜索（本地普通 emoji + TDLib 自定义 emoji）───
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  watch(query, (q) => {
    if (searchTimer) clearTimeout(searchTimer);
    const trimmed = q.trim();
    if (!trimmed) {
      searchResults.value = [];
      return;
    }
    searchTimer = setTimeout(() => runSearch(trimmed), 300);
  });

  async function runSearch(q: string) {
    searching.value = true;
    const local: EmojiSearchResult[] = [];
    // 本地：匹配分类里的 emoji（按 native 前缀）
    const lower = q.toLowerCase();
    for (const cat of categories) {
      for (const it of cat.items) {
        if (local.length >= 50) break;
        if (it.emoji.includes(lower) || lower.includes(it.emoji)) {
          local.push({ isCustom: false, key: it.emoji, display: it.emoji });
        }
      }
      if (local.length >= 50) break;
    }

    const combined = [...local];

    // TDLib searchEmojis 拿关键词对应的候选 emoji（Premium 才拿自定义)
    try {
      const emojiRes = await tdlibSend({
        _: 'searchEmojis',
        text: q,
        exact_match: false,
        input_language_codes: [navigator.language],
      } as any);
      const candidates: string[] = (emojiRes as any).emojis ?? [];
      for (const em of candidates) {
        if (!combined.some((r) => !r.isCustom && r.key === em)) {
          combined.push({ isCustom: false, key: em, display: em });
        }
      }
    } catch { /* 忽略 */ }

    // Premium：把关键词翻译成自定义 emoji 结果
    if (isPremium()) {
      try {
        const stickerRes = await tdlibSend({
          _: 'searchStickers',
          sticker_type: { _: 'stickerTypeCustomEmoji' },
          query: q,
          limit: 30,
        } as any);
        const st = ((stickerRes as any).stickers ?? []) as sticker[];
        for (const s of st) {
          combined.push({ isCustom: true, key: String(s.id), display: s.emoji || '🤖' });
        }
      } catch { /* 忽略 */ }
    }

    searchResults.value = combined.slice(0, 80);
    searching.value = false;
  }

  /** 点击某个 emoji（普通/自定义）。返回 true 表示已消费（关闭/插入） */
  function pickEmoji(item: EmojiSearchResult, onPick: (emoji: string, isCustom: boolean, id: string) => void) {
    if (item.isCustom) {
      recordRecentCustom(item.key);
      onPick(item.key, true, item.key);
    } else {
      prefs.addRecent(item.key);
      onPick(item.key, false, '');
    }
  }

  /** 选择肤色目标（弹出肤色选择） */
  function openSkinTone(target: string) {
    skinToneTarget.value = target;
  }

  return {
    active,
    categories,
    prefs,
    query,
    searching,
    searchResults,
    hasQuery,
    skinToneTarget,
    customData,
    recentCustomStickers,
    setQuery: (v: string) => { query.value = v; },
    activate,
    deactivate,
    runSearch,
    pickEmoji,
    openSkinTone,
    recordRecentCustom,
    setSkinToneTarget: (v: string | null) => { skinToneTarget.value = v; },
  };
}
