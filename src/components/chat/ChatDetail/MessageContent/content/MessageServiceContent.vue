<template>
    <!-- switch 未覆盖的服务消息类型（TDLib 有、本端未适配）：用未适配卡片替代兜底文案 -->
    <MessageUnsupportedContent v-if="unadapted" :content="content" />

    <div v-else class="text-center py-1" :class="clickable ? 'cursor-pointer' : ''" @click="onClick">
        <!-- 设置新壁纸（messageChatSetBackground）/ 群头像更新（messageChatChangePhoto）：
             两者显示效果一致，共用这张正方形磨砂卡片（圆形预览 + 文案），只是按钮功能不同 -->
        <div v-if="cardContent"
            class="mx-auto flex aspect-square w-52 max-w-full flex-col items-center justify-center gap-2 rounded-2xl bg-white/40 px-4 py-4 shadow-sm backdrop-blur-md dark:bg-black/20">
            <div class="h-24 w-24 shrink-0 overflow-hidden rounded-full bg-gray-200/70 dark:bg-gray-700/70">
                <img v-if="cardThumbSrc" :src="cardThumbSrc" alt="" class="h-full w-full object-cover" />
            </div>
            <span class="text-xs text-gray-600 dark:text-gray-300">
                <ServiceTextNodes />
            </span>
            <!-- 群头像更新：查看照片走媒体查看器（照片 / 视频查看器），而非应用壁纸 -->
            <button v-if="photoContent" type="button"
                class="rounded-full bg-white/50 px-4 py-1 text-xs font-medium text-gray-900 backdrop-blur-sm dark:bg-white/15 dark:text-white"
                @click="openPhotoViewer">
                {{ t('lng_action_suggested_photo_button') }}
            </button>
            <!-- 只有对方设置的壁纸才提供预览入口；自己设的壁纸不显示按钮 -->
            <button v-else-if="!isSelf" type="button"
                class="rounded-full bg-white/50 px-4 py-1 text-xs font-medium text-gray-900 backdrop-blur-sm dark:bg-white/15 dark:text-white"
                @click="wallpaperPreviewOpen = true">
                {{ t('lng_action_set_wallpaper_button') }}
            </button>
        </div>

        <!-- 频道/群被加入社群：与官方一致用卡片（社群头像 + 文案 + 查看按钮），点击查看打开社群详情 -->
        <div v-else-if="communityContent"
            class="mx-auto flex w-52 max-w-full flex-col items-center justify-center gap-2.5 rounded-2xl bg-white/40 px-4 py-5 shadow-sm backdrop-blur-md dark:bg-black/20">
            <CommunityAvatar :photo="communityPhoto" :title="communityName" size-class="w-20 h-20" />
            <span class="text-sm leading-snug text-gray-600 dark:text-gray-300">
                <ServiceTextNodes />
            </span>
            <button type="button"
                class="rounded-full bg-white/50 px-6 py-1.5 text-sm font-medium text-gray-900 backdrop-blur-sm dark:bg-white/15 dark:text-white"
                @click.stop="communityDialogOpen = true">
                {{ t('lng_community_view') }}
            </button>
        </div>

        <span v-else
            class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
            <ServiceTextNodes />
        </span>

        <!-- 服务消息本身也可以被回应：沿用消息气泡的回应胶囊，居中放在服务文案下方 -->
        <div v-if="reactionMessage" class="mt-1 flex justify-center">
            <ReactionsBar :msg="reactionMessage" :isSelf="false" @toggle-reaction="onToggleReaction" />
        </div>

        <!-- 壁纸预览弹窗（点击卡片里的查看按钮打开） -->
        <WallpaperPreviewDialog :open="wallpaperPreviewOpen" :wallpaper="wallpaperContent?.background ?? null"
            :user-name="otherUserName" :chat-id="chatId" :message-id="messageId"
            @close="wallpaperPreviewOpen = false" />

        <!-- 社群详情弹窗（点击社群卡片里的查看按钮打开） -->
        <CommunityDetailDialog v-if="communityContent" v-model:open="communityDialogOpen"
            :community-id="communityContent.community_id" :name="communityName" :photo="communityPhoto" />
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { computed, watch, ref, h, Text } from 'vue';
import type { VNode } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useRouter } from 'vue-router';
import type { chatPhoto, file, formattedText, MessageContent, message, messageSticker, photoSize, ReactionType } from 'tdlib-types';
import { ensureLocalFilePath, tdlibSend } from '../../../../../utils/tdlib';
import { confirmAndOpenExternalLink } from '../../../../../utils/openExternalLink';
import { ensureUser, getReactiveChat, getUserDisplayName } from '../../../../../utils/senderInfo';
import { isChannelChat } from '../../../../../utils/groupRights';
import { hasReactions } from '../../../../../utils/reactionHelpers';
import { useChatStore } from '../../../../../store/chat';
import { useCommunityStore } from '../../../../../store/community';
import { openMediaViewer } from '../../../../../store/mediaViewer';
import { useUserStore } from '../../../../../store/user';
import { toggleReaction } from '../../../../contextMenu/messageActions';
import FormattedTextInline from '../../../FormattedTextInline.vue';
import WallpaperPreviewDialog from '../../../WallpaperPreviewDialog.vue';
import CommunityAvatar from '../../../../common/CommunityAvatar.vue';
import CommunityDetailDialog from '../../../../common/CommunityDetailDialog.vue';
import ReactionsBar from '../../ReactionsBar.vue';
import MessageUnsupportedContent from './MessageUnsupportedContent.vue';
import MessageStickerContent from './MessageStickerContent.vue';

const props = defineProps<{
    content: MessageContent;
    /** 服务消息发送者的显示名称（清单完成/添加等提示会用到） */
    senderName?: string;
    /** 服务消息发送者（操作者）的用户 id，用于判断成员是否为自行退出 */
    senderUserId?: number;
    /** 是否为自己发送（设置壁纸提示区分「你 / 对方」文案） */
    isSelf?: boolean;
    /** 当前消息列表（用于按 checklist_message_id 查找清单消息，展示任务文本） */
    messageList?: message[];
    /** 对话 id（置顶提示需按 message_id 拉取被置顶消息以判断其类型） */
    chatId?: number;
    /** 本条服务消息 id（壁纸预览沿用消息里的背景需要） */
    messageId?: number;
    /** 本条服务消息（群头像更新打开媒体查看器需要） */
    message?: message;
}>();

const emit = defineEmits<{
    jump: [messageId: number];
}>();

/** 带回应的服务消息（回应条渲染在服务文案下方） */
const reactionMessage = computed(() =>
    props.message && hasReactions(props.message) ? props.message : null,
);

function onToggleReaction(type: ReactionType) {
    if (props.chatId === undefined || !props.message) return;
    void toggleReaction(props.chatId, props.message, type);
}

/** 发送者名称（未解析到时兜底） */
const plainSender = computed(() => props.senderName?.trim() || t('service.someone'));

/**
 * 文案里的用户名用私有控制字符包裹「用户 id + 名称」，渲染时还原为可点击链接；
 * 无用户 id（如频道帖子）则保持纯文本。
 */
const USER_OPEN = '\u0002';
const USER_SEP = '\u0003';
const USER_CLOSE = '\u0004';
function userMark(userId: number | undefined, name: string): string {
    return userId ? `${USER_OPEN}${userId}${USER_SEP}${name}${USER_CLOSE}` : name;
}

/** 文案中的网站域名标记（如「在 {domain} 上登录」），渲染为可点击链接，点击后打开 https://{domain} */
const DOMAIN_OPEN = '\u0005';
const DOMAIN_CLOSE = '\u0006';
function domainMark(domain: string): string {
    return `${DOMAIN_OPEN}${domain}${DOMAIN_CLOSE}`;
}

/** 匹配用户标记（捕获 id、名称）或域名标记（捕获域名）；renderMarked 据此切分文本 */
const MARK_RE = new RegExp(
    `${USER_OPEN}(\\d+)${USER_SEP}([^${USER_CLOSE}]*)${USER_CLOSE}|${DOMAIN_OPEN}([^${DOMAIN_CLOSE}]*)${DOMAIN_CLOSE}`,
    'g',
);

/** 当前对话是否为频道：频道里的服务消息没有用户身份（发送者是频道本身，不是某个用户） */
const isChannel = computed(() =>
    isChannelChat(props.chatId != null ? getReactiveChat(props.chatId) : undefined),
);

/**
 * 人称「您」是否适用：只在群组 / 私聊中用「您」区分自己与对方；
 * 频道里即使是自己触发的操作，也显示对应的频道名称——与其它管理员触发的同一条
 * 文案保持一致，不会出现「您将频道名称更改为…」这种没有用户身份的表述。
 */
const ownAction = computed(() => !!props.isSelf && !isChannel.value);

/**
 * 文案中的操作者名称：群组 / 私聊里自己发出的服务消息用「您 / You」（与对方视角区分，
 * 避免显示成自己的名字，如「讨论将群组名称更改为…」）；频道里固定用发送者名称；
 * 对方则为带用户链接标记的名称。
 */
const sender = computed(() =>
    ownAction.value ? t('service.you') : userMark(props.senderUserId, plainSender.value),
);

/**
 * 需要按卡片渲染的「设置新壁纸」消息。
 * old_background_message_id > 0 表示设的是与对方相同的壁纸，属普通提示行，不出卡片。
 */
const wallpaperContent = computed(() => {
    const c = props.content;
    if (c._ !== 'messageChatSetBackground') return null;
    return c.old_background_message_id > 0 ? null : c;
});

/** 群头像更新消息（messageChatChangePhoto）：与设置壁纸共用卡片，按钮改为「查看照片」 */
const photoContent = computed(() => {
    const c = props.content;
    return c._ === 'messageChatChangePhoto' ? c : null;
});

/** 需要按卡片渲染的消息：设置新壁纸 / 群头像更新 */
const cardContent = computed(() => wallpaperContent.value ?? photoContent.value);

/** 是否频道帖子：频道里的操作消息没有用户身份，文案要用 lng_action_*_channel 变体 */
const isChannelPost = computed(() => props.message?.is_channel_post === true);

/** 已下载就绪的壁纸缩略图 / 原图（asset 地址），未就绪时为空 */
const wallpaperFileSrc = ref('');

/** 壁纸预览弹窗开关 */
const wallpaperPreviewOpen = ref(false);

const chatStore = useChatStore();
const communityStore = useCommunityStore();
const userStore = useUserStore();

/** 被加入社群的消息（messageChatAddedToCommunity）：渲染为社群卡片，而不是一行系统提示 */
const communityContent = computed(() => {
    const c = props.content;
    return c._ === 'messageChatAddedToCommunity' ? c : null;
});

/** 社群卡片上的名称 / 头像：来自 updateCommunity 缓存，未缓存时退回「社区」文案 */
const communityName = computed(() =>
    (communityContent.value && communityStore.names[communityContent.value.community_id]) || t('lng_community_title'),
);
const communityPhoto = computed(() =>
    communityContent.value ? communityStore.communities[communityContent.value.community_id]?.photo : undefined,
);

/** 社群详情弹窗开关（卡片里的「查看」按钮） */
const communityDialogOpen = ref(false);

// 还没收到 updateCommunity 时主动向 Rust 侧要一次，头像/名称就绪后卡片自动更新
watch(
    () => communityContent.value?.community_id,
    (id) => {
        if (id && !communityStore.communities[id]) void communityStore.fetchCommunity(id);
    },
    { immediate: true },
);

/** 当前登录用户 id：文案中的成员若是自己，显示为「您 / You」而非自己的名字 */
const myId = computed(() => userStore.userProfile?.id);

/** 文案中的成员名称（带用户链接标记）；成员是自己时用「您 / You」且不可点击 */
function memberName(userId: number): string {
    if (myId.value && userId === myId.value) return t('service.you');
    return userMark(userId, getUserDisplayName(userId) || t('service.someone'));
}
const router = useRouter();

/** 点击服务消息中的用户名 → 打开该用户的个人资料页 */
function openUserProfile(userId: number) {
    router.push({ name: 'user-profile', params: { id: String(userId) } });
}

/**
 * 弹窗里的 {user} 取「对话对方」：对方设的壁纸发送者就是对方，
 * 自己设的壁纸取对话标题（私聊即对方名称），拿不到再退回发送者名。
 */
const otherUserName = computed(() => {
    if (!props.isSelf) return plainSender.value;
    const title = props.chatId != null ? chatStore.chats[props.chatId]?.title?.trim() : '';
    return title || plainSender.value;
});

/** 内嵌 minithumbnail（base64，无需下载），作为缩略图就绪前的占位 */
const wallpaperMiniSrc = computed(() => {
    const data = wallpaperContent.value?.background.background.document?.minithumbnail?.data;
    return data ? `data:image/jpeg;base64,${data}` : '';
});

/** 卡片内圆形预览图：就绪的缩略图 / 原图优先，否则内嵌 minithumbnail */
const wallpaperThumbSrc = computed(() => wallpaperFileSrc.value || wallpaperMiniSrc.value);

/** 已下载就绪的群头像缩略图（asset 地址，取最小尺寸足够圆形预览），未就绪时为空 */
const photoFileSrc = ref('');

/** 群头像内嵌 minithumbnail（base64，无需下载），作为缩略图就绪前的占位 */
const photoMiniSrc = computed(() => {
    const data = photoContent.value?.photo.minithumbnail?.data;
    return data ? `data:image/jpeg;base64,${data}` : '';
});

/** 卡片内圆形预览图：壁纸与群头像共用，按消息类型取对应来源 */
const cardThumbSrc = computed(() =>
    photoContent.value ? (photoFileSrc.value || photoMiniSrc.value) : wallpaperThumbSrc.value,
);

/** 按面积挑群头像文件：smallest 取最小（圆形预览用），否则取最大（查看器里的原图） */
function pickPhotoFile(photo: chatPhoto, smallest: boolean): file | undefined {
    let best: photoSize | undefined;
    for (const size of photo.sizes) {
        if (!size.photo) continue;
        const better = !best || (smallest
            ? size.width * size.height < best.width * best.height
            : size.width * size.height > best.width * best.height);
        if (better) best = size;
    }
    return best?.photo;
}

/**
 * 打开群头像的媒体查看器：本消息不是媒体消息，故直接给定 type/file，
 * 由消息类型决定不拉起附近媒体列表（仅这一张）。
 *
 * 查看器的自动下载只认消息媒体（item.message.content），服务消息里的头像
 * 不在其内，所以必须先备好原图再交给查看器（与 UserProfile 一样只传就绪文件），
 * 否则查看器会一直停在「加载中」。
 */
async function openPhotoViewer() {
    const c = photoContent.value;
    if (!c || !props.message) return;
    const target = pickPhotoFile(c.photo, false);
    const path = await ensureLocalFilePath(target);
    void openMediaViewer({
        messageId: props.messageId,
        chatId: props.chatId,
        message: props.message,
        type: 'photo',
        file: target,
        readyPath: path ?? undefined,
        thumb: photoMiniSrc.value,
    });
}

/**
 * 取群头像预览文件：最小尺寸即可满足圆形预览，体积也最小；
 * 未下载时先用内嵌 minithumbnail 占位。
 */
watch(
    () => props.content,
    async (c) => {
        photoFileSrc.value = '';
        if (c._ !== 'messageChatChangePhoto') return;
        const path = await ensureLocalFilePath(pickPhotoFile(c.photo, true));
        // 期间消息已切换则丢弃结果
        if (path && props.content === c) photoFileSrc.value = convertFileSrc(path);
    },
    { immediate: true },
);

/**
 * 取壁纸预览文件：缩略图（尺寸足够圆形预览，体积小）优先，
 * 文档为图片时才退到原图；两者都拿不到就用 minithumbnail 垫底。
 */
watch(
    () => props.content,
    async (c) => {
        wallpaperFileSrc.value = '';
        if (c._ !== 'messageChatSetBackground' || c.old_background_message_id > 0) return;
        const document = c.background.background.document;
        if (!document) return;
        const path =
            (await ensureLocalFilePath(document.thumbnail?.file)) ??
            ((document.mime_type ?? '').startsWith('image/')
                ? await ensureLocalFilePath(document.document)
                : null);
        // 期间消息已切换则丢弃结果
        if (path && props.content === c) wallpaperFileSrc.value = convertFileSrc(path);
    },
    { immediate: true },
);

/**
 * 涉及的成员可能尚未缓存（离开的成员还会因退群而从在线列表消失），主动发 getUser 拉取；
 * 用户缓存就绪后文案自动更新。
 */
watch(
    () => {
        const c = props.content;
        if (c._ === 'messageChatDeleteMember') return [c.user_id];
        if (c._ === 'messageChatAddMembers') return c.member_user_ids;
        return [];
    },
    (userIds) => {
        for (const userId of userIds) if (userId) void ensureUser(userId);
    },
    { immediate: true },
);

/** 是否为“投票选项被添加/删除”的服务消息；关联的投票消息 id >0 时可点击跳转 */
const pollMessageId = computed(() => {
    const c = props.content;
    if (c._ === 'messagePollOptionAdded' || c._ === 'messagePollOptionDeleted') return c.poll_message_id;
    return 0;
});

const clickable = computed(() => pollMessageId.value > 0);

function onClick() {
    if (clickable.value) emit('jump', pollMessageId.value);
}

/**
 * 从消息列表中按 checklist_message_id 找到 messageChecklist 消息，
 * 返回 任务 id -> 任务标题（formattedText，保留自定义 emoji / 格式实体） 的映射（找不到对应消息时返回空 Map）。
 */
function findTaskTitles(checklistMessageId: number): Map<number, formattedText> {
    const map = new Map<number, formattedText>();
    const listMsg = props.messageList?.find(m => m.id === checklistMessageId);
    if (listMsg?.content._ === 'messageChecklist') {
        for (const task of listMsg.content.list.tasks) {
            map.set(task.id, task.text.text ? task.text : { _: 'formattedText', text: `#${task.id}`, entities: [] });
        }
    }
    return map;
}

/**
 * 官方 zh-hans 语言包把名字括在引号里（`{from} 添加了“{users}”`），英文等语言则不带引号。
 * 本应用统一按不带引号显示：去掉包裹被插值名字的成对引号，并补一个空格分隔。
 */
function unquoteName(text: string, name?: string): string {
    if (!name) return text;
    const quoted = [
        `“${name}”`, `「${name}」`, `『${name}』`, `„${name}“`, `«${name}»`, `‘${name}’`, `"${name}"`,
    ];
    return quoted
        .reduce((acc, pair) => acc.split(pair).join(` ${name} `), text)
        .replace(/ {2,}/g, ' ')
        .trimEnd();
}

/**
 * 成员离开/被移出的提示文案。messageChatDeleteMember 自带 user_id，
 * 能精确显示“是谁”离开/被移出，而非笼统的“有成员离开”。
 * 自行退出时消息发送者即该成员本人，用发送者名称（该成员的用户数据可能已拉取失败）。
 */
function memberRemovedText(userId: number): string {
    if (props.senderUserId === userId) return t('lng_action_user_left', { from: sender.value });
    // 被其他成员/管理员移出：带出操作者与被移出的成员
    const actor = sender.value;
    const user = memberName(userId);
    return unquoteName(t('lng_action_kick_user', { from: actor, user }), user);
}

/** 置顶服务消息（messagePinMessage）文案，异步解析被置顶消息类型后填充；数组形式用于内联动态表情 */
const pinText = ref<string | ServicePart[] | null>('');

/** 被置顶消息的媒体描述（对应 lng_action_pinned_media_* 键），无法归类返回 null */
function pinnedMediaInfo(content: MessageContent): { key: string; params?: Record<string, string> } | null {
    switch (content._) {
        case 'messagePhoto':
            return { key: 'lng_action_pinned_media_photo' };
        case 'messageVideo':
            return { key: 'lng_action_pinned_media_video' };
        case 'messageAnimation':
            return { key: 'lng_action_pinned_media_gif' };
        // 贴纸：按官方键值显示文本描述，不内联渲染贴纸图（动态表情在 resolvePinText 里单独内联渲染）
        case 'messageSticker':
            return { key: 'lng_action_pinned_media_sticker' };
        case 'messageVoiceNote':
            return { key: 'lng_action_pinned_media_voice' };
        case 'messageVideoNote':
            return { key: 'lng_action_pinned_media_video_message' };
        case 'messageAudio':
            return { key: 'lng_action_pinned_media_audio' };
        case 'messageDocument':
            return { key: 'lng_action_pinned_media_file' };
        case 'messageLocation':
            return { key: 'lng_action_pinned_media_location' };
        case 'messageContact':
            return { key: 'lng_action_pinned_media_contact' };
        case 'messageGame':
            return { key: 'lng_action_pinned_media_game', params: { game: pinnedTextPreview(content.game.title) } };
        case 'messageStory':
            return { key: 'lng_action_pinned_media_story' };
        default:
            return null;
    }
}

/** 置顶预览的字符上限（与 Telegram Desktop 的 kPinnedMessageTextLimit 一致） */
const PINNED_TEXT_PREVIEW_LIMIT = 16;

/** 置顶提示里内联动态表情的边长（与 12px 服务文案同一行显示） */
const INLINE_EMOJI_SIZE = 18;

/**
 * 被置顶文本的开头预览（保留实体）：文本里的自定义 emoji 只有带着
 * textEntityTypeCustomEmoji 才能内联渲染成表情动画，直接取纯文本就只剩 emoji 字符。
 * 截断按码点推进，控制空白逐字替换为空格（等长），实体偏移保持有效。
 */
function pinnedTextPreviewFormatted(ft: formattedText): formattedText {
    let cutAt = 0;
    let count = 0;
    while (cutAt < ft.text.length && count < PINNED_TEXT_PREVIEW_LIMIT) {
        const code = ft.text.charCodeAt(cutAt);
        cutAt += code >= 0xd800 && code <= 0xdbff && cutAt + 1 < ft.text.length ? 2 : 1;
        count++;
    }
    const truncated = cutAt < ft.text.length;
    const text = ft.text.slice(0, cutAt).replace(/[\r\n\t]/g, ' ') + (truncated ? '…' : '');
    const entities = (ft.entities ?? [])
        .filter(e => e.offset < text.length)
        .map(e => ({ ...e, length: Math.min(e.length, text.length - e.offset) }))
        .filter(e => e.length > 0);
    return { _: 'formattedText', text, entities };
}

/**
 * 被置顶内容的开头预览：去换行后按上限截断并在末尾补省略号，
 * 与其他客户端一样只保留很短的预览；emoji（代理对）不会被切一半。
 */
function pinnedTextPreview(text: string): string {
    const oneLine = text.replace(/\s+/g, ' ').trim();
    let cutAt = 0;
    for (let limit = PINNED_TEXT_PREVIEW_LIMIT; limit > 0 && cutAt < oneLine.length; limit--) {
        const code = oneLine.charCodeAt(cutAt);
        cutAt += code >= 0xd800 && code <= 0xdbff && cutAt + 1 < oneLine.length ? 2 : 1;
    }
    return cutAt < oneLine.length ? `${oneLine.slice(0, cutAt)}…` : oneLine;
}



/** 解析 messagePinMessage：按被置顶消息类型生成「{from} 置顶了 …」文案 */
async function resolvePinText(messageId: number) {
    const from = sender.value;
    const chatId = props.chatId;
    if (!messageId || !chatId) {
        pinText.value = t('lng_action_pinned_message', { from, text: '' });
        return;
    }

    // 优先在本列表查找被置顶消息，找不到再通过 TDLib 拉取
    let pinned: message | undefined = props.messageList?.find(m => m.id === messageId);
    if (!pinned) {
        // 服务消息的 reply_to 指向被置顶消息：getRepliedMessage 会从服务端拉取，
        // 而 getMessage 只查本地缓存，被置顶的贴纸等消息常常查不到
        const serviceId = props.messageId ?? props.message?.id;
        if (props.message?.reply_to?._ === 'messageReplyToMessage' && serviceId) {
            try {
                pinned = await tdlibSend({ _: 'getRepliedMessage', chat_id: chatId, message_id: serviceId }) as any;
            } catch {
                pinned = undefined;
            }
        }
    }
    if (!pinned) {
        try {
            pinned = await tdlibSend({ _: 'getMessage', chat_id: chatId, message_id: messageId }) as any;
        } catch {
            pinned = undefined;
        }
    }
    if (!pinned) {
        pinText.value = t('lng_action_pinned_message', { from, text: '' });
        return;
    }

    // 文本消息 → 「{from} 置顶了 "{开头文字}"」；媒体消息 → 「{from} 置顶了 {媒体}」
    const c = pinned.content;
    if (c._ === 'messageText') {
        // 保留实体：文本里的自定义 emoji 内联显示成表情动画，而不是 emoji 字符
        pinText.value = [{
            key: 'lng_action_pinned_message',
            params: { from, text: pinnedTextPreviewFormatted(c.text) },
        }];
        return;
    }
    // 清单：「{from} 置顶了 «清单标题»」，文本取清单标题（与文本消息一样做开头预览，同样保留自定义 emoji）
    if (c._ === 'messageChecklist') {
        pinText.value = [{
            key: 'lng_action_pinned_message',
            params: { from, text: pinnedTextPreviewFormatted(c.list.title) },
        }];
        return;
    }
    // 骰子 / 老虎机等没有对应的媒体文案键，直接显示其 emoji
    if (c._ === 'messageDice') {
        pinText.value = t('lng_action_pinned_message', { from, text: c.emoji });
        return;
    }
    // 动态表情：内联渲染对应的表情动画，而不是 emoji 字符
    if (c._ === 'messageAnimatedEmoji') {
        const sticker = c.animated_emoji.sticker;
        if (sticker) {
            pinText.value = [{
                key: 'lng_action_pinned_media',
                params: {
                    from,
                    media: { inlineEmoji: { _: 'messageSticker', sticker, is_premium: false } },
                },
            }];
        } else {
            // 表情资源尚未拉取到（sticker 为空）：退回「一个 {emoji} 贴纸」文案
            pinText.value = t('lng_action_pinned_media', {
                from,
                media: t('lng_action_pinned_media_emoji_sticker', { emoji: c.emoji }),
            });
        }
        return;
    }
    // 投票/测验：用已存在的官方类型名作为媒体描述（lng_polls_public / lng_polls_public_quiz）
    if (c._ === 'messagePoll') {
        const media = t(c.poll.type._ === 'pollTypeQuiz' ? 'lng_polls_public_quiz' : 'lng_polls_public');
        pinText.value = t('lng_action_pinned_media', { from, media });
        return;
    }
    const info = pinnedMediaInfo(c);
    if (info) {
        const media = info.params ? t(info.key, info.params) : t(info.key);
        pinText.value = t('lng_action_pinned_media', { from, media });
    } else {
        pinText.value = t('lng_action_pinned_message', { from, text: '' });
    }
}

// 置顶服务消息：按被置顶消息 id 异步解析文案
watch(
    () => props.content,
    (c) => {
        if (c._ === 'messagePinMessage') void resolvePinText(c.message_id);
        else pinText.value = '';
    },
    { immediate: true },
);

/** 用官方 and_one / and_last 把名称列表拼成 "A, B and C" */
function joinNames(names: string[], oneKey: string, lastKey: string): string {
    if (names.length === 0) return '';
    if (names.length === 1) return names[0];
    let acc = names[0];
    for (let i = 1; i < names.length; i++) {
        const isLast = i === names.length - 1;
        // add_users 系列用 {accumulated}/{user}，todo 系列用 {tasks}/{task}；两套都传，未用到的参数被忽略
        acc = t(isLast ? lastKey : oneKey, { accumulated: acc, user: names[i], tasks: acc, task: names[i] });
    }
    return acc;
}

/** 内联动态表情参数：直接渲染表情动画（贴纸渲染管线），而不是 emoji 字符 */
interface InlineEmojiParam {
    inlineEmoji: messageSticker;
}

/** i18n key 参数值：纯文本，或带自定义 emoji 的富文本（渲染时内联展示），或多段文案嵌套 */
type ServiceParam = string | formattedText | ServiceParam[] | ServicePart | InlineEmojiParam;

/** 一条完整的服务消息文案：i18n key + 参数；icon 为可选的 tgico 图标类名，显示在文案最前（发送者名称之前） */
type ServicePart = { key: string; params: Record<string, ServiceParam>; icon?: string };

const serviceText = computed<ServicePart[] | string | null>(() => {
    const c = props.content;
    switch (c._) {
        case 'messageBasicGroupChatCreate':
            return t('lng_action_created_chat', { from: sender.value, title: c.title });
        case 'messageSupergroupChatCreate':
            return t('lng_action_created_channel');
        case 'messageChatChangeTitle':
            return t('lng_action_changed_title', { from: sender.value, title: c.title });
        case 'messageChatChangePhoto':
            // 频道帖子里没有操作者用户，不能用「{from} 更换了群组头像」把频道名当人名
            return isChannelPost.value
                ? t('lng_action_changed_photo_channel')
                : t('lng_action_changed_photo', { from: sender.value });
        case 'messageChatDeletePhoto':
            return t('lng_action_removed_photo', { from: sender.value });
        case 'messageChatAddMembers': {
            const userIds = c.member_user_ids;
            // 成员自行加入：消息发送者就是被加入的成员本人，应表述为「加入了群组」而非「被谁添加」
            if (userIds.length === 1 && userIds[0] === props.senderUserId) {
                return t('lng_action_user_joined', { from: sender.value });
            }
            // 被添加的是自己（由他人添加）：官方「{from} 将您添加到此群组」
            if (userIds.length === 1 && myId.value && userIds[0] === myId.value) {
                return t('lng_action_add_you_group', { from: sender.value });
            }
            const names = userIds.map(id => memberName(id));
            // 官方 zh-hans 包里该 key 是 "{from} 添加了“{users}”"，与 en 的 "{user}" 不一致；
            // vue-i18n 会把缺失的具名参数渲染成空串（名字被静默吞掉），故两种写法都传
            if (names.length === 1) {
                return unquoteName(t('lng_action_add_user', { from: sender.value, user: names[0], users: names[0] }), names[0]);
            }
            const users = joinNames(names, 'lng_action_add_users_and_one', 'lng_action_add_users_and_last');
            return unquoteName(t('lng_action_add_users_many', { from: sender.value, users }), users);
        }
        case 'messageChatJoinByLink':
            return t('lng_action_user_joined_by_link', { from: sender.value });
        case 'messageChatJoinByRequest':
            return t('lng_action_user_joined_by_request', { from: sender.value });
        case 'messageChatJoinFromCommunity': {
            // 社群名未缓存时用官方「通过社群加入（无名）」文案兜底
            const name = communityStore.names[c.community_id];
            return name
                ? t('lng_action_user_joined_via_community', { from: sender.value, community: name })
                : t('lng_action_user_joined_via_community_unknown', { from: sender.value });
        }
        case 'messageChatDeleteMember':
            return memberRemovedText(c.user_id);
        case 'messageChatUpgradeTo':
            return t('lng_action_group_migrate');
        case 'messageChatUpgradeFrom':
            return t('lng_action_group_migrate');
        case 'messageChatHasProtectedContentToggled': {
            // 群组 / 私聊里自己操作用 you 文案（无 {from}）；频道里显示对应的频道名称
            const enabled = c.new_has_protected_content;
            if (ownAction.value) {
                return t(enabled ? 'lng_action_no_forwards_you_enabled' : 'lng_action_no_forwards_you_disabled');
            }
            return t(enabled ? 'lng_action_no_forwards_enabled' : 'lng_action_no_forwards_disabled', { from: sender.value });
        }
        case 'messagePinMessage':
            return pinText.value;
        case 'messageChatSetBackground':
            // 同一张壁纸（old_background_message_id > 0）是独立提示行；设置新壁纸走上方卡片。
            // 对方设的这条官方包只有 lng_action_set_same_wallpaper（"{user} set the same wallpaper
            // for this chat"，中文「{user} 已为聊天设置相同的壁纸」），缺少「为您设置」这层语义，
            // 故用 app 自有词条（见 locales 的 service.setSameWallpaper）。
            return c.old_background_message_id > 0
                ? props.isSelf
                    ? t('lng_action_set_same_wallpaper_me')
                    : t('service.setSameWallpaper', { user: sender.value })
                : props.isSelf
                    ? t('lng_action_set_wallpaper_me')
                    : t('lng_action_set_wallpaper', { user: sender.value });
        case 'messageBotWriteAccessAllowed':
            // 用户通过网站登录（Telegram Login Widget）授权机器人发消息：「您在 {domain} 上登录时允许该机器人向您发消息」（文案固定为「您」视角，无需发送者）
            // 其余授权原因（附件菜单 / Web App / 接受请求）暂未适配，交由未适配卡片兜底
            return c.reason._ === 'botWriteAccessAllowReasonConnectedWebsite'
                ? t('lng_action_bot_allowed_from_domain', { domain: domainMark(c.reason.domain_name) })
                : null;
        case 'messageScreenshotTaken':
            return t('lng_action_took_screenshot', { from: sender.value });
        case 'messageChatSetMessageAutoDeleteTime':
            return c.message_auto_delete_time > 0
                ? t('lng_action_ttl_changed', { from: sender.value, duration: t('lng_duration_seconds', { count: c.message_auto_delete_time }) })
                : t('lng_action_ttl_removed', { from: sender.value });
        case 'messageForumTopicCreated':
            return t('lng_action_topic_created', { topic: c.name });
        case 'messageForumTopicEdited':
            return t('service.topicEdited');
        case 'messageForumTopicIsClosedToggled':
            return c.is_closed ? t('lng_action_topic_closed_inside') : t('lng_action_topic_reopened_inside');
        case 'messageCustomServiceAction':
            return c.text;
        case 'messageContactRegistered':
            return t('lng_action_user_registered', { from: sender.value });
        case 'messageCall':
            return c.is_video ? t('service.videoCall') : t('lng_settings_notifications_calls_title');
        case 'messageGameScore':
            return t('lng_action_game_score_no_game', { from: sender.value, count: c.score });
        case 'messagePaymentSuccessful':
            return t('service.paymentSuccessful');
        case 'messageGiftedPremium':
            return t('service.giftedPremium');
        case 'messageGiveaway':
            return t('lng_prizes_results_link');
        case 'messageGiveawayCompleted':
            return t('lng_prizes_end_title');
        case 'messagePollOptionAdded':
            return [{ key: 'lng_action_poll_added_answer', params: { from: sender.value, option: c.text.text ? c.text : '' } }];
        case 'messagePollOptionDeleted':
            return [{ key: 'lng_action_poll_deleted_answer', params: { from: sender.value, option: c.text.text ? c.text : '' } }];
        case 'messageChecklistTasksDone': {
            const titles = findTaskTitles(c.checklist_message_id);
            const groupPart = (ids: number[], done: boolean): ServicePart | null => {
                if (ids.length === 0) return null;
                const key = done ? 'lng_action_todo_marked_done' : 'lng_action_todo_marked_not_done';
                const icon = done ? 'tgico-todo-done' : 'tgico-todo-undone';
                const labels = ids.map(id => titles.get(id)).filter((n): n is formattedText => !!n);
                if (labels.length === ids.length) {
                    return { key, icon, params: { from: sender.value, tasks: joinNamesFormatted(labels, 'lng_action_todo_tasks_and_one', 'lng_action_todo_tasks_and_last') } };
                }
                return { key, icon, params: { from: sender.value, tasks: t('lng_action_todo_tasks_fallback', { count: ids.length }) } };
            };
            const donePart = groupPart(c.marked_as_done_task_ids, true);
            const notDonePart = groupPart(c.marked_as_not_done_task_ids, false);
            if (!donePart && !notDonePart) return [{ key: 'service.checklistUpdated', params: { from: sender.value } }];
            if (donePart && notDonePart) {
                // 两组都存在：拼成 lng_action_todo_tasks_and_one({tasks}, {task})
                return [{ key: 'lng_action_todo_tasks_and_one', params: { tasks: [donePart, notDonePart] } }];
            }
            const only = (donePart ?? notDonePart) as ServicePart;
            return [only];
        }
        case 'messageChecklistTasksAdded': {
            const labels = c.tasks.map(task => task.text.text ? task.text : null).filter((n): n is formattedText => !!n);
            if (labels.length === 0) {
                return [{ key: 'lng_action_todo_added', icon: 'tgico-todo-add', params: { from: sender.value, tasks: t('lng_action_todo_tasks_fallback', { count: c.tasks.length }) } }];
            }
            const tasks = joinNamesFormatted(labels, 'lng_action_todo_tasks_and_one', 'lng_action_todo_tasks_and_last');
            return [{ key: 'lng_action_todo_added', icon: 'tgico-todo-add', params: { from: sender.value, tasks } }];
        }
        case 'messageProximityAlertTriggered':
            return t('service.proximityAlert');
        case 'messageChatAddedToCommunity': {
            // 社群名未缓存时用官方「已加入到某社群」无名文案兜底
            const name = communityStore.names[c.community_id];
            return name
                ? t('lng_action_community_added_channel', { community: name })
                : t('lng_action_community_added_unknown_channel');
        }
        case 'messageChatRemovedFromCommunity':
            return t('lng_action_community_removed_channel');
        default:
            // null = 本 switch 未覆盖该类型，交由 unadapted 渲染未适配卡片（其余分支均返回非空文案）
            return null;
    }
});

/** switch 未覆盖的服务消息类型 → 渲染未适配卡片 */
const unadapted = computed(() => serviceText.value === null);

/** 服务文案的 VNode 列表（函数式组件，直接返回 VNode 数组） */
const ServiceTextNodes = () => serviceTextParts.value ?? [];

/** 把多段文案（参数里的富文本/嵌套文案渲染成内联自定义 emoji）转成可渲染的 VNode 列表 */
const serviceTextParts = computed<VNode[] | null>(() => {
    const parts = serviceText.value;
    if (parts === null) return null;
    if (typeof parts === 'string') return renderMarked(parts);
    return parts.flatMap(partNodes);
});

/** 渲染一条服务文案；带 icon 时在最前面放 tgico 图标（即发送者名称之前） */
function partNodes(part: ServicePart): VNode[] {
  const nodes = renderServicePart(part.key, part.params);
  return part.icon
    ? [h('span', { class: ['tgico', 'tgico-todo-icon', part.icon], 'aria-hidden': 'true' }), ...nodes]
    : nodes;
}

// ==================== 富文本拼接 / 渲染 ====================

/**
 * 渲染一条服务文案：非字符串参数（富文本 / 嵌套文案）先替换成占位符穿过 t()，
 * 再把占位符还原为对应的 VNode。不能直接把 VNode 传给 t()，vue-i18n 会把它字符串化、丢失自定义 emoji。
 */
function renderServicePart(key: string, params: Record<string, ServiceParam>): VNode[] {
    const slots: VNode[][] = [];
    const strParams: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
        if (typeof v === 'string') {
            strParams[k] = v;
        } else {
            strParams[k] = `\u0000${slots.length}\u0000`;
            slots.push(paramNodes(v));
        }
    }
    const text = t(key, strParams) as string;
    return text.split(/\u0000(\d+)\u0000/).flatMap((piece, i) =>
        i % 2 === 0 ? renderMarked(piece) : slots[Number(piece)],
    );
}

/** 把带用户标记的纯文本切分：普通文本保持 Text 节点，用户名还原为可点击的链接 */
function renderMarked(text: string): VNode[] {
    const nodes: VNode[] = [];
    let last = 0;
    for (const m of text.matchAll(MARK_RE)) {
        const index = m.index ?? 0;
        if (index > last) nodes.push(h(Text, null, text.slice(last, index)));
        if (m[1] !== undefined) {
            const userId = Number(m[1]);
            nodes.push(h('span', {
                class: 'cursor-pointer hover:underline',
                onClick: (e: MouseEvent) => {
                    e.stopPropagation();
                    openUserProfile(userId);
                },
            }, m[2]));
        } else {
            const domain = m[3];
            nodes.push(h('span', {
                class: 'cursor-pointer text-blue-500 hover:underline',
                onClick: (e: MouseEvent) => {
                    e.stopPropagation();
                    void confirmAndOpenExternalLink(`https://${domain}`).catch(() => {});
                },
            }, domain));
        }
        last = index + m[0].length;
    }
    if (last < text.length) nodes.push(h(Text, null, text.slice(last)));
    return nodes;
}

/** 把任意非字符串 ServiceParam 递归转成可渲染的子节点数组 */
function paramNodes(v: ServiceParam): VNode[] {
    if (typeof v === 'string') return [h(Text, null, v)];
    if (Array.isArray(v)) return v.flatMap(paramNodes);
    if ('key' in v) return partNodes(v);
    // 动态表情：与文案同一行内联渲染表情动画（tgs/webm/webp 由贴纸组件自己加载）
    if ('inlineEmoji' in v) {
        return [h(MessageStickerContent, {
            content: v.inlineEmoji,
            size: INLINE_EMOJI_SIZE,
            class: 'inline-block align-middle mx-0.5',
        })];
    }
    // formattedText → FormattedTextInline 内联渲染自定义 emoji，其余实体按纯文本展示
    return [h(FormattedTextInline, { formattedText: v, size: 16 })];
}

/** 用官方 and_one / and_last 把富文本名称列表拼成一个 formattedText（自定义 emoji 保留） */
function joinNamesFormatted(items: formattedText[], oneKey: string, lastKey: string): formattedText {
    if (items.length === 0) return { _: 'formattedText', text: '', entities: [] };
    if (items.length === 1) return items[0];
    let acc = items[0];
    for (let i = 1; i < items.length; i++) {
        const isLast = i === items.length - 1;
        // 分隔符从官方文案里取（含 ", "、" and " 等），占位符保证不与真实参数冲突
        const sep = t(isLast ? lastKey : oneKey, { accumulated: '\u0000', tasks: '\u0000', task: '\u0000', user: '\u0000' });
        const [pre, post] = sep.split('\u0000');
        acc = {
            _: 'formattedText',
            text: pre + acc.text + post + items[i].text,
            entities: [
                ...(acc.entities ?? []).map(e => ({ ...e, offset: e.offset + pre.length })),
                ...(items[i].entities ?? []).map(e => ({ ...e, offset: e.offset + pre.length + acc.text.length + post.length })),
            ],
        };
    }
    return acc;
}
</script>
