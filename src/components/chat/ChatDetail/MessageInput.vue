<template>
    <div class="p-5 bg-transparent" @dragover.prevent @drop.prevent="onDrop">
        <!-- 回复目标气泡 -->
        <Transition name="mi-fade">
            <div v-if="replyTarget"
                class="flex items-start gap-2 mb-2 mx-1 px-3 py-2 rounded-2xl bg-white/70 dark:bg-gray-800/90 shadow-sm border border-gray-200/60 dark:border-gray-700/60">
                <CornerUpLeftIcon class="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
                <div class="min-w-0 flex-1">
                    <p class="text-xs font-semibold text-blue-500 truncate">{{ replyTarget.title }}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ replyTarget.text || '（无文本内容）' }}</p>
                </div>
                <button type="button" aria-label="取消回复"
                    class="w-6 h-6 shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                    @click="emit('clearReply')">
                    <XIcon class="w-3.5 h-3.5" />
                </button>
            </div>
        </Transition>

        <!-- 附件扩展菜单 -->
        <Teleport to="body">
            <Transition name="attach-fade">
                <div v-if="attachOpen" class="fixed z-50" :style="attachMenuStyle" @click.self="attachOpen = false">
                    <div ref="attachPanelRef"
                        class="w-fit min-w-32 whitespace-nowrap rounded-lg bg-white dark:bg-gray-800/95 backdrop-blur-md shadow-xl border border-gray-200/60 dark:border-gray-700/60 p-0.5">
                        <template v-for="item in attachItems" :key="item.key">
                            <button v-if="!item.hidden" type="button"
                                class="w-full flex items-center gap-2 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/60 text-left transition-colors"
                                @click="onAttachItemClick(item)">
                                <component :is="item.icon" class="w-4 h-4 shrink-0 text-gray-800 dark:text-gray-100" />
                                <span class="text-[13px] font-medium text-gray-800 dark:text-gray-100">
                                    {{ item.label }}
                                </span>
                                <span v-if="item.hint"
                                    class="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                                    {{ item.hint }}
                                </span>
                            </button>
                        </template>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- 附件待发送栏：可拖拽重排、点击选中并单独编辑描述 -->
        <Transition name="att-tray">
            <div v-show="attachmentStore.items.length > 0"
                class="mb-2 mx-1 max-h-72 overflow-y-auto message-input-scrollbar rounded-xl bg-white/60 dark:bg-gray-900/50 p-2">
                <VueDraggable v-model="draggableList" :animation="150" ghost-class="att-drag-ghost" :filter="'.no-drag'"
                    class="flex flex-wrap gap-2">
                    <template v-for="it in draggableList" :key="it.id">
                        <div :data-att-id="it.id" :title="`${it.name} · ${formatSize(it.size)}`" :class="[
                            'group relative w-16 h-16 rounded-lg overflow-hidden shrink-0 cursor-grab active:cursor-grabbing ring-2 transition-shadow',
                            selectedId === it.id
                                ? 'ring-blue-500 ring-offset-1 dark:ring-offset-gray-900'
                                : 'ring-transparent hover:ring-gray-300 dark:hover:ring-gray-600'
                        ]" @click="selectItem(it.id)">
                            <!-- 预览缩略图 -->
                            <img v-if="it.kind === 'photo' || it.kind === 'animation'" :src="previewSrc(it)"
                                draggable="false" class="w-full h-full object-cover"
                                @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
                                @click.stop="selectItem(it.id)" />
                            <video v-else-if="it.kind === 'video'" :src="previewSrc(it)" muted preload="metadata"
                                draggable="false" class="w-full h-full object-cover"
                                @click.stop="selectItem(it.id)"></video>
                            <div v-else
                                class="w-full h-full flex items-center justify-center bg-gray-200 dark:bg-gray-700">
                                <FileIcon class="w-5 h-5 text-gray-500 dark:text-gray-400" />
                            </div>
                            <!-- 视频播放标记 -->
                            <span v-if="it.kind === 'video'"
                                class="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
                                <svg viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-white">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            </span>
                            <!-- 有独立描述时的小角标 -->
                            <span v-if="(it.caption || '').trim()"
                                class="absolute top-0 right-0 w-3.5 h-3.5 bg-blue-500 rounded-bl-md flex items-center justify-center pointer-events-none">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                                    class="w-2 h-2 text-white">
                                    <path d="M4 5h16M4 12h16M4 19h10" />
                                </svg>
                            </span>
                            <!-- 移除 -->
                            <button type="button" aria-label="移除附件" title="移除"
                                class="no-drag absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-black/50 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                @click.stop="attachmentStore.remove(it.id)">
                                <XIcon class="w-3 h-3" />
                            </button>
                            <!-- 序号 -->
                            <span
                                class="absolute bottom-0.5 left-0.5 px-1 rounded bg-black/50 text-white text-[9px] leading-tight pointer-events-none">
                                {{ indexOf(it.id) }}
                            </span>
                        </div>
                    </template>
                </VueDraggable>

                <!-- 选中文件的独立描述输入 -->
                <div v-if="selectedItem" class="mt-2 flex items-center gap-2">
                    <input v-model="selectedCaption" :placeholder="`${selectedItem.name} 的描述`"
                        class="flex-1 min-w-0 rounded-lg bg-white/80 dark:bg-gray-800 px-2.5 py-1.5 text-xs text-gray-800 dark:text-gray-200 outline-none focus:ring-1 focus:ring-blue-500"
                        @input="onCaptionInput" @keydown.enter.exact.prevent @keydown.enter.shift.stop />
                    <span class="text-[11px] text-gray-400 dark:text-gray-500 shrink-0">{{ selectedItem.name }}</span>
                </div>
            </div>
        </Transition>

        <div
            class="flex items-end gap-3 bg-white/60 dark:bg-gray-900/80 backdrop-blur-md px-2 rounded-4xl shadow-lg border border-gray-200/50 dark:border-gray-700/50">
            <!-- 文件选择（左侧） -->
            <div class="shrink-0 mb-1.5 relative">
                <input ref="fileInput" type="file" class="hidden" />
                <button ref="attachBtnRef" type="button" aria-label="添加附件" :class="[
                    'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                    attachOpen
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500'
                ]" @click="toggleAttach">
                    <PaperclipIcon class="w-5 h-5" />
                </button>
            </div>

            <!-- 中间输入容器（圆角样式）：min-w-0 防止长单行文本把 flex 撑开，右侧按钮被顶出可视区 -->
            <div class="flex-1 min-w-0 rounded-full dark:bg-gray-800 flex items-center px-2 my-2">
                <textarea v-model="localValue" :placeholder="inputPlaceholder"
                    class="message-input-scrollbar flex-1 min-w-0 bg-transparent resize-none focus:outline-none text-sm leading-5 text-gray-800 dark:text-gray-200 px-2 py-2 min-h-9 max-h-40 overflow-y-auto field-sizing-content"
                    rows="1" @keydown.enter.exact.prevent="onEnter" @keydown.enter.shift.stop
                    @paste="onPaste"></textarea>
            </div>

            <!-- 右侧操作：去掉命令(/)，保留贴纸和语言输入，shrink-0 防止被挤压 -->
            <div class="flex items-center gap-2 ml-2 mb-1.5 shrink-0">
                <button @click="$emit('sticker')" type="button" aria-label="贴纸"
                    class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500">
                    <Smile class="w-5 h-5" />
                </button>
                <button @click="onClickSend" type="button" aria-label="发送" :disabled="sending"
                    class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-blue-500 text-gray-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-default">
                    <SendIcon class="w-5 h-5" />
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import type { chat, ChatMemberStatus, user } from 'tdlib-types';
import { MessagePlugin } from 'tdesign-vue-next';
import {
    PaperclipIcon, Smile, SendIcon, CornerUpLeftIcon, XIcon,
    ImageIcon, FileIcon, MusicIcon, ListIcon, BarChart2Icon, UserIcon,
} from 'lucide-vue-next';
import {
    canSendPhotoRights, canSendDocumentRights, canSendAudioRights,
    canSendMessageRights, canSendPollRights, canSendChecklistRights,
} from './composables/permissions';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { VueDraggable } from 'vue-draggable-plus';
import { useAttachmentStore, getFileSize } from '../../../store/attachment';
import { classifyAttachment, sending } from '../../../utils/attachmentSend';
import { isInAlbum } from '../../../utils/attachmentHelpers';
import type { AttachmentItem } from '../../../store/attachment';

/** 回复目标摘要 */
export interface ReplyTarget {
    /** 发送者标题（名称） */
    title: string;
    /** 内容摘要（纯文本） */
    text: string;
}

/** 附件菜单项标识 */
export type AttachAction =
    | 'photo'
    | 'file'
    | 'music'
    | 'checklist'
    | 'poll'
    | 'contact'
    | 'location';

const props = defineProps<{
    modelValue?: string;
    placeholder?: string;
    replyTarget?: ReplyTarget | null;
    /** 当前聊天（用于权限判断） */
    chat?: chat;
    /** 用户缓存（user_id → user，用于私聊对方 bot 判断） */
    users?: Record<number, user>;
    /** 超群缓存（用于权限判断） */
    supergroups?: Record<number, import('tdlib-types').supergroup>;
    /** 基础群缓存（用于权限判断） */
    basicGroups?: Record<number, import('tdlib-types').basicGroup>;
    /** 当前用户 id（用于 Saved Messages 判断） */
    myId?: number;
    /** 当前成员状态（受限时的权限来源） */
    memberStatus?: ChatMemberStatus;
    /** 当前用户是否 Premium */
    isPremium?: boolean;
    /** 是否可购买 Premium（未知时默认 true） */
    isPremiumAvailable?: boolean;
}>();

const emit = defineEmits([
    'update:modelValue', 'send', 'sticker', 'language', 'attach', 'clearReply',
    'attachPhoto', 'attachFile', 'attachMusic', 'attachChecklist', 'attachPoll',
    'attachContact', 'attachLocation',
]);

const localValue = ref(props.modelValue || '');

watch(() => props.modelValue, (v) => {
    if (v !== localValue.value) localValue.value = v || '';
});

watch(localValue, (v) => emit('update:modelValue', v));

// ==================== 附件收集（图片/视频/相册/粘贴）====================
const attachmentStore = useAttachmentStore();

/** 底部输入框在有附件时变为「描述」 */
const inputPlaceholder = computed(() =>
    attachmentStore.items.length > 0 ? '描述' : (props.placeholder || '输入消息...'));

function formatSize(bytes: number): string {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = bytes;
    let u = 0;
    while (v >= 1024 && u < units.length - 1) { v /= 1024; u++; }
    return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

/** 生成本地文件的 asset URL 用于预览 */
function previewSrc(it: AttachmentItem): string {
    return convertFileSrc(it.path);
}

// ==================== 选中文件 + 独立描述 + 拖拽重排 ====================
/** 当前选中的附件 id（点击缩略图高亮） */
const selectedId = ref<string | null>(null);
/** 选中项的临时描述输入 */
const selectedCaption = ref('');

const selectedItem = computed<AttachmentItem | null>(() =>
    selectedId.value ? attachmentStore.items.find((i) => i.id === selectedId.value) ?? null : null);

/** 缩略图上的序号（1 起） */
function indexOf(id: string): number {
    return attachmentStore.items.findIndex((i) => i.id === id) + 1;
}

function selectItem(id: string) {
    if (selectedId.value === id) {
        // 点击已选中项 → 取消选中
        selectedId.value = null;
        selectedCaption.value = '';
        return;
    }
    selectedId.value = id;
    selectedCaption.value = attachmentStore.items.find((i) => i.id === id)?.caption ?? '';
}

/** 描述输入变化时实时写入附件项 */
function onCaptionInput() {
    if (selectedId.value) {
        attachmentStore.setCaption(selectedId.value, selectedCaption.value);
    }
}

// ---- 拖拽重排（vue-draggable-plus）----
// 用 <VueDraggable v-model="draggableList"> 组件。
// getter 返回 store 数组的【副本】（新的数组引用），这样增删附件时 modelValue
// 引用变化会触发组件重渲染（若返回同一引用，添加附件后内容不会出现）；
// setter 把排序结果就地写回 store，避免破坏 Pinia 响应式。
const draggableList = computed<AttachmentItem[]>({
    get: () => [...attachmentStore.items],
    set: (val) => {
        attachmentStore.items.splice(0, attachmentStore.items.length, ...val);
    },
});

// 选中项被移除 / 列表清空时，同步清除选中状态
watch(() => attachmentStore.items, () => {
    if (selectedId.value && !attachmentStore.items.some((i) => i.id === selectedId.value)) {
        selectedId.value = null;
        selectedCaption.value = '';
    }
}, { deep: true });

/** 打开系统文件选择器并添加图片/视频（返回选中路径数组） */
async function pickMediaFiles(): Promise<string[]> {
    try {
        const selected = await open({
            multiple: true,
            title: '选择图片和视频',
            // 单个合并过滤器，让图片和视频在文件选择器中一起显示
            filters: [{
                name: '图片和视频',
                extensions: [
                    'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'heic', 'heif',
                    'mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'mpeg', 'mpg', 'wmv', 'flv', '3gp', 'ogv',
                ],
            }],
        });
        if (!selected) return [];
        return Array.isArray(selected) ? selected : [selected];
    } catch {
        return [];
    }
}

function baseName(path: string): string {
    const norm = path.replace(/\\/g, '/');
    const idx = norm.lastIndexOf('/');
    return idx >= 0 ? norm.slice(idx + 1) : norm;
}

/** 分类并加入附件列表（含相册模式 / 大小 / GIF 处理） */
async function addFile(path: string, name: string, tempFile = false) {
    const size = await getFileSize(path);
    const album = isInAlbum(attachmentStore.items);
    const result = await classifyAttachment({
        path, name, size, album, isPremium: props.isPremium ?? false,
    });
    if (result.status === 'rejected') {
        MessagePlugin.warning(result.reason);
        if (tempFile) cleanupTemp(path);
        return;
    }
    attachmentStore.add({
        path, name, size, tempFile,
        kind: result.kind,
        width: result.width,
        height: result.height,
        duration: result.duration,
        probeFailed: result.probeFailed,
    });
    // GIF 单独发送时给出明确提示（将以动画/GIF 方式发送）
    if (result.kind === 'animation') {
        MessagePlugin.info('GIF 将以动图方式发送');
    }
}

/** 打开图片/视频选择器并批量添加 */
async function handleAttachPhoto() {
    const paths = await pickMediaFiles();
    for (const p of paths) {
        await addFile(p, baseName(p));
    }
}

const onClickSend = () => {
    if (sending.value) return;
    if (attachmentStore.items.length === 0 && !localValue.value.trim()) return;
    emit('send', localValue.value);
    localValue.value = '';
};

const onEnter = () => {
    onClickSend();
};

// ==================== 附件菜单 ====================
const attachOpen = ref(false);
const attachBtnRef = ref<HTMLElement | null>(null);
const attachPanelRef = ref<HTMLElement | null>(null);
const attachMenuStyle = ref<Record<string, string>>({});

const groupCaches = () => ({
    supergroups: props.supergroups ?? {},
    basicGroups: props.basicGroups ?? {},
});

// 私聊对方用户（用于 bot / Saved Messages 判断）
const peerUser = computed<user | undefined>(() => {
    const c = props.chat;
    if (!c) return undefined;
    if (c.type._ === 'chatTypePrivate') return props.users?.[c.type.user_id];
    if (c.type._ === 'chatTypeSecret') return props.users?.[c.type.user_id];
    return undefined;
});

const myId = computed(() => props.myId || 0);
const isPremium = computed(() => !!props.isPremium);
// Premium 是否可购买：未提供时默认 true（桌面端基本都可购买）
const isPremiumAvailable = computed(() => props.isPremiumAvailable ?? true);
const memberStatus = computed(() => props.memberStatus);

const photoRights = computed(() =>
    props.chat ? canSendPhotoRights(props.chat, memberStatus.value, groupCaches()) : true);
const documentRights = computed(() =>
    props.chat ? canSendDocumentRights(props.chat, memberStatus.value, groupCaches()) : true);
const audioRights = computed(() =>
    props.chat ? canSendAudioRights(props.chat, memberStatus.value, groupCaches()) : true);
const messageRights = computed(() =>
    props.chat ? canSendMessageRights(props.chat, memberStatus.value, groupCaches()) : true);
const pollRights = computed(() =>
    props.chat ? canSendPollRights(props.chat, memberStatus.value, groupCaches(), peerUser.value, myId.value) : true);
const checklistRights = computed(() =>
    props.chat ? canSendChecklistRights(props.chat, memberStatus.value, groupCaches(), isPremium.value, isPremiumAvailable.value) : true);

interface AttachItem {
    key: AttachAction;
    label: string;
    hint?: string;
    icon: unknown;
    hidden: boolean;
}

const attachItems = computed<AttachItem[]>(() => [
    {
        key: 'photo',
        label: '图片和视频',
        icon: ImageIcon,
        hidden: !photoRights.value,
    },
    {
        key: 'file',
        label: '文件',
        icon: FileIcon,
        hidden: !documentRights.value,
    },
    {
        key: 'music',
        label: '音乐',
        icon: MusicIcon,
        hidden: !audioRights.value,
    },
    {
        key: 'checklist',
        label: '清单',
        hint: isPremium.value ? undefined : 'Premium',
        icon: ListIcon,
        hidden: !checklistRights.value,
    },
    {
        key: 'poll',
        label: '投票',
        icon: BarChart2Icon,
        hidden: !pollRights.value,
    },
    {
        key: 'contact',
        label: '联系人',
        icon: UserIcon,
        hidden: !messageRights.value,
    },
]);

const toggleAttach = () => {
    attachOpen.value ? closeAttach() : openAttach();
};

const openAttach = async () => {
    attachOpen.value = true;
    await nextTick();
    const btn = attachBtnRef.value;
    const panel = attachPanelRef.value;
    if (btn && panel) {
        const rect = btn.getBoundingClientRect();
        const menuW = panel.offsetWidth;
        const menuH = panel.offsetHeight;
        const spaceTop = rect.top;
        const spaceBottom = window.innerHeight - rect.bottom;
        const left = Math.min(Math.max(8, rect.left), window.innerWidth - menuW - 8);
        if (spaceTop >= menuH + 8) {
            attachMenuStyle.value = { top: (rect.top - menuH - 8) + 'px', left: left + 'px' };
        } else if (spaceBottom >= menuH + 8) {
            attachMenuStyle.value = { top: (rect.bottom + 8) + 'px', left: left + 'px' };
        } else {
            attachMenuStyle.value = { top: '8px', left: left + 'px' };
        }
    }
};

const closeAttach = () => {
    attachOpen.value = false;
};

// AttachAction → emit 事件名映射（保持类型安全）
const attachEmitMap: Record<AttachAction, 'attachPhoto' | 'attachFile' | 'attachMusic' | 'attachChecklist' | 'attachPoll' | 'attachContact' | 'attachLocation'> = {
    photo: 'attachPhoto',
    file: 'attachFile',
    music: 'attachMusic',
    checklist: 'attachChecklist',
    poll: 'attachPoll',
    contact: 'attachContact',
    location: 'attachLocation',
};

const onAttachItemClick = (item: AttachItem) => {
    // 清单：非 Premium 时提示
    if (item.key === 'checklist' && !isPremium.value) {
        MessagePlugin.warning('发送清单需要 Telegram Premium');
        closeAttach();
        return;
    }
    // 图片和视频：直接打开系统文件选择器
    if (item.key === 'photo') {
        closeAttach();
        handleAttachPhoto();
        return;
    }
    emit(attachEmitMap[item.key]);
    closeAttach();
};

const onClickOutside = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (attachBtnRef.value?.contains(target)) return;
    if (attachOpen.value) {
        attachOpen.value = false;
    }
};

// ==================== 剪贴板粘贴图片 ====================
/** 根据剪贴板图片 MIME 保留真实扩展名，避免 GIF 被存成 PNG 后混入相册 */
function imageExtFromMime(type: string): string {
    const mime = type.toLowerCase();
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('bmp')) return 'bmp';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    return 'png';
}

/** 生成时间戳文件名（重名自动加后缀） */
function timestampName(now: Date, ext = 'png'): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `image_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.${ext}`;
}

/** 删除临时文件（幂等） */
async function cleanupTemp(path: string) {
    try {
        const { remove } = await import('@tauri-apps/plugin-fs');
        await remove(path);
    } catch {
        // 静默
    }
}

/** 将剪贴板图片写入临时目录，返回绝对路径；重名自动加后缀 */
async function writeClipboardImage(blob: Blob): Promise<string> {
    const { tempDir } = await import('@tauri-apps/api/path');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const dir = await tempDir();
    const buf = new Uint8Array(await blob.arrayBuffer());
    const base = timestampName(new Date(), imageExtFromMime(blob.type));
    let target = `${dir}\\${base}`.replace(/\/$/, '');
    let n = 1;
    // 重名自动加后缀
    while (true) {
        try {
            await writeFile(target, buf);
            break;
        } catch {
            const dot = base.lastIndexOf('.');
            target = `${dir}\\${base.slice(0, dot)}_${n}${base.slice(dot)}`;
            n++;
        }
    }
    return target;
}

function onPaste(e: ClipboardEvent) {
    const dt = e.clipboardData;
    if (!dt) return;
    // 若剪贴板含文件项（如复制的本地图片文件），保留原始文件名与路径
    const fileItems = Array.from(dt.files || []);
    for (const f of fileItems) {
        // 文件项有原名——但 webview 粘贴的文件项不提供本地路径，需写入临时目录沿用原名
        writeFileItemToTemp(f);
        e.preventDefault();
        return;
    }
    // 位图：生成时间戳文件名
    const items = Array.from(dt.items || []);
    const imgItem = items.find((i) => i.type.startsWith('image/'));
    if (imgItem?.getAsFile) {
        const blob = imgItem.getAsFile();
        if (blob) {
            writeClipboardImage(blob)
                .then((path) => addFile(path, baseName(path), true))
                .catch(() => { });
            e.preventDefault();
        }
    }
}

async function writeFileItemToTemp(file: File) {
    try {
        const { tempDir } = await import('@tauri-apps/api/path');
        const { writeFile } = await import('@tauri-apps/plugin-fs');
        const dir = await tempDir();
        const buf = new Uint8Array(await file.arrayBuffer());
        let target = `${dir}\\${file.name}`.replace(/\/$/, '');
        let n = 1;
        while (true) {
            try {
                await writeFile(target, buf);
                break;
            } catch {
                const dot = file.name.lastIndexOf('.');
                target = `${dir}\\${file.name.slice(0, dot)}_${n}${file.name.slice(dot)}`;
                n++;
            }
        }
        await addFile(target, file.name, true);
    } catch {
        // 静默
    }
}

/** 拖拽文件到输入区域：保留原始文件名（写入临时目录以便 TDLib 读取） */
function onDrop(e: DragEvent) {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    for (const f of arr) {
        writeFileItemToTemp(f);
    }
}

onMounted(() => document.addEventListener('click', onClickOutside, true));
onBeforeUnmount(() => {
    document.removeEventListener('click', onClickOutside, true);
});



</script>

<style scoped>
.message-input-scrollbar::-webkit-scrollbar {
    width: 4px;
}

.mi-fade-enter-active,
.mi-fade-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.mi-fade-enter-from,
.mi-fade-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

.attach-fade-enter-active,
.attach-fade-leave-active {
    transition: opacity 0.14s ease, transform 0.14s ease;
}

.attach-fade-enter-from,
.attach-fade-leave-to {
    opacity: 0;
    transform: translateY(4px) scale(0.98);
}

.att-tray-enter-active,
.att-tray-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.att-tray-enter-from,
.att-tray-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

/* vue-draggable-plus 拖拽时的幽灵占位与拖拽项样式 */
.att-drag-ghost {
    opacity: 0.4;
    pointer-events: none;
}

.att-drag-ghost * {
    pointer-events: none;
}
</style>
