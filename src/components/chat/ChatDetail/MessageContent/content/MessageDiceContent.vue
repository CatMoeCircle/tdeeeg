<template>
    <div ref="rootEl" class="relative flex items-center justify-center gap-3 cursor-pointer" :style="boxStyle"
        @click.stop="showHint">
        <template v-if="hasAnimation">
            <!-- 老虎机：底图（静态第 1 帧）→ 合并后的三卷轴 → 拉杆，自下而上叠放 -->
            <template v-if="isSlot">
                <div v-if="slotBgSrc" class="absolute inset-0">
                    <TgsPlayer :src="slotBgSrc" :loop="false" :autoplay="false" :initial-frame="1" :size="size" />
                </div>
                <div class="absolute inset-0">
                    <TgsPlayer ref="playerRef" :data="slotReelsData" :loop="loop" :autoplay="autoplay" :size="size"
                        @load="onAnimLoad" @complete="onAnimComplete" @error="onAnimError" />
                </div>
                <div v-if="slotLeverSrc" class="absolute inset-0">
                    <TgsPlayer :src="slotLeverSrc" :loop="false" :size="size" />
                </div>
            </template>
            <!-- 骰子动画：掷出中循环 initial，结果就绪后播一次 final -->
            <TgsPlayer v-else ref="playerRef" :src="tgsSrc" :loop="loop" :autoplay="autoplay" :size="size"
                @load="onAnimLoad" @complete="onAnimComplete" @error="onAnimError" />
        </template>
        <!-- 贴纸未就绪：emoji + 点数兜底 -->
        <template v-else>
            <span :style="{ fontSize: '36px', lineHeight: '1' }">{{ content.emoji }}</span>
            <span class="text-4xl">{{ content.value }}</span>
        </template>
    </div>
    <!-- 点击提示：挂到 body，固定在窗口正中央，文字与"发送"同一行，一段时间后自动消失 -->
    <Teleport to="body">
        <div v-if="hintOpen"
            class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] pointer-events-auto">
            <div class="flex items-center gap-2 whitespace-nowrap rounded-xl bg-gray-900 text-white shadow-lg px-3 py-2">
                <span class="text-sm">{{ t('lng_about_random', { emoji: content.emoji }) }}</span>
                <button type="button" class="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors"
                    @click="sendDice">
                    {{ t('lng_about_random_send') }}
                </button>
            </div>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
/**
 * 骰子消息：渲染服务端下发的 initial/final 状态动画。
 *   initial，就绪后换源播放结果，观感一致（骰子贴纸通常早已在本地）。
 *   结果动画只演一次：演过的骰子重挂载时直接停在末帧。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { messageDice, sticker } from 'tdlib-types';
import { ensureLocalFilePath, tdlibSend } from '../../../../../utils/tdlib';
import { useDownloadStore, remoteIdOf } from '../../../../../store/downloads';
import { settings } from '../../../../../store/settings';
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import { convertFileSrc } from '@tauri-apps/api/core';
import TgsPlayer, { type TgsPlayerInstance } from '../../../../common/TgsPlayer.vue';

const props = defineProps<{
    content: messageDice;
    chatId?: number;
    messageId?: number;
}>();

/** 骰子状态（regular / slotMachine） */
type DiceState = NonNullable<messageDice['initial_state']>;

/** 解析后的 Lottie 文档（只关心合并要用到的字段） */
interface LottieNode {
    id?: unknown;
    refId?: unknown;
    [key: string]: unknown;
}
interface LottieDoc {
    nm?: string;
    assets?: LottieNode[];
    layers?: LottieNode[];
    [key: string]: unknown;
}

const { t } = useI18n();
const rootEl = ref<HTMLElement | null>(null);
/** 点击骰子后显示的提示气泡 */
const hintOpen = ref(false);
/** 提示自动消失的时长（毫秒） */
const HINT_DURATION = 2500;
let hintTimer: ReturnType<typeof setTimeout> | null = null;

/** 显示提示：固定居中，一段时间后自动消失；重复点击会重新计时 */
function showHint() {
    hintOpen.value = true;
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
        hintOpen.value = false;
        hintTimer = null;
    }, HINT_DURATION);
}

function hideHint() {
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = null;
    hintOpen.value = false;
}

onBeforeUnmount(hideHint);

/** 发送同款骰子：inputMessageDice(emoji)，与 ChatDetail 的发送流程一致走 tdlibSend */
async function sendDice() {
    hideHint();
    if (props.chatId == null) return;
    try {
        await tdlibSend({
            _: 'sendMessage',
            chat_id: props.chatId,
            input_message_content: { _: 'inputMessageDice', emoji: props.content.emoji, clear_draft: false },
        });
    } catch (e) {
        console.error('Failed to send dice:', e);
    }
}

const playerRef = ref<TgsPlayerInstance | null>(null);
/** TGS 本地文件 URL（convertFileSrc → tlottie fetch），普通骰子用 */
const tgsSrc = ref<string | null>(null);
/** 老虎机：底图 / 拉杆 本地 URL */
const slotBgSrc = ref<string | null>(null);
const slotLeverSrc = ref<string | null>(null);
/** 老虎机：合并后的三卷轴 Lottie JSON 文本 */
const slotReelsData = ref<string | null>(null);
/** 当前老虎机已加载的文件组合，相同则不换源（避免重新播放） */
let slotKey: string | null = null;
/** 当前 src 是否为「结果」动画：决定循环还是只播一次 */
const showingResult = ref(false);
/** 加载代次：内容变化时自增，丢弃过期下载结果 */
let loadSeq = 0;

/** 已演过结果动画的骰子（跨组件重挂载），key = chatId:messageId */
const playedResults = new Set<string>();
const playedKey = computed(() => (props.messageId != null ? `${props.chatId ?? 0}:${props.messageId}` : null));

const size = computed(() => settings.sticker.size);

const isSlot = computed(() => props.content.initial_state?._ === 'diceStickersSlotMachine');

/** 掷出动：服务器还没给出结果（value = 0）时循环播放 */
const rollingState = computed<DiceState | null>(() => props.content.initial_state ?? null);

/** 落定动画：value > 0 且服务端已下发 final_state */
const resultState = computed<DiceState | null>(() => {
    if (props.content.value <= 0) return null;
    return props.content.final_state ?? null;
});

const hasAnimation = computed(() => (isSlot.value ? !!slotReelsData.value : !!tgsSrc.value));

/** 固定占贴纸大小：动画与兜底占位同尺寸，气泡外的时间胶囊不会压到兜底文字 */
const boxStyle = computed(() => ({ width: `${size.value}px`, height: `${size.value}px` }));

const loop = computed(() => !showingResult.value);
/** 演过的结果不再自动播放，由 onAnimLoad 直接停在末帧 */
const autoplay = computed(() => !showingResult.value || !isResultPlayed());

function isResultPlayed(): boolean {
    return !!playedKey.value && playedResults.has(playedKey.value);
}

/** 登记下载项（与 MessageStickerContent 一致：贴纸类文件进下载列表） */
async function registerDownload(s: sticker) {
    const file = s.sticker;
    const setLabel = s.set_id ? `贴纸集 #${s.set_id}` : undefined;
    await useDownloadStore().registerDownload(
        file.id, `sticker_${file.id}.tgs`, setLabel || '', 0, 'sticker',
        undefined, undefined, undefined, true, false, 'sticker', false,
        undefined, setLabel, remoteIdOf(file),
    );
}

/** 取贴纸本地路径，必要时下载 */
function localPathOf(s: sticker): Promise<string | null> {
    return ensureLocalFilePath(s.sticker, {
        priority: DL_PRIORITY.DEFAULT,
        beforeDownload: () => registerDownload(s),
    });
}

/** 读取 TGS（gzip 压缩的 Lottie JSON）并解析；非 gzip 时按原文解析 */
async function readTgs(path: string): Promise<LottieDoc> {
    const res = await fetch(convertFileSrc(path));
    let bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return JSON.parse(new TextDecoder().decode(bytes)) as LottieDoc;
}

/**
 * 把中、右卷轴并入左卷轴的文档（对应 MergeReels）：
 * 资源 id 与 refId 加上卷轴名前缀，避免三份文档的资源互相冲突。
 */
function mergeReels(left: LottieDoc, center: LottieDoc, right: LottieDoc): LottieDoc {
    const assets = (left.assets ??= []);
    const layers = (left.layers ??= []);

    for (const part of [center, right]) {
        const name = String(part.nm ?? '');

        for (const asset of part.assets ?? []) {
            if (asset.id !== undefined) {
                asset.id = `${name}_${String(asset.id)}`;
            }
            assets.push(asset);
        }

        for (const layer of part.layers ?? []) {
            if (typeof layer.refId === 'string') {
                layer.refId = `${name}_${layer.refId}`;
            }
            layers.push(layer);
        }
    }

    return left;
}

interface SlotPaths {
    background: string;
    lever: string;
    reels: [string, string, string];
}

async function applySlot(paths: SlotPaths, isResult: boolean, seq: number): Promise<boolean> {
    const key = [paths.background, paths.lever, ...paths.reels].join('|');
    const [left, center, right] = await Promise.all(paths.reels.map(readTgs));
    if (seq !== loadSeq) return true;

    const reelsJson = JSON.stringify(mergeReels(left, center, right));
    if (seq !== loadSeq) return true;

    showingResult.value = isResult;
    // 底图与拉杆在 roll 与结果之间通常是同一文件：URL 不变则不换源，拉杆不会重播
    slotBgSrc.value = convertFileSrc(paths.background);
    slotLeverSrc.value = convertFileSrc(paths.lever);
    if (key !== slotKey) {
        slotKey = key;
        slotReelsData.value = reelsJson;
    }
    return true;
}

function applySource(path: string, isResult: boolean, seq: number) {
    if (seq !== loadSeq) return;
    const src = convertFileSrc(path);
    // 同一状态重复加载：不换源，否则播放器重建会把动画从头再演一遍
    if (src === tgsSrc.value) return;
    showingResult.value = isResult;
    tgsSrc.value = src;
}

/** 加载一个状态；文件未全部就绪时返回 false */
async function loadState(state: DiceState, isResult: boolean, seq: number): Promise<boolean> {
    if (state._ === 'diceStickersRegular') {
        const path = await localPathOf(state.sticker);
        if (path) applySource(path, isResult, seq);
        return !!path;
    }

    if (state._ === 'diceStickersSlotMachine') {
        // 五个文件缺一不可：少一卷轴就画不出完整的一帧
        const [background, lever, left, center, right] = await Promise.all([
            localPathOf(state.background),
            localPathOf(state.lever),
            localPathOf(state.left_reel),
            localPathOf(state.center_reel),
            localPathOf(state.right_reel),
        ]);
        if (!background || !lever || !left || !center || !right) return false;

        try {
            return await applySlot({ background, lever, reels: [left, center, right] }, isResult, seq);
        } catch (e) {
            console.error('[MessageDiceContent] slot machine merge failed', e);
            return false;
        }
    }

    return false;
}

async function loadDice() {
    const seq = ++loadSeq;
    // 结果优先；结果贴纸还没落地时继续用掷出动循环占位
    const result = resultState.value;
    if (result && await loadState(result, true, seq)) return;
    const rolling = rollingState.value;
    if (rolling) await loadState(rolling, false, seq);
}

function onAnimLoad() {
    // 已演过的结果：不重播，直接落到末帧（IsContentUnread=false 的语义）
    if (showingResult.value && isResultPlayed()) {
        const total = (playerRef.value?.getProperties() as { frames?: { total?: number } } | null)?.frames?.total;
        if (typeof total === 'number' && total > 0) {
            playerRef.value?.pause();
            playerRef.value?.seek(total - 1);
        }
    }
}

function onAnimComplete() {
    if (!showingResult.value) return;
    const key = playedKey.value;
    if (!key) return;
    if (playedResults.size > 500) playedResults.clear();
    playedResults.add(key);
}

function onAnimError(e: unknown) {
    console.error('[MessageDiceContent] TGS error', e, tgsSrc.value, slotReelsData.value ? 'slot' : '');
}

watch(() => props.content, () => {
    // 内容变化（如掷出中 → 落定）：作废旧加载与旧动画
    tgsSrc.value = null;
    slotBgSrc.value = null;
    slotLeverSrc.value = null;
    slotReelsData.value = null;
    slotKey = null;
    showingResult.value = false;
    void loadDice();
}, { immediate: true });
</script>
