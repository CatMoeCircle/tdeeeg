<template>
    <Teleport to="body">
        <Transition name="story-fade">
            <div v-if="visible" class="fixed inset-0 z-9998 flex items-center justify-center bg-black/85 select-none"
                @keydown="onKeydown" @click.self="close" tabindex="0" ref="rootRef">
                <!-- 关闭按钮（播放器外，遮罩左上角） -->
                <button type="button"
                    class="absolute top-3 left-3 md:top-4 md:left-4 z-40 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors backdrop-blur-sm"
                    @click.stop="close" title="关闭 (Esc)">
                    <XIcon :size="20" />
                </button>

                <!-- 侧边导航箭头（桌面） -->
                <button v-if="items.length > 1" type="button"
                    class="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors"
                    @click.stop="goPrev" title="上一条">
                    <ChevronLeftIcon :size="22" />
                </button>
                <button v-if="items.length > 1" type="button"
                    class="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors"
                    @click.stop="goNext" title="下一条">
                    <ChevronRightIcon :size="22" />
                </button>

                <!-- 手机框 + 外置底栏：整体按 720×1280（9:16）固定比例 -->
                <div class="story-layout flex flex-col items-center gap-1.5">
                    <!-- 手机框 -->
                    <div class="story-phone relative bg-black overflow-hidden shadow-2xl shrink-0" :class="phoneClass"
                        ref="phoneRef">
                        <!-- 顶部进度条 -->
                        <div class="absolute top-2 left-2.5 right-2.5 z-30 flex gap-1">
                            <div v-for="(s, i) in items" :key="s.id"
                                class="flex-1 h-[2.5px] rounded-full bg-white/25 overflow-hidden">
                                <div class="h-full bg-white rounded-full origin-left"
                                    :style="{ width: segmentWidth(i) }" />
                            </div>
                        </div>

                        <!-- 顶栏：头像 / 名称 / 副标题 / 静音(仅视频) / 更多 -->
                        <div class="absolute top-5 left-2.5 right-2.5 z-30 flex items-center gap-2.5">
                            <div class="w-9 h-9 shrink-0 rounded-full overflow-hidden ring-1 ring-white/40">
                                <Avatar v-if="posterPhoto" :photo="posterPhoto" :title="posterName"
                                    :accentColorId="posterAccentId" sizeClass="!w-9 !h-9" />
                                <div v-else
                                    class="w-full h-full bg-linear-to-br from-teal-400 to-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                                    {{ posterInitial }}
                                </div>
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-white text-[13px] font-semibold leading-tight truncate drop-shadow">
                                    {{ posterName }}</p>
                                <p class="text-white/70 text-[11px] leading-tight flex items-center gap-1.5">
                                    <span v-if="isLiveStory"
                                        class="px-1 py-px rounded bg-red-500 text-white text-[10px] font-bold leading-none">LIVE</span>
                                    <span>{{ subtitleText }}</span>
                                </p>
                            </div>
                            <!-- 静音：仅视频故事显示；动画视频为占位不可切换 -->
                            <button v-if="currentKind === 'video'" type="button"
                                class="w-8 h-8 rounded-full flex items-center justify-center transition-colors" :class="isAnimationVideo
                                    ? 'text-white/40 cursor-default'
                                    : 'text-white/90 hover:text-white hover:bg-white/10'" :disabled="isAnimationVideo"
                                @click.stop="toggleMute" :title="isAnimationVideo ? '无声动画' : (muted ? '打开声音' : '静音')">
                                <Volume2Icon v-if="!muted && !isAnimationVideo" :size="18" />
                                <VolumeXIcon v-else :size="18" />
                            </button>
                            <button type="button"
                                class="w-8 h-8 rounded-full flex items-center justify-center text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                                @click.stop="onMoreClick">
                                <MoreHorizontalIcon :size="18" />
                            </button>
                        </div>

                        <!-- 媒体区 -->
                        <div class="absolute inset-0 z-10" @pointerdown="onPointerDown" @pointerup="onPointerUp"
                            @pointercancel="onPointerUp" @pointerleave="onPointerUp">
                            <!-- 照片：优先高清尺寸，minithumbnail 仅兜底且轻模糊 -->
                            <template v-if="currentKind === 'photo'">
                                <img v-if="currentThumb && !currentSrc" :src="currentThumb"
                                    class="absolute inset-0 w-full h-full object-cover blur-[2px] scale-105 opacity-80" />
                                <img v-if="currentSrc" :src="currentSrc"
                                    class="absolute inset-0 w-full h-full object-cover" draggable="false"
                                    @load="onMediaReady" />
                            </template>

                            <!-- 视频 -->
                            <template v-else-if="currentKind === 'video'">
                                <img v-if="currentThumb && !currentSrc" :src="currentThumb"
                                    class="absolute inset-0 w-full h-full object-cover" />
                                <video ref="videoRef" v-if="currentSrc" :src="currentSrc" playsinline
                                    class="absolute inset-0 w-full h-full object-cover" @timeupdate="onVideoTimeUpdate"
                                    @ended="onVideoEnded" @loadedmetadata="onVideoLoaded" />
                            </template>

                            <!-- 不支持 / 直播 -->
                            <div v-else
                                class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60">
                                <AlertCircleIcon :size="40" class="text-white/50" />
                                <p class="text-white/70 text-sm">
                                    {{ currentKind === 'live' ? '直播故事暂不支持' : '暂不支持的故事类型' }}
                                </p>
                            </div>

                            <!-- 加载中 -->
                            <div v-if="loadingMedia"
                                class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/40 pointer-events-none">
                                <Loader2Icon :size="32" class="text-white animate-spin" />
                                <p class="mt-2 text-white/70 text-xs">加载中…</p>
                            </div>
                        </div>

                        <!-- CaptionRoot：底部文案（半透明渐变 + 最多两行 + 显示更多） -->
                        <div v-if="captionText" class="story-caption-root absolute left-0 right-0 bottom-0 z-20"
                            @click.stop="onCaptionClick">
                            <div class="story-caption-gradient pointer-events-none absolute inset-0" />
                            <div class="relative px-3 pt-8 pb-3">
                                <p ref="captionEl" class="story-caption-text text-white text-[13px] leading-snug"
                                    :class="captionExpanded ? '' : 'story-caption-clamp'">{{ captionText }}</p>
                                <button v-if="!captionExpanded && captionOverflow" type="button"
                                    class="mt-1 text-white/85 hover:text-white text-[12px] font-medium">
                                    显示更多
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 互动栏（StoriesWindow：按故事类型切换）胶囊外形 -->
                    <div v-if="showInteractionBar"
                        class="story-bottom-bar w-full bg-[#2a2a2a]/95 shadow-lg backdrop-blur-sm" :class="interactionKind === 'reply' || interactionKind === 'live'
                            ? 'px-2 py-1.5 flex items-center gap-2'
                            : 'px-3.5 py-2 flex items-center gap-3'">

                        <!-- 1) 自己的普通故事：最近观看者 + 观看数 + 点赞数 + 删除 -->
                        <template v-if="interactionKind === 'my'">
                            <div v-if="recentViewerIds.length" class="flex -space-x-2 shrink-0 pl-0.5">
                                <div v-for="uid in recentViewerIds.slice(0, 3)" :key="uid"
                                    class="w-7 h-7 rounded-full overflow-hidden ring-2 ring-[#2a2a2a] bg-gray-600">
                                    <Avatar :photo="recentViewerPhoto(uid)" :title="recentViewerName(uid)"
                                        :accentColorId="recentViewerAccent(uid)" sizeClass="!w-7 !h-7" />
                                </div>
                            </div>
                            <span class="text-white/90 text-[13px] font-medium truncate">{{ viewsLabel }}</span>
                            <div v-if="reactionCount > 0" class="flex items-center gap-1 text-white/90 shrink-0">
                                <span class="tgico tgico-favorite-filled text-red-500 text-[14px]" />
                                <span class="text-[13px] font-medium">{{ formatStoryCount(reactionCount) }}</span>
                            </div>
                            <div class="flex-1" />
                            <button type="button"
                                class="w-9 h-9 rounded-full flex items-center justify-center text-white/80 hover:text-red-400 hover:bg-white/10 transition-colors shrink-0"
                                @click.stop="onDeleteStory" title="删除动态">
                                <Trash2Icon :size="18" />
                            </button>
                        </template>

                        <!-- 2) 直播故事：直播互动栏（消息输入 + 反应） -->
                        <template v-else-if="interactionKind === 'live'">
                            <div class="flex items-center gap-2 w-full">
                                <input v-model="liveReplyText" type="text" placeholder="发送直播消息…"
                                    class="flex-1 min-w-0 h-9 px-3 rounded-full bg-white/10 text-white text-[13px] placeholder:text-white/40 outline-none focus:bg-white/15"
                                    @keydown.enter.prevent="onSendLiveReply" />
                                <button type="button"
                                    class="w-9 h-9 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 transition-colors shrink-0 disabled:opacity-40"
                                    :disabled="!liveReplyText.trim()" @click.stop="onSendLiveReply" title="发送">
                                    <SendIcon :size="18" />
                                </button>
                                <button type="button"
                                    class="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90 shrink-0"
                                    :class="isLiked ? 'text-red-500' : 'text-white/90 hover:bg-white/10'"
                                    @click.stop="toggleLike" title="回应">
                                    <span class="tgico text-[18px]"
                                        :class="isLiked ? 'tgico-favorite-filled' : 'tgico-favorite'" />
                                </button>
                            </div>
                        </template>

                        <!-- 3) 频道/超级群故事：观看数 + 分享 + 反应 -->
                        <template v-else-if="interactionKind === 'channel'">
                            <button type="button"
                                class="flex items-center gap-1.5 text-white/90 hover:text-white transition-colors min-w-0"
                                @click.stop="onViewsClick" title="浏览">
                                <EyeIcon :size="18" class="shrink-0" />
                                <span class="text-[13px] font-medium">{{ viewCountLabel }}</span>
                            </button>
                            <div class="flex-1" />
                            <button type="button"
                                class="w-9 h-9 rounded-full flex items-center justify-center text-white/90 hover:text-white hover:bg-white/10 transition-colors"
                                @click.stop="onShare" title="分享">
                                <ShareIcon :size="18" />
                            </button>
                            <button type="button"
                                class="w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
                                :class="isLiked ? 'text-red-500' : 'text-white/90 hover:text-white hover:bg-white/10'"
                                @click.stop="toggleLike" title="回应">
                                <span class="tgico text-[18px]"
                                    :class="isLiked ? 'tgico-favorite-filled' : 'tgico-favorite'" />
                            </button>
                        </template>

                        <!-- 4) 别人的可回复故事：回复输入框 -->
                        <template v-else-if="interactionKind === 'reply'">
                            <div class="flex items-center gap-2 w-full">
                                <input v-model="replyText" type="text" placeholder="回复这条动态…"
                                    class="flex-1 min-w-0 h-9 px-3 rounded-full bg-white/10 text-white text-[13px] placeholder:text-white/40 outline-none focus:bg-white/15"
                                    @keydown.enter.prevent="onSendReply" @pointerdown.stop />
                                <button type="button"
                                    class="w-9 h-9 rounded-full flex items-center justify-center text-white/90 hover:bg-white/10 transition-colors shrink-0 disabled:opacity-40"
                                    :disabled="!replyText.trim()" @click.stop="onSendReply" title="发送">
                                    <SendIcon :size="18" />
                                </button>
                            </div>
                        </template>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { story, file, photo, chatPhotoInfo, profilePhoto, formattedText } from "tdlib-types";
import { convertFileSrc } from "@tauri-apps/api/core";
import { MessagePlugin } from "tdesign-vue-next";
import Avatar from "../chat/avatar.vue";
import { tdlibSend, isFileReady, downloadingFiles } from "../../utils/tdlib";
import { DL_PRIORITY } from "../../utils/downloadPriority";
import { getReactiveChat, getReactiveUser, ensureChat, ensureUser } from "../../utils/senderInfo";
import { formatStoryRelativeTime, formatStoryCount } from "../../utils/storyTime";
import { useUserStore } from "../../store/user";
import {
    getStoryViewerState,
    closeStoryViewer,
    isStoryViewerActive,
} from "../../store/storyViewer";
import { openContextMenu } from "../../store/contextMenu";
import type { ContextMenuItem } from "../contextMenu/types";
import {
    CopyIcon,
    LinkIcon,
    SoundIcon,
    CloseIcon,
} from "tdesign-icons-vue-next";
import {
    XIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    Volume2Icon,
    VolumeXIcon,
    MoreHorizontalIcon,
    AlertCircleIcon,
    Loader2Icon,
    Trash2Icon,
    SendIcon,
    EyeIcon,
    ShareIcon,
} from "lucide-vue-next";

const PHOTO_DURATION_MS = 5000;
const HOLD_SLOP = 8;

const { viewerVisible: visible, viewerIndex: index, viewerItems: items } = getStoryViewerState();

const rootRef = ref<HTMLElement | null>(null);
const phoneRef = ref<HTMLElement | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);

const muted = ref(true);
const loadingMedia = ref(false);
const currentSrc = ref("");
const currentThumb = ref("");
const photoProgress = ref(0);
const videoProgress = ref(0);
const videoDurationSec = ref(0);

const isLiked = ref(false);
const localViewBump = ref(false);

let photoTimer: number | null = null;
let photoRaf: number | null = null;
let photoStart = 0;
let photoPausedAt = 0;
let holdPaused = false;
let openStoryId: number | null = null;

// pointer 手势
let pointerDownX = 0;
let pointerDownY = 0;
let pointerDownT = 0;
let holdTimer: number | null = null;
let didHold = false;

const current = computed<story | undefined>(() => items.value[index.value]);

const currentKind = computed<"photo" | "video" | "live" | "unsupported" | "none">(() => {
    const c = current.value?.content;
    if (!c) return "none";
    if (c._ === "storyContentPhoto") return "photo";
    if (c._ === "storyContentVideo") return "video";
    if (c._ === "storyContentLive") return "live";
    return "unsupported";
});

const posterChatId = computed(() => current.value?.poster_chat_id ?? 0);

const posterChat = computed(() => getReactiveChat(posterChatId.value));

const posterUser = computed(() => {
    const chat = posterChat.value;
    const type = chat?.type;
    if (type && (type._ === "chatTypePrivate" || type._ === "chatTypeSecret")) {
        return getReactiveUser(type.user_id);
    }
    return undefined;
});

const posterName = computed(() => {
    if (posterUser.value) {
        const u = posterUser.value;
        return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || "故事";
    }
    if (posterChat.value) return posterChat.value.title || "故事";
    return "故事";
});

const posterPhoto = computed<chatPhotoInfo | profilePhoto | undefined>(() => {
    if (posterUser.value?.profile_photo) return posterUser.value.profile_photo;
    if (posterChat.value?.photo) return posterChat.value.photo;
    return undefined;
});

const posterAccentId = computed(() => {
    if (posterUser.value) return posterUser.value.accent_color_id;
    if (posterChat.value) return posterChat.value.accent_color_id;
    return undefined;
});

const posterInitial = computed(() => posterName.value.trim().charAt(0) || "?");

const relativeTime = computed(() =>
    current.value ? formatStoryRelativeTime(current.value.date) : ""
);

const isLiveStory = computed(() => currentKind.value === "live");

const isAnimationVideo = computed(() => {
    const c = current.value?.content;
    return c?._ === "storyContentVideo" && !!c.video.is_animation;
});

/** 副标题：直播不显示时间；非直播显示相对时间，无时间则显示序号 2/5 */
const subtitleText = computed(() => {
    if (isLiveStory.value) return "";
    const st = current.value;
    if (!st) return "";
    if (st.date) return relativeTime.value;
    return `${index.value + 1}/${items.value.length}`;
});

const captionText = computed(() => {
    const cap: formattedText | undefined = current.value?.caption;
    return cap?.text?.trim() || "";
});

const captionExpanded = ref(false);
const captionOverflow = ref(false);
const captionEl = ref<HTMLElement | null>(null);

function checkCaptionOverflow() {
    const el = captionEl.value;
    if (!el) {
        captionOverflow.value = false;
        return;
    }
    // 折叠态约 2 行：scrollHeight 明显大于 clientHeight 即视为溢出
    captionOverflow.value = el.scrollHeight > el.clientHeight + 2;
}

function onCaptionClick() {
    if (!captionOverflow.value && !captionExpanded.value) return;
    captionExpanded.value = !captionExpanded.value;
    if (!captionExpanded.value) {
        void nextTick(checkCaptionOverflow);
    }
}

const viewCount = computed(() => {
    if (localViewBump.value) {
        return (current.value?.interaction_info?.view_count ?? 0) + 1;
    }
    return current.value?.interaction_info?.view_count ?? 0;
});

const viewCountLabel = computed(() => formatStoryCount(viewCount.value));

const reactionCount = computed(() => current.value?.interaction_info?.reaction_count ?? 0);

const recentViewerIds = computed(() =>
    current.value?.interaction_info?.recent_viewer_user_ids ?? []
);

/** 最近观看者：加载 user 缓存后取真实头像/姓名 */
function recentViewerPhoto(uid: number) {
    return getReactiveUser(uid)?.profile_photo;
}
function recentViewerName(uid: number): string {
    const u = getReactiveUser(uid);
    if (!u) return String(uid);
    return [u.first_name, u.last_name].filter(Boolean).join(" ").trim() || String(uid);
}
function recentViewerAccent(uid: number): number | undefined {
    return getReactiveUser(uid)?.accent_color_id;
}
async function ensureRecentViewers() {
    await Promise.all(
        recentViewerIds.value.slice(0, 3).map((uid) => ensureUser(uid).catch(() => { }))
    );
}

const userStore = useUserStore();
const myUserId = computed(() => userStore.userProfile?.id);

/** 是否是自己发布的普通故事（非直播） */
const isMyStory = computed(() => {
    if (isLiveStory.value) return false;
    const u = posterUser.value;
    return !!u && !!myUserId.value && u.id === myUserId.value;
});

/** 发布者是否为 Bot */
const isPosterBot = computed(() => posterUser.value?.type?._ === "userTypeBot");

/** 频道 / 超级群故事 */
const isChannelOrGroupStory = computed(() => {
    const t = posterChat.value?.type;
    return t?._ === "chatTypeSupergroup";
});

/**
 * 互动栏类型（对齐 Unigram StoriesWindow）：
 * - none: Bot 故事 / 无内容
 * - my: 自己的普通故事（观看者 + 观看数 + 点赞 + 删除）
 * - live: 直播故事
 * - channel: 频道/超级群，或不可回复（观看 + 分享 + 反应）
 * - reply: 别人的可回复故事（回复输入框）
 */
type InteractionKind = "none" | "my" | "live" | "channel" | "reply";

const interactionKind = computed<InteractionKind>(() => {
    const st = current.value;
    if (!st) return "none";
    if (isPosterBot.value) return "none";
    if (isLiveStory.value) return "live";
    if (isMyStory.value) return "my";
    if (isChannelOrGroupStory.value || !st.can_be_replied) return "channel";
    return "reply";
});

const showInteractionBar = computed(() => interactionKind.value !== "none");

/** 自己的故事：观看文案 */
const viewsLabel = computed(() => {
    if (viewCount.value > 0) return `${formatStoryCount(viewCount.value)} 观看`;
    return "暂无观看";
});

const replyText = ref("");
const liveReplyText = ref("");

async function onDeleteStory() {
    const st = current.value;
    if (!st || !st.can_be_deleted) return;
    try {
        await tdlibSend({
            _: "deleteStory",
            story_poster_chat_id: st.poster_chat_id,
            story_id: st.id,
        });
        // 从列表移除并切换
        const removedId = st.id;
        const nextItems = items.value.filter((s) => s.id !== removedId);
        if (!nextItems.length) {
            close();
            return;
        }
        const nextIdx = Math.min(index.value, nextItems.length - 1);
        items.value = nextItems;
        index.value = nextIdx;
        MessagePlugin.success("已删除动态");
    } catch (e) {
        console.warn("[StoryViewer] deleteStory failed", e);
        MessagePlugin.error("删除失败");
    }
}

async function onSendReply() {
    const st = current.value;
    const text = replyText.value.trim();
    if (!st || !text) return;
    try {
        await tdlibSend({
            _: "sendMessage",
            chat_id: st.poster_chat_id,
            input_message_content: {
                _: "inputMessageText",
                text: { _: "formattedText", text, entities: [] },
                clear_draft: true,
            },
            reply_to: {
                _: "inputMessageReplyToStory",
                story_poster_chat_id: st.poster_chat_id,
                story_id: st.id,
            },
        });
        replyText.value = "";
        MessagePlugin.success("已发送回复");
    } catch (e) {
        console.warn("[StoryViewer] send reply failed", e);
        MessagePlugin.error("发送失败");
    }
}

async function onSendLiveReply() {
    // 直播消息通道依赖 groupCall 实时流，这里先按普通聊天回复故事尝试发送
    const st = current.value;
    const text = liveReplyText.value.trim();
    if (!st || !text) return;
    try {
        await tdlibSend({
            _: "sendMessage",
            chat_id: st.poster_chat_id,
            input_message_content: {
                _: "inputMessageText",
                text: { _: "formattedText", text, entities: [] },
                clear_draft: true,
            },
        });
        liveReplyText.value = "";
        MessagePlugin.success("已发送");
    } catch (e) {
        console.warn("[StoryViewer] send live reply failed", e);
        MessagePlugin.error("发送失败");
    }
}

const phoneClass = computed(() => {
    // 竖屏手机框：高度优先，宽度按 9:16 收敛
    return "story-phone-frame";
});

/** 进度条分段宽度 */
function segmentWidth(i: number): string {
    if (i < index.value) return "100%";
    if (i > index.value) return "0%";
    if (currentKind.value === "video") {
        if (!videoDurationSec.value) return `${videoProgress.value * 100}%`;
        return `${Math.min(1, videoProgress.value) * 100}%`;
    }
    if (currentKind.value === "photo") {
        return `${Math.min(1, photoProgress.value) * 100}%`;
    }
    return "0%";
}

// ==================== 媒体加载 ====================

/** 按面积从大到小排序的有效照片尺寸 */
function sortedPhotoSizes(photo: photo) {
    return (photo.sizes ?? [])
        .filter((sz) => !!sz.photo)
        .sort((a, b) => b.width * b.height - a.width * a.height);
}

/** 已下载完成的最大照片尺寸 URL：加载阶段优先用高清图，而不是糊的 minithumbnail */
function pickReadyPhotoUrl(photo: photo): { url: string; area: number } | undefined {
    for (const sz of sortedPhotoSizes(photo)) {
        const f = sz.photo;
        if (f && isFileReady(f) && f.local.path) {
            return { url: convertFileSrc(f.local.path), area: sz.width * sz.height };
        }
    }
    return undefined;
}

/** minithumbnail：仅在没有任何可用尺寸时兜底 */
function pickThumbDataUrl(st: story): string {
    const c = st.content;
    if (!c) return "";
    if (c._ === "storyContentPhoto" && c.photo.minithumbnail?.data) {
        return `data:image/jpeg;base64,${c.photo.minithumbnail.data}`;
    }
    if (c._ === "storyContentVideo") {
        if (c.video.minithumbnail?.data) return `data:image/jpeg;base64,${c.video.minithumbnail.data}`;
    }
    return "";
}

async function ensureFileUrl(f: file | undefined, name: string): Promise<string | undefined> {
    if (!f?.id) return undefined;
    if (isFileReady(f)) return convertFileSrc(f.local.path!);
    if (downloadingFiles.has(f.id)) {
        // 轮询等待
        for (let i = 0; i < 80; i++) {
            await new Promise((r) => setTimeout(r, 150));
            if (isFileReady(f)) return convertFileSrc(f.local.path!);
        }
        return undefined;
    }
    try {
        const res = (await tdlibSend({
            _: "downloadFile",
            file_id: f.id,
            priority: DL_PRIORITY.USER_PLAYING,
            offset: 0,
            limit: 0,
            synchronous: true,
        })) as file;
        if (isFileReady(res)) return convertFileSrc(res.local.path!);
    } catch (e) {
        console.warn("[StoryViewer] download failed", name, e);
    }
    return undefined;
}

async function loadCurrentMedia() {
    stopPhotoTimer();
    currentSrc.value = "";
    currentThumb.value = "";
    photoProgress.value = 0;
    videoProgress.value = 0;
    videoDurationSec.value = 0;
    loadingMedia.value = false;
    localViewBump.value = false;
    captionExpanded.value = false;
    captionOverflow.value = false;
    replyText.value = "";
    liveReplyText.value = "";

    const st = current.value;
    if (!st) return;
    const c = st.content;
    if (!c) return;

    // 上报已读
    void markOpened(st);

    if (c._ === "storyContentPhoto") {
        const sizes = sortedPhotoSizes(c.photo);
        const best = sizes[0]?.photo;
        const bestArea = sizes[0] ? sizes[0].width * sizes[0].height : 0;

        // 1) 已有任意高清尺寸 → 立即展示，不走糊图
        const ready = pickReadyPhotoUrl(c.photo);
        if (ready) {
            currentSrc.value = ready.url;
            currentThumb.value = "";
        } else {
            // 2) 完全没有就绪尺寸时，才用 minithumbnail 兜底
            currentThumb.value = pickThumbDataUrl(st);
        }

        // 需要下载最大图（无就绪图，或就绪图不是最大尺寸）
        const needDownload = !!best && (!ready || ready.area < bestArea);
        loadingMedia.value = needDownload && !ready;
        if (needDownload && best) {
            const url = await ensureFileUrl(best, `story_photo_${st.id}`);
            loadingMedia.value = false;
            if (index.value !== items.value.findIndex((x) => x.id === st.id)) return;
            if (url) {
                if (currentSrc.value !== url) {
                    currentSrc.value = url;
                    currentThumb.value = "";
                }
            } else if (!currentSrc.value) {
                // 完全失败仍启动计时，避免卡死
                startPhotoTimer();
            }
        } else {
            loadingMedia.value = false;
        }
    } else if (c._ === "storyContentVideo") {
        const f = c.video.video;
        // 视频已就绪：直接播；否则用官方缩略图（非 minithumbnail）作封面
        if (f && isFileReady(f) && f.local.path) {
            currentSrc.value = convertFileSrc(f.local.path);
            currentThumb.value = "";
        } else {
            const th = c.video.thumbnail;
            if (th?._ === "thumbnail" && th.file && isFileReady(th.file) && th.file.local.path) {
                currentThumb.value = convertFileSrc(th.file.local.path);
            } else {
                currentThumb.value = pickThumbDataUrl(st);
            }
        }

        loadingMedia.value = !!f && !currentSrc.value;
        const url = await ensureFileUrl(f, `story_video_${st.id}`);
        loadingMedia.value = false;
        if (index.value !== items.value.findIndex((x) => x.id === st.id)) return;
        if (url) {
            currentSrc.value = url;
            await nextTick();
            const el = videoRef.value;
            if (el) {
                el.muted = muted.value;
                try {
                    await el.play();
                } catch {
                    /* 自动播放被拦截：等用户手势 */
                }
            }
        }
    }
}

function onMediaReady() {
    if (currentKind.value === "photo") {
        startPhotoTimer();
    }
}

// ==================== 照片计时 ====================

function stopPhotoTimer() {
    if (photoTimer !== null) {
        window.clearTimeout(photoTimer);
        photoTimer = null;
    }
    if (photoRaf !== null) {
        cancelAnimationFrame(photoRaf);
        photoRaf = null;
    }
}

function startPhotoTimer() {
    stopPhotoTimer();
    photoStart = performance.now();
    photoPausedAt = 0;
    const tick = () => {
        if (holdPaused) {
            photoRaf = requestAnimationFrame(tick);
            return;
        }
        const elapsed = performance.now() - photoStart;
        photoProgress.value = Math.min(1, elapsed / PHOTO_DURATION_MS);
        if (photoProgress.value >= 1) {
            goNext();
            return;
        }
        photoRaf = requestAnimationFrame(tick);
    };
    photoRaf = requestAnimationFrame(tick);
}

function pausePhotoTimer() {
    if (photoRaf !== null) {
        cancelAnimationFrame(photoRaf);
        photoRaf = null;
    }
    photoPausedAt = performance.now();
}

function resumePhotoTimer() {
    if (photoPausedAt) {
        photoStart += performance.now() - photoPausedAt;
        photoPausedAt = 0;
    }
    if (photoRaf === null && currentKind.value === "photo" && currentSrc.value) {
        const tick = () => {
            if (holdPaused) {
                photoRaf = requestAnimationFrame(tick);
                return;
            }
            const elapsed = performance.now() - photoStart;
            photoProgress.value = Math.min(1, elapsed / PHOTO_DURATION_MS);
            if (photoProgress.value >= 1) {
                goNext();
                return;
            }
            photoRaf = requestAnimationFrame(tick);
        };
        photoRaf = requestAnimationFrame(tick);
    }
}

// ==================== 视频事件 ====================

function onVideoTimeUpdate() {
    const el = videoRef.value;
    if (!el || !el.duration) return;
    videoDurationSec.value = el.duration;
    videoProgress.value = el.currentTime / el.duration;
}

function onVideoLoaded() {
    const el = videoRef.value;
    if (!el) return;
    videoDurationSec.value = el.duration || 0;
    el.muted = muted.value;
    void el.play().catch(() => { });
}

function onVideoEnded() {
    goNext();
}

// ==================== 导航 ====================

function goNext() {
    if (index.value >= items.value.length - 1) {
        close();
        return;
    }
    index.value += 1;
}

function goPrev() {
    // 进度超过 15% 时先重播当前
    if (currentKind.value === "photo" && photoProgress.value > 0.15) {
        startPhotoTimer();
        return;
    }
    if (currentKind.value === "video") {
        const el = videoRef.value;
        if (el && el.currentTime > 1.5) {
            el.currentTime = 0;
            void el.play().catch(() => { });
            return;
        }
    }
    if (index.value <= 0) {
        startPhotoTimer();
        return;
    }
    index.value -= 1;
}

function close() {
    void markClosed();
    stopPhotoTimer();
    const el = videoRef.value;
    if (el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
    }
    closeStoryViewer();
}

// ==================== TDLib 上报 ====================

async function markOpened(st: story) {
    try {
        if (openStoryId !== null && openStoryId !== st.id) {
            await tdlibSend({
                _: "closeStory",
                story_poster_chat_id: st.poster_chat_id,
                story_id: openStoryId,
            }).catch(() => { });
        }
        await tdlibSend({
            _: "openStory",
            story_poster_chat_id: st.poster_chat_id,
            story_id: st.id,
        });
        openStoryId = st.id;
        localViewBump.value = true;
    } catch {
        /* ignore */
    }
}

async function markClosed() {
    const st = current.value;
    if (!st || openStoryId === null) return;
    try {
        await tdlibSend({
            _: "closeStory",
            story_poster_chat_id: st.poster_chat_id,
            story_id: openStoryId,
        });
    } catch {
        /* ignore */
    }
    openStoryId = null;
}

// ==================== 交互 ====================

function toggleMute() {
    muted.value = !muted.value;
    const el = videoRef.value;
    if (el) el.muted = muted.value;
}

async function toggleLike() {
    const st = current.value;
    if (!st) return;
    const next = !isLiked.value;
    isLiked.value = next;
    try {
        await tdlibSend({
            _: "setStoryReaction",
            story_poster_chat_id: st.poster_chat_id,
            story_id: st.id,
            reaction_type: next
                ? { _: "reactionTypeEmoji", emoji: "❤️" }
                : (null as never),
            update_recent_reactions: true,
        });
    } catch (e) {
        isLiked.value = !next;
        console.warn("[StoryViewer] setStoryReaction failed", e);
        MessagePlugin.error("回应失败");
    }
}

function onShare() {
    const st = current.value;
    if (!st) return;
    MessagePlugin.info("可在聊天中转发该动态链接");
}

function onViewsClick() {
    const st = current.value;
    if (!st) return;
    MessagePlugin.info(`浏览 ${formatStoryCount(viewCount.value)}`);
}

function onMoreClick(e: MouseEvent) {
    const st = current.value;
    if (!st) return;
    const itemsMenu: ContextMenuItem[] = [
        {
            key: "copy-caption",
            label: "复制文案",
            icon: CopyIcon,
            onClick: () => {
                if (captionText.value) {
                    void navigator.clipboard.writeText(captionText.value);
                    MessagePlugin.success("已复制");
                }
            },
        },
        {
            key: "copy-link",
            label: "复制链接",
            icon: LinkIcon,
            onClick: () => {
                const user = posterUser.value;
                const uname = user?.usernames?.active_usernames?.[0];
                if (uname) {
                    const link = `https://t.me/${uname}/s${st.id}`;
                    void navigator.clipboard.writeText(link);
                    MessagePlugin.success("已复制链接");
                } else {
                    MessagePlugin.warning("该账号没有公开用户名");
                }
            },
        },
        {
            key: "mute",
            label: muted.value ? "打开声音" : "静音",
            icon: SoundIcon,
            onClick: toggleMute,
            // 照片故事无静音；动画视频不可切换声音
            disabled: currentKind.value !== "video" || isAnimationVideo.value,
        },
        {
            key: "close",
            label: "关闭",
            icon: CloseIcon,
            onClick: close,
        },
    ];
    openContextMenu(e.clientX, e.clientY, itemsMenu, e.target as HTMLElement);
}

// 手势：点按左右切换 / 长按暂停
function onPointerDown(e: PointerEvent) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    pointerDownX = e.clientX;
    pointerDownY = e.clientY;
    pointerDownT = performance.now();
    didHold = false;
    if (holdTimer !== null) window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(() => {
        didHold = true;
        holdPaused = true;
        if (currentKind.value === "photo") pausePhotoTimer();
        const el = videoRef.value;
        if (el) el.pause();
    }, 220);
}

function onPointerUp(e: PointerEvent) {
    if (holdTimer !== null) {
        window.clearTimeout(holdTimer);
        holdTimer = null;
    }
    if (holdPaused) {
        holdPaused = false;
        if (currentKind.value === "photo") resumePhotoTimer();
        const el = videoRef.value;
        if (el) void el.play().catch(() => { });
        return;
    }
    if (didHold) return;

    const dx = e.clientX - pointerDownX;
    const dy = e.clientY - pointerDownY;
    if (Math.abs(dx) > HOLD_SLOP || Math.abs(dy) > HOLD_SLOP) return;
    if (performance.now() - pointerDownT > 400) return;

    const rect = phoneRef.value?.getBoundingClientRect();
    if (!rect) return;
    const rel = (e.clientX - rect.left) / rect.width;
    if (rel < 0.35) goPrev();
    else goNext();
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
        e.preventDefault();
        close();
    } else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        goNext();
    } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
    } else if (e.key === "m" || e.key === "M") {
        toggleMute();
    }
}

// ==================== 生命周期 ====================

watch(
    () => [visible.value, index.value] as const,
    async ([vis]) => {
        if (!vis) {
            stopPhotoTimer();
            holdPaused = false;
            isStoryViewerActive.value = false;
            document.body.style.overflow = "";
            return;
        }
        isStoryViewerActive.value = true;
        document.body.style.overflow = "hidden";
        await nextTick();
        rootRef.value?.focus();
        // 确保 poster 信息可用
        const st = current.value;
        if (st?.poster_chat_id) {
            void ensureChat(st.poster_chat_id).then(() => {
                const chat = getReactiveChat(st.poster_chat_id);
                const type = chat?.type;
                if (type && (type._ === "chatTypePrivate" || type._ === "chatTypeSecret")) {
                    void ensureUser(type.user_id);
                }
            });
        }
        // 初始化 like 状态
        isLiked.value = !!st?.chosen_reaction_type;
        await loadCurrentMedia();
        if (interactionKind.value === "my") {
            void ensureRecentViewers();
        }
        await nextTick();
        checkCaptionOverflow();
    },
    { immediate: true }
);

onBeforeUnmount(() => {
    stopPhotoTimer();
    if (holdTimer !== null) window.clearTimeout(holdTimer);
    document.body.style.overflow = "";
    void markClosed();
});
</script>

<style scoped>
/* 外层列布局：宽度跟随手机框（预留底栏高度，边距收紧） */
.story-layout {
    width: min(400px, 94vw, calc((86vh - 56px) * 720 / 1280));
}

/* Telegram 故事标准尺寸 720×1280，固定 9:16 */
.story-phone-frame {
    aspect-ratio: 720 / 1280;
    width: 100%;
    height: auto;
    border-radius: 10px;
}

.story-bottom-bar {
    border-radius: 9999px;
}

/* CaptionRoot：底部黑色渐变 + 两行折叠 */
.story-caption-root {
    background: transparent;
}

.story-caption-gradient {
    background: linear-gradient(to top,
            rgba(0, 0, 0, 0.72) 0%,
            rgba(0, 0, 0, 0.45) 45%,
            rgba(0, 0, 0, 0) 100%);
}

.story-caption-text {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
    white-space: pre-wrap;
    word-break: break-word;
}

.story-caption-clamp {
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

@media (max-height: 700px) {
    .story-layout {
        width: min(400px, 94vw, calc((92vh - 52px) * 720 / 1280));
    }
}

.story-fade-enter-active,
.story-fade-leave-active {
    transition: opacity 0.22s ease;
}

.story-fade-enter-from,
.story-fade-leave-to {
    opacity: 0;
}
</style>
