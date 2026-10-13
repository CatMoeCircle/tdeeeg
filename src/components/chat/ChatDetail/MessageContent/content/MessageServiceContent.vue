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
                {{ serviceText }}
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

        <span v-else
            class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
            {{ serviceText }}
        </span>

        <!-- 壁纸预览弹窗（点击卡片里的查看按钮打开） -->
        <WallpaperPreviewDialog :open="wallpaperPreviewOpen" :wallpaper="wallpaperContent?.background ?? null"
            :user-name="otherUserName" :chat-id="chatId" :message-id="messageId"
            @close="wallpaperPreviewOpen = false" />
    </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t } = useI18n();
import { computed, watch, ref } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import type { chatPhoto, file, MessageContent, message, photoSize } from 'tdlib-types';
import { ensureLocalFilePath, tdlibSend } from '../../../../../utils/tdlib';
import { ensureUser, getUserDisplayName } from '../../../../../utils/senderInfo';
import { useChatStore } from '../../../../../store/chat';
import { openMediaViewer } from '../../../../../store/mediaViewer';
import WallpaperPreviewDialog from '../../../WallpaperPreviewDialog.vue';
import MessageUnsupportedContent from './MessageUnsupportedContent.vue';

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

/** 发送者名称（未解析到时兜底） */
const sender = computed(() => props.senderName?.trim() || t('service.someone'));

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

/**
 * 弹窗里的 {user} 取「对话对方」：对方设的壁纸发送者就是对方，
 * 自己设的壁纸取对话标题（私聊即对方名称），拿不到再退回发送者名。
 */
const otherUserName = computed(() => {
    if (!props.isSelf) return sender.value;
    const title = props.chatId != null ? chatStore.chats[props.chatId]?.title?.trim() : '';
    return title || sender.value;
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
 * 返回 任务 id -> 任务纯文本 的映射（找不到对应消息时返回空 Map）。
 */
function findTaskNames(checklistMessageId: number): Map<number, string> {
    const map = new Map<number, string>();
    const listMsg = props.messageList?.find(m => m.id === checklistMessageId);
    if (listMsg?.content._ === 'messageChecklist') {
        for (const task of listMsg.content.list.tasks) {
            map.set(task.id, task.text.text || `#${task.id}`);
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
    const actor = props.senderName?.trim() || t('service.someone');
    const user = getUserDisplayName(userId) || t('service.someone');
    return unquoteName(t('lng_action_kick_user', { from: actor, user }), user);
}

/** 置顶服务消息（messagePinMessage）文案，异步解析被置顶消息类型后填充 */
const pinText = ref('');

/** 被置顶消息的媒体描述（对应 lng_action_pinned_media_* 键），无法归类返回 null */
function pinnedMediaInfo(content: MessageContent): { key: string; params?: Record<string, string> } | null {
    switch (content._) {
        case 'messagePhoto':
            return { key: 'lng_action_pinned_media_photo' };
        case 'messageVideo':
            return { key: 'lng_action_pinned_media_video' };
        case 'messageAnimation':
            return { key: 'lng_action_pinned_media_gif' };
        case 'messageSticker':
            return { key: 'lng_action_pinned_media_sticker' };
        case 'messageAnimatedEmoji':
            return { key: 'lng_action_pinned_media_emoji_sticker', params: { emoji: content.emoji } };
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
        pinText.value = t('lng_action_pinned_message', { from, text: pinnedTextPreview(c.text.text) });
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

const serviceText = computed<string | null>(() => {
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
            const names = userIds.map(id => getUserDisplayName(id) || t('service.someone'));
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
        case 'messageChatDeleteMember':
            return memberRemovedText(c.user_id);
        case 'messageChatUpgradeTo':
            return t('lng_action_group_migrate');
        case 'messageChatUpgradeFrom':
            return t('lng_action_group_migrate');
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
            return t('lng_action_poll_added_answer', { from: sender.value, option: c.text.text || '' });
        case 'messagePollOptionDeleted':
            return t('lng_action_poll_deleted_answer', { from: sender.value, option: c.text.text || '' });
        case 'messageChecklistTasksDone': {
            const names = findTaskNames(c.checklist_message_id);
            const parts: string[] = [];
            const appendGroup = (ids: number[], done: boolean) => {
                if (ids.length === 0) return;
                const key = done ? 'lng_action_todo_marked_done' : 'lng_action_todo_marked_not_done';
                const labels = ids.map(id => names.get(id)).filter((n): n is string => !!n);
                if (labels.length === ids.length) {
                    const tasks = joinNames(labels, 'lng_action_todo_tasks_and_one', 'lng_action_todo_tasks_and_last');
                    parts.push(t(key, { from: sender.value, tasks }));
                } else {
                    parts.push(t(key, { from: sender.value, tasks: t('lng_action_todo_tasks_fallback', { count: ids.length }) }));
                }
            };
            appendGroup(c.marked_as_done_task_ids, true);
            appendGroup(c.marked_as_not_done_task_ids, false);
            if (parts.length === 0) return t('service.checklistUpdated', { from: sender.value });
            if (parts.length === 1) return parts[0];
            return t('lng_action_todo_tasks_and_one', { tasks: parts[0], task: parts[1] });
        }
        case 'messageChecklistTasksAdded': {
            const labels = c.tasks.map(t => t.text.text || `#${t.id}`).filter(Boolean);
            if (labels.length === 0) {
                return t('lng_action_todo_added', { from: sender.value, tasks: t('lng_action_todo_tasks_fallback', { count: c.tasks.length }) });
            }
            const tasks = joinNames(labels, 'lng_action_todo_tasks_and_one', 'lng_action_todo_tasks_and_last');
            return t('lng_action_todo_added', { from: sender.value, tasks });
        }
        case 'messageProximityAlertTriggered':
            return t('service.proximityAlert');
        default:
            // null = 本 switch 未覆盖该类型，交由 unadapted 渲染未适配卡片（其余分支均返回非空文案）
            return null;
    }
});

/** switch 未覆盖的服务消息类型 → 渲染未适配卡片 */
const unadapted = computed(() => serviceText.value === null);
</script>
