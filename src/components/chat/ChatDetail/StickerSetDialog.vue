<template>
    <ModalDialog :model-value="open" :title="title" @update:model-value="close">
        <template #title>
            <span>{{ titleName }}</span><span v-if="titleUsername" class="text-blue-500 hover:underline cursor-pointer"
                @click="openTitleChannel">{{ titleUsername }}</span>
        </template>
        <template #header-actions>
            <div class="relative">
                <button type="button"
                    class="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
                    :disabled="!set" @click.stop="menuOpen = !menuOpen">
                    <MoreHorizontalIcon class="w-4.5 h-4.5" />
                </button>
                <div v-if="menuOpen"
                    class="absolute right-0 top-full mt-2 z-20 w-48 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1f2937] shadow-xl">
                    <button v-for="item in menuItems" :key="item.key" type="button"
                        class="w-full px-3 py-2 rounded-lg text-left text-sm whitespace-nowrap text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        @click.stop="onMenuSelect(item.key)">
                        {{ item.label }}
                    </button>
                </div>
            </div>
        </template>

        <div @click="menuOpen = false">
            <div v-if="!set && loading" class="py-10 text-center text-sm text-gray-400">
                {{ t('lng_context_seen_loading') }}
            </div>
            <div v-else-if="!set" class="py-10 text-center text-sm text-gray-400">
                {{ t('lng_stickers_not_found') }}
            </div>
            <div v-else class="grid justify-items-center gap-2"
                :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
                <div v-for="s in set.stickers" :key="s.id" class="relative">
                    <MessageStickerContent :content="toContent(s)" :size="tileSize" load-scope="stickerDetail" />
                    <!-- 会员专属贴纸：与贴纸面板一致的会员星标 -->
                    <PremiumStickerBadge v-if="isPremiumOnlySticker(s)" />
                </div>
            </div>
        </div>

        <template v-if="set" #footer>
            <button type="button"
                class="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                :class="set.is_installed
                    ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50'
                    : 'bg-blue-500 text-white hover:bg-blue-600'"
                :disabled="busy" @click="toggleInstalled">
                <span>{{ installLabel }}</span>
                <span class="tabular-nums opacity-70">{{ set.stickers.length }}</span>
            </button>
        </template>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { MoreHorizontalIcon } from 'lucide-vue-next';
import ModalDialog from '../../settings/ModalDialog.vue';
import MessageStickerContent from './MessageContent/content/MessageStickerContent.vue';
import PremiumStickerBadge from '../../common/PremiumStickerBadge.vue';
import { tdlibSend } from '../../../utils/tdlib';
import { toast } from '../../../utils/toast';
import { stickerSetDialogState, closeStickerSetDialog } from '../../../store/stickerSetDialog';
import { clearViewportLoadQueue } from '../../../utils/viewportLoadGate';
import type { messageSticker, sticker, stickerSet } from 'tdlib-types';

const { t } = useI18n();

const open = computed(() => stickerSetDialogState.value.open);
const setId = computed(() => stickerSetDialogState.value.setId);

const set = ref<stickerSet | null>(null);
const loading = ref(false);
const busy = ref(false);
const menuOpen = ref(false);
/** 请求代次：快速切换/关闭时丢弃过期响应 */
let reqSeq = 0;

const isEmojiSet = computed(() => set.value?.sticker_type._ === 'stickerTypeCustomEmoji');
/** 自定义表情每行 8 个，普通贴纸每行 5 个 */
const columns = computed(() => (isEmojiSet.value ? 8 : 5));
const tileSize = computed(() => (isEmojiSet.value ? 40 : 64));

const title = computed(() => set.value?.title ?? '');
const router = useRouter();

/** 标题形如「名称 @username」：拆出末尾的 @username 用于跳转频道 */
const titleParts = computed(() => {
    const m = title.value.match(/^(.*?)\s*(@\w+)\s*$/);
    return m ? { name: m[1], username: m[2] } : { name: title.value, username: '' };
});
const titleName = computed(() => titleParts.value.name);
const titleUsername = computed(() => titleParts.value.username);

async function openTitleChannel() {
    const username = titleUsername.value.replace(/^@/, '');
    if (!username) return;
    try {
        const chat = await tdlibSend({ _: 'searchPublicChat', username });
        if (chat?.id) {
            close();
            router.push({ name: 'chat-detail', params: { id: String(chat.id) } });
        }
    } catch (e) {
        console.warn('open channel from sticker set title failed:', e);
    }
}
const installLabel = computed(() => t(set.value?.is_installed ? 'lng_stickers_remove_pack_button' : 'lng_stickers_add_pack'));

/** 顶部更多菜单：分享表情包 / 复制链接 */
const menuItems = computed(() => [
    { key: 'share', label: t('lng_stickers_share_pack') },
    { key: 'copy', label: t('lng_auction_menu_copy_link') },
]);

/**
 * 贴纸包分享链接由 TDLib 生成（getInternalLink + internalLinkTypeStickerSet）：
 * 普通/遮罩贴纸 → https://t.me/addstickers/<name>，自定义表情 → https://t.me/addemoji/<name>。
 * 不再本地拼接：名称非法时 TDLib 会返回错误，避免产出 .../addstickers/ 这类空名链接。
 */
async function resolvePackLink(s: stickerSet): Promise<string | null> {
    try {
        const link = await tdlibSend({
            _: 'getInternalLink',
            type: {
                _: 'internalLinkTypeStickerSet',
                sticker_set_name: s.name,
                expect_custom_emoji: s.sticker_type._ === 'stickerTypeCustomEmoji',
            },
            is_http: true,
        });
        return link?._ === 'httpUrl' && link.url ? link.url : null;
    } catch (e) {
        console.error('getInternalLink for sticker set failed:', e);
        return null;
    }
}

async function onMenuSelect(key: string) {
    menuOpen.value = false;
    const s = set.value;
    if (!s) return;
    const url = await resolvePackLink(s);
    if (!url) {
        toast.warning(t('context.linkFailed'));
        return;
    }
    if (key === 'share') {
        if (navigator.share) {
            try {
                await navigator.share({ title: s.title, url });
                return;
            } catch {
                /* 用户取消或不支持，回退复制 */
            }
        }
        await copyText(url);
    } else if (key === 'copy') {
        await copyText(url);
    }
}

async function copyText(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        toast.success(t('lng_create_channel_link_copied'));
    } catch (e) {
        console.error('copy pack link failed:', e);
    }
}

async function load(id: string) {
    const seq = ++reqSeq;
    if (set.value?.id !== id) {
        // 切换到另一个套件：旧套件尚未开始的加载没有意义，直接丢弃
        clearViewportLoadQueue('stickerDetail');
        set.value = null;
    }
    loading.value = true;
    try {
        const res = await tdlibSend({ _: 'getStickerSet', set_id: id });
        if (seq !== reqSeq) return;
        set.value = res._ === 'stickerSet' ? res : null;
    } catch (e) {
        if (seq !== reqSeq) return;
        console.error('getStickerSet failed:', e);
        set.value = null;
    } finally {
        if (seq === reqSeq) loading.value = false;
    }
}

async function toggleInstalled() {
    const s = set.value;
    if (!s || busy.value) return;
    busy.value = true;
    try {
        await tdlibSend({ _: 'changeStickerSet', set_id: s.id, is_installed: !s.is_installed, is_archived: false });
        await load(s.id);
    } catch (e) {
        console.error('changeStickerSet failed:', e);
    } finally {
        busy.value = false;
    }
}

function toContent(s: sticker): messageSticker {
    return { _: 'messageSticker', sticker: s, is_premium: false };
}

/** 会员专属贴纸：普通贴纸带 premium_animation（TDLib：有该动画时只有 Premium 能用） */
function isPremiumOnlySticker(s: sticker): boolean {
    return s.full_type?._ === 'stickerFullTypeRegular' && !!s.full_type.premium_animation;
}

function close() {
    menuOpen.value = false;
    closeStickerSetDialog();
}

/**
 * 退出弹窗：清空详情池的排队加载，并释放当前套件内容。
 * 弹窗为 v-show 常驻，必须卸载内部贴纸项：否则其视口门控已标记“已加载”，
 * 被清掉的任务不会再次触发，重新打开时会一直是占位图。
 */
function resetDetail() {
    clearViewportLoadQueue('stickerDetail');
    reqSeq++;
    set.value = null;
    loading.value = false;
}

watch([open, setId], ([isOpen, id]) => {
    menuOpen.value = false;
    if (isOpen && id) {
        void load(id);
    } else {
        resetDetail();
    }
}, { immediate: true });
</script>
