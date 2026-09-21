import { ref } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { emojiReaction, sticker } from 'tdlib-types';
import { tdlibSend, downloadingFiles, localPathIfReady } from '../utils/tdlib';
import { DL_PRIORITY } from '../utils/downloadPriority';
import { useDownloadStore, remoteIdOf } from './downloads';
import { DL_TAG } from '../utils/downloadTags';

/** 反应动画展示源 */
export type ReactionAnimSource = 'select' | 'activate';

export interface EmojiReactionAnimState {
    emoji: string;
    /** 展示用动画类型偏好 */
    source?: ReactionAnimSource;
    /** getEmojiReaction 返回的完整信息 */
    reaction?: emojiReaction;
    /** 用于展示的动画贴纸（select / activate） */
    sticker?: sticker;
    /** 非 TGS 可播放 URL */
    src?: string;
    /** TGS asset URL */
    tgsSrc?: string;
    format: 'tgs' | 'webm' | 'webp' | 'mpeg4' | 'other' | 'pending';
    ready: boolean;
    fetched: boolean;
    loading: boolean;
}

/**
 * 全局 emoji reaction 动画缓存。
 * 对齐 Unigram：选择器网格优先用 select_animation（选中态动画），
 * 不可用时回退 activate_animation；静态 Unicode emoji 仅作加载失败兜底。
 */
const cache = ref<Record<string, EmojiReactionAnimState>>({});

/** 并发/去重：同一 emoji 只请求一次 getEmojiReaction */
const inflight = new Set<string>();
const pending = new Set<string>();
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function extOf(st: sticker): string {
    if (st.format._ === 'stickerFormatTgs') return 'tgs';
    if (st.format._ === 'stickerFormatWebm') return 'webm';
    return 'webp';
}

function formatOf(st: sticker): EmojiReactionAnimState['format'] {
    if (st.format._ === 'stickerFormatTgs') return 'tgs';
    if (st.format._ === 'stickerFormatWebm') return 'webm';
    return 'webp';
}

/** Unigram ReactionsMenuFlyout：优先 SelectAnimation；展开网格用 ActivateAnimation */
function pickAnimSticker(r: emojiReaction, source: ReactionAnimSource): sticker | undefined {
    if (source === 'select') {
        return r.select_animation ?? r.activate_animation ?? r.appear_animation;
    }
    return r.activate_animation ?? r.select_animation ?? r.appear_animation;
}

async function downloadAnimSticker(emoji: string, st: sticker) {
    const f = st.sticker;
    if (!f) return;
    const state = cache.value[emoji];
    if (!state) return;

    // 本地已就绪：直接上屏，不发 downloadFile
    const readyPath = localPathIfReady(f);
    if (readyPath) {
        applyLocal(state, st, readyPath);
        return;
    }
    if (!f.local.can_be_downloaded || f.local.is_downloading_active) {
        state.loading = false;
        return;
    }
    if (downloadingFiles.has(f.id)) {
        state.loading = false;
        return;
    }

    downloadingFiles.add(f.id);
    state.loading = true;
    try {
        await useDownloadStore().registerDownload(
            f.id,
            `reaction_${emoji}_${f.id}.${extOf(st)}`,
            '回应动画', 0, 'sticker',
            undefined, undefined, undefined, true, false,
            'reaction', false,
            [DL_TAG.STICKER, DL_TAG.EMOJI, DL_TAG.ANIM],
            '回应动画',
            remoteIdOf(f as any) || undefined,
        );
    } catch { /* 注册失败不阻塞下载 */ }

    try {
        const res = await tdlibSend({
            _: 'downloadFile',
            file_id: f.id,
            priority: DL_PRIORITY.LAZY_VISIBLE,
            offset: 0,
            limit: 0,
            synchronous: true,
        }) as any;
        const path = localPathIfReady(res) ?? localPathIfReady(st.sticker);
        if (path) {
            applyLocal(state, st, path);
        }
    } catch (e) {
        console.warn('Failed to download reaction anim:', emoji, e);
    } finally {
        downloadingFiles.delete(f.id);
        state.loading = false;
    }
}

function applyLocal(state: EmojiReactionAnimState, st: sticker, path: string) {
    try {
        const url = convertFileSrc(path);
        const fmt = formatOf(st);
        state.sticker = st;
        state.format = fmt;
        if (fmt === 'tgs') {
            state.tgsSrc = url;
        } else {
            state.src = url;
        }
        state.ready = true;
    } catch {
        state.ready = false;
    }
}

async function fetchOne(emoji: string) {
    const state = cache.value[emoji];
    if (!state || inflight.has(emoji)) return;
    inflight.add(emoji);
    state.fetched = true;
    state.loading = true;
    try {
        const result = await tdlibSend({
            _: 'getEmojiReaction',
            emoji,
        });
        if (result && result._ === 'emojiReaction') {
            const reaction = result as emojiReaction;
            state.reaction = reaction;
            const st = pickAnimSticker(reaction, state.source ?? 'select');
            if (st) {
                state.sticker = st;
                state.format = formatOf(st);
                await downloadAnimSticker(emoji, st);
            } else {
                state.loading = false;
            }
        } else {
            state.loading = false;
        }
    } catch (e) {
        // 非 active reaction 等：保持 fallback 静态 emoji
        state.loading = false;
    } finally {
        inflight.delete(emoji);
    }
}

function queueFetch(emoji: string) {
    pending.add(emoji);
    if (batchTimer) return;
    batchTimer = setTimeout(() => {
        batchTimer = null;
        const list = [...pending];
        pending.clear();
        // getEmojiReaction 无批量接口，串行错峰避免打满 TDLib
        let i = 0;
        const runNext = () => {
            if (i >= list.length) return;
            const e = list[i++];
            void fetchOne(e).finally(runNext);
        };
        runNext();
    }, 40);
}

/**
 * 获取（或创建）某 emoji 的反应动画状态。
 * 返回缓存中的响应式对象，组件直接读属性。
 */
export function useEmojiReactionAnim(emoji: string, source: ReactionAnimSource = 'select'): EmojiReactionAnimState {
    const key = emoji;
    if (!cache.value[key]) {
        cache.value[key] = {
            emoji: key,
            source,
            format: 'pending',
            ready: false,
            fetched: false,
            loading: false,
        };
        queueFetch(key);
    } else if (!cache.value[key].fetched && !cache.value[key].ready) {
        queueFetch(key);
    }
    return cache.value[key];
}

/** 视口进入时显式触发（幂等） */
export function requestEmojiReactionAnim(emoji: string): void {
    const st = cache.value[emoji];
    if (!st) {
        useEmojiReactionAnim(emoji);
        return;
    }
    if (st.ready) return;
    if (!st.fetched) queueFetch(emoji);
}

/** 预热一批（打开选择器时对前 N 个可用回应预取） */
export function prefetchEmojiReactionAnims(emojis: string[]): void {
    for (const e of emojis) {
        if (!e) continue;
        if (!cache.value[e]) {
            useEmojiReactionAnim(e);
        } else if (!cache.value[e].fetched && !cache.value[e].ready) {
            queueFetch(e);
        }
    }
}
