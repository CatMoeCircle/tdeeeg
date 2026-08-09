import { ref, watch } from 'vue';
import type { animation, chat } from 'tdlib-types';
import { tdlibSend } from '../../../../../utils/tdlib';

/** animation 对象的稳定标识（其文件 id） */
function animId(a: animation): string {
  return String(a.animation.id);
}

/** GIF 搜索结果项 */
export interface GifResult {
  animation: animation;
  /** inline query result id（用于收藏等） */
  resultId: string;
  isSaved: boolean;
}

/** GIF 搜索 bot 用户名（用于 SearchPublicChat 解析） */
const GIF_BOT_USERNAME = 'gif';

/**
 * GIF 面板的 ViewModel。
 *
 * 全部数据走 GIF 搜索机器人的 inline query（SearchPublicChat → GetInlineQueryResults）：
 *  - 最近使用（已保存）GIF：getSavedAnimations
 *  - 热门 GIF：空 query 的 inline query 分页拉取
 *  - 按 emoji 分类 / 搜索：带 query 的 inline query
 *  - 右键加收藏：addSavedAnimation / removeSavedAnimation
 *
 * 实现采用「通知后重拉全量 + 合并」：收到 updateSavedAnimations 后重新拉取已保存列表。
 */
export function useGifPicker(opts: {
  chatId: () => number | undefined;
  /** 更新订阅钩子（可注入全局 EventAggregator） */
  onUpdateSavedAnimations?: (cb: () => void) => () => void;
}) {
  const query = ref('');
  const offset = ref('');
  const results = ref<GifResult[]>([]);
  const searching = ref(false);
  const hasMore = ref(false);
  /** 已保存 GIF id 集合（判右键状态） */
  const savedIds = ref<Set<string>>(new Set());

  const active = ref(false);

  async function ensureBot(): Promise<number | undefined> {
    try {
      const res: any = await tdlibSend({ _: 'searchPublicChat', username: GIF_BOT_USERNAME });
      return (res as chat).id;
    } catch {
      return undefined;
    }
  }

  /** 用空 query 调 inline query 拉取热门 GIF（分页） */
  async function searchGifs(q: string, nextOffset: string): Promise<{ results: animation[]; nextOffset: string }> {
    const botId = await ensureBot();
    if (!botId) return { results: [], nextOffset: '' };
    try {
      const res: any = await tdlibSend({
        _: 'getInlineQueryResults',
        bot_user_id: botId,
        chat_id: opts.chatId() ?? 0,
        query: q,
        offset: nextOffset,
      });
      const anims: animation[] = ((res.results ?? []) as any[])
        .filter((r: any) => r.type?._ === 'inlineQueryResultAnimation' && r.animation)
        .map((r: any) => r.animation);
      return { results: anims, nextOffset: (res as any).next_offset ?? '' };
    } catch {
      return { results: [], nextOffset: '' };
    }
  }

  /** 拉取已保存 GIF */
  async function loadSaved() {
    try {
      const res: any = await tdlibSend({ _: 'getSavedAnimations' });
      const list: animation[] = res.animations ?? [];
      savedIds.value = new Set(list.map(animId));
      return list;
    } catch {
      savedIds.value = new Set();
      return [];
    }
  }

  async function activate() {
    active.value = true;
    // 首次：已保存 + 第一页热门
    const saved = await loadSaved();
    await loadPage('', '');
    // 顶部并排已保存
    if (saved.length) {
      prependSaved(saved);
    }
  }

  function prependSaved(saved: animation[]) {
    const savedResults: GifResult[] = saved.map((a) => ({
      animation: a,
      resultId: animId(a),
      isSaved: true,
    }));
    // 去重（按 id）
    const seen = new Set(savedResults.map((r) => r.resultId));
    results.value = [
      ...savedResults,
      ...results.value.filter((r) => !seen.has(r.resultId)),
    ];
  }

  function deactivate() {
    active.value = false;
    query.value = '';
    offset.value = '';
    results.value = [];
  }

  /** 分页加载一页 */
  async function loadPage(q: string, nextOffset: string) {
    if (searching.value) return;
    searching.value = true;
    try {
      const { results: list, nextOffset: n } = await searchGifs(q, nextOffset);
      if (nextOffset === '') {
        // 首页：替换
        results.value = list.map((a) => ({ animation: a, resultId: animId(a), isSaved: savedIds.value.has(animId(a)) }));
      } else {
        // 续页：追加去重
        const seen = new Set(results.value.map((r) => r.resultId));
        const added = list
          .filter((a) => !seen.has(animId(a)))
          .map((a) => ({ animation: a, resultId: animId(a), isSaved: savedIds.value.has(animId(a)) }));
        results.value = [...results.value, ...added];
      }
      offset.value = n;
      hasMore.value = n !== '';
    } finally {
      searching.value = false;
    }
  }

  function loadMore() {
    if (hasMore.value) loadPage(query.value, offset.value);
  }

  // 搜索防抖
  let timer: ReturnType<typeof setTimeout> | null = null;
  watch(query, (q) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      results.value = [];
      offset.value = '';
      loadPage(q, '');
    }, 300);
  });

  /** 收藏 / 取消收藏 */
  async function toggleSaved(result: GifResult) {
    const id = animId(result.animation);
    if (savedIds.value.has(id)) {
      try { await tdlibSend({ _: 'removeSavedAnimation', animation_id: Number(id) } as any); } catch {}
      savedIds.value.delete(id);
    } else {
      try { await tdlibSend({ _: 'addSavedAnimation', animation_id: Number(id) } as any); } catch {}
      savedIds.value.add(id);
    }
  }

  function isSaved(result: GifResult): boolean {
    return savedIds.value.has(animId(result.animation));
  }

  // 订阅更新（通知后重拉全量）
  opts.onUpdateSavedAnimations?.(async () => {
    const saved = await loadSaved();
    prependSaved(saved);
  });

  return {
    active,
    query,
    results,
    searching,
    hasMore,
    activate,
    deactivate,
    loadMore,
    toggleSaved,
    isSaved,
  };
}
