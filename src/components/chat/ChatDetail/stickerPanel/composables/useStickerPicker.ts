import { computed, ref, watch } from 'vue';
import type { sticker, stickerSet, stickerSetInfo } from 'tdlib-types';
import { tdlibSend } from '../../../../../utils/tdlib';

/** 一个展示分组：已加载 stickers + 元信息 */
export interface StickerGroup {
    key: string;
    title: string;
    /** 是否仍未加载完整（懒加载占位） */
    lazy: boolean;
    /** 已知数量 */
    size: number;
    /** 已加载 stickers */
    stickers: sticker[];
    /** set id（用于懒加载） */
    setId: string;
    isFavorites?: boolean;
}

/**
 * 贴纸面板的 ViewModel。
 *
 * 数据来源（全走 TDLib）：
 *  - 收藏：getFavoriteStickers
 *  - 最近：getRecentStickers(false)
 *  - 已安装表情包：getInstalledStickerSets(Regular)，分组头滚动到可视区才 getStickerSet 拉完整
 *  - 群组贴纸包：supergroupFullInfo.stickerSetId（当前会话专属）
 *  - 搜索三阶段：searchInstalledStickerSets → getStickers(emoji) → searchStickerSets
 *
 * 「通知后重拉全量 + 合并」：收到 updateRecentStickers / updateFavoriteStickers /
 * updateInstalledStickerSets 后重新拉取再 Merge，保持顺序与服务器一致。
 */
export function useStickerPicker(opts: {
    /** 当前会话的群组贴纸包 set id（0 表示无）；from supergroupFullInfo */
    groupSetId: () => string;
    /** 更新订阅钩子 */
    onStickerUpdates?: (cb: () => void) => () => void;
}) {
    const active = ref(false);
    const loading = ref(false);
    const query = ref('');
    const searching = ref(false);

    /** 顶部固定分组（收藏 / 最近） */
    const favorites = ref<sticker[]>([]);
    const recent = ref<sticker[]>([]);
    /** 已安装 set 的懒加载分组 */
    const sets = ref<StickerGroup[]>([]);
    /** 群组贴纸包分组（仅当前会话展示） */
    const groupGroup = ref<StickerGroup | null>(null);
    /** 搜索分组 */
    const searchGroups = ref<StickerGroup[]>([]);

    const hasQuery = computed(() => query.value.trim().length > 0);

    /** id 集合（右键收藏/最近判断） */
    const favoriteIds = ref<Set<string>>(new Set());
    const recentIds = ref<Set<string>>(new Set());

    async function loadFavorite() {
        try {
            const res: any = await tdlibSend({ _: 'getFavoriteStickers' });
            favorites.value = res.stickers ?? [];
            favoriteIds.value = new Set(favorites.value.map((s) => String(s.id)));
        } catch { favorites.value = []; }
    }
    async function loadRecent() {
        try {
            const res: any = await tdlibSend({ _: 'getRecentStickers', is_attached: false });
            const list: sticker[] = res.stickers ?? [];
            // 最近里剔除已收藏的
            recent.value = list.filter((s) => !favoriteIds.value.has(String(s.id)));
            recentIds.value = new Set(list.map((s) => String(s.id)));
        } catch { recent.value = []; }
    }
    async function loadInstalled() {
        try {
            const res: any = await tdlibSend({
                _: 'getInstalledStickerSets',
                sticker_type: { _: 'stickerTypeRegular' },
            });
            const infos: stickerSetInfo[] = res.sets ?? [];
            sets.value = infos.map((info) => ({
                key: `set_${info.id}`,
                title: info.title,
                lazy: true,
                size: info.size,
                stickers: info.covers ?? [],
                setId: info.id,
            }));
        } catch { sets.value = []; }
    }
    async function loadGroupSet() {
        const id = opts.groupSetId();
        if (!id || id === '0') { groupGroup.value = null; return; }
        try {
            const res = await tdlibSend({ _: 'getStickerSet', set_id: id as any } as any);
            const s = res as unknown as stickerSet;
            groupGroup.value = {
                key: 'group',
                title: s.title,
                lazy: false,
                size: s.stickers.length,
                stickers: s.stickers,
                setId: String(s.id),
            };
        } catch { groupGroup.value = null; }
    }

    async function activate() {
        active.value = true;
        loading.value = true;
        try {
            await Promise.all([loadFavorite(), loadRecent(), loadInstalled(), loadGroupSet()]);
            // 首包全量：加载第一个已安装 set，保证一打开就有内容
            if (sets.value.length > 0) {
                await loadSetStickers(sets.value[0].setId);
            }
        } finally {
            loading.value = false;
        }
    }

    function deactivate() {
        active.value = false;
        query.value = '';
        searchGroups.value = [];
        favorites.value = [];
        recent.value = [];
        sets.value = [];
        groupGroup.value = null;
    }

    /** 懒加载指定 set 的完整 stickers */
    async function loadSetStickers(setId: string) {
        const group = sets.value.find((g) => g.setId === setId);
        if (!group || !group.lazy) return [];
        const res: any = await tdlibSend({ _: 'getStickerSet', set_id: setId as any } as any)
            .catch(() => null);
        if (!res) return [];
        const list: sticker[] = res.stickers ?? [];
        group.stickers = list;
        group.lazy = false;
        group.size = list.length;
        return list;
    }

    function allGroups(): StickerGroup[] {
        const groups: StickerGroup[] = [];
        // 收藏/最近置顶，便于快速访问（与 emoji 面板一致）
        if (favorites.value.length) {
            groups.push({ key: 'favorites', title: '收藏', lazy: false, size: favorites.value.length, stickers: favorites.value, setId: '', isFavorites: true });
        }
        if (recent.value.length) {
            groups.push({ key: 'recent', title: '最近', lazy: false, size: recent.value.length, stickers: recent.value, setId: '' });
        }
        // 当前会话的群组贴纸包
        if (groupGroup.value) groups.push(groupGroup.value);
        // 推荐/已安装贴纸集，首包已全量加载第一个 set
        groups.push(...sets.value);
        return groups;
    }

    /** 三阶段搜索 */
    async function runSearch(q: string) {
        searching.value = true;
        const groups: StickerGroup[] = [];
        // 阶段1：搜已安装
        try {
            const res: any = await tdlibSend({ _: 'searchInstalledStickerSets', sticker_type: { _: 'stickerTypeRegular' }, query: q, limit: 20 });
            for (const info of (res.sets ?? []) as stickerSetInfo[]) {
                groups.push({ key: `search_inst_${info.id}`, title: info.title, lazy: true, size: info.size, stickers: info.covers ?? [], setId: info.id });
            }
        } catch { /* */ }

        // 阶段2：单个 emoji 时用 getStickers 找对应贴纸
        if ([...q].length <= 2) {
            try {
                const res: any = await tdlibSend({ _: 'getStickers', sticker_type: { _: 'stickerTypeRegular' }, query: q, limit: 30, chat_id: 0 });
                const list: sticker[] = res.stickers ?? [];
                if (list.length) {
                    groups.push({ key: 'search_emoji', title: `「${q}」的贴纸`, lazy: false, size: list.length, stickers: list, setId: '' });
                }
            } catch { /* */ }
        }

        // 阶段3：远端表情包
        try {
            const res: any = await tdlibSend({ _: 'searchStickerSets', sticker_type: { _: 'stickerTypeRegular' }, query: q, limit: 10 });
            for (const info of (res.sets ?? []) as stickerSetInfo[]) {
                if (!groups.some((g) => g.setId === info.id)) {
                    groups.push({ key: `search_remote_${info.id}`, title: info.title, lazy: true, size: info.size, stickers: info.covers ?? [], setId: info.id });
                }
            }
        } catch { /* */ }

        searchGroups.value = groups;
        searching.value = false;
    }

    // 搜索防抖
    let timer: ReturnType<typeof setTimeout> | null = null;
    watch(query, (q) => {
        if (timer) clearTimeout(timer);
        const trimmed = q.trim();
        if (!trimmed) { searchGroups.value = []; return; }
        timer = setTimeout(() => runSearch(trimmed), 300);
    });

    /** 收藏/取消收藏 */
    async function toggleFavorite(s: sticker) {
        const id = String(s.id);
        if (favoriteIds.value.has(id)) {
            try { await tdlibSend({ _: 'removeFavoriteSticker', sticker: { _: 'inputFileId', id: Number(id) } as any } as any); } catch { }
            favoriteIds.value.delete(id);
        } else {
            try { await tdlibSend({ _: 'addFavoriteSticker', sticker: { _: 'inputFileId', id: Number(id) } as any } as any); } catch { }
            favoriteIds.value.add(id);
        }
        await loadFavorite();
        await loadRecent();
    }

    /** 移除最近 */
    async function removeRecent(s: sticker) {
        const id = String(s.id);
        try { await tdlibSend({ _: 'removeRecentSticker', is_attached: false, sticker: { _: 'inputFileId', id: Number(id) } as any } as any); } catch { }
        recent.value = recent.value.filter((x) => String(x.id) !== id);
    }

    function isFavorite(s: sticker) { return favoriteIds.value.has(String(s.id)); }
    function isRecent(s: sticker) { return recentIds.value.has(String(s.id)); }

    // 订阅更新通知后重拉全量
    opts.onStickerUpdates?.(async () => {
        await Promise.all([loadFavorite(), loadRecent()]);
    });

    return {
        active, loading, query, searching,
        favorites, recent, sets, groupGroup, searchGroups,
        hasQuery, allGroups, activate, deactivate,
        loadSetStickers, loadMore: async () => { },
        toggleFavorite, removeRecent, isFavorite, isRecent,
    };
}
