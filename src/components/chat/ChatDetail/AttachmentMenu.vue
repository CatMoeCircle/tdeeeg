<template>
    <div class="shrink-0 mb-1.5 relative">
        <button ref="attachBtnRef" type="button" aria-label="添加附件" :class="[
            'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
            attachOpen
                ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200'
                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500'
        ]" @click="toggleAttach">
            <PaperclipIcon class="w-5 h-5" />
        </button>

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
    </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { chat, ChatMemberStatus, user } from 'tdlib-types';
import { MessagePlugin } from 'tdesign-vue-next';
import {
    BarChart2Icon, FileIcon, ImageIcon, ListIcon, MusicIcon, PaperclipIcon, UserIcon,
} from 'lucide-vue-next';
import { open } from '@tauri-apps/plugin-dialog';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import {
    canSendAudioRights,
    canSendChecklistRights,
    canSendDocumentRights,
    canSendMessageRights,
    canSendPhotoRights,
    canSendPollRights,
} from './composables/permissions';
import { getFileSize, useAttachmentStore } from '../../../store/attachment';
import { classifyAttachment } from '../../../utils/attachmentSend';
import { isInAlbum } from '../../../utils/attachmentHelpers';

type AttachAction =
    | 'photo'
    | 'file'
    | 'music'
    | 'checklist'
    | 'poll'
    | 'contact'
    | 'location';

const props = defineProps<{
    chat?: chat;
    users?: Record<number, user>;
    supergroups?: Record<number, import('tdlib-types').supergroup>;
    basicGroups?: Record<number, import('tdlib-types').basicGroup>;
    myId?: number;
    memberStatus?: ChatMemberStatus;
    isPremium?: boolean;
    isPremiumAvailable?: boolean;
}>();

const emit = defineEmits([
    'attachPhoto', 'attachFile', 'attachMusic', 'attachChecklist', 'attachPoll',
    'attachContact', 'attachLocation',
]);

const attachmentStore = useAttachmentStore();

function baseName(path: string): string {
    const norm = path.replace(/\\/g, '/');
    const idx = norm.lastIndexOf('/');
    return idx >= 0 ? norm.slice(idx + 1) : norm;
}

async function addFile(path: string, name: string, tempFile = false, forceDocument = false) {
    const size = await getFileSize(path);
    const album = isInAlbum(attachmentStore.items);
    const result = await classifyAttachment({
        path, name, size, album, isPremium: props.isPremium ?? false, forceDocument,
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
    if (result.kind === 'animation') {
        MessagePlugin.info('GIF 将以动图方式发送');
    }
}

async function pickMediaFiles(): Promise<string[]> {
    try {
        const selected = await open({
            multiple: true,
            title: '选择图片和视频',
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

async function handleAttachPhoto() {
    const paths = await pickMediaFiles();
    for (const p of paths) {
        await addFile(p, baseName(p));
    }
}

/** 选择任意文件（一律作为普通文档发送，不自动识别为图片/视频/音频） */
async function handleAttachFile() {
    const selected = await open({
        multiple: true,
        title: '选择文件',
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const p of paths) {
        await addFile(p, baseName(p), false, true);
    }
}

/** 选择音乐文件（音频过滤器，按扩展名分类为音乐） */
async function handleAttachMusic() {
    const selected = await open({
        multiple: true,
        title: '选择音乐',
        filters: [{
            name: '音乐',
            extensions: ['mp3', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wav', 'wma', 'amr'],
        }],
    });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const p of paths) {
        await addFile(p, baseName(p));
    }
}

const attachOpen = ref(false);
const attachBtnRef = ref<HTMLElement | null>(null);
const attachPanelRef = ref<HTMLElement | null>(null);
const attachMenuStyle = ref<Record<string, string>>({});

const groupCaches = () => ({
    supergroups: props.supergroups ?? {},
    basicGroups: props.basicGroups ?? {},
});

const peerUser = computed<user | undefined>(() => {
    const c = props.chat;
    if (!c) return undefined;
    if (c.type._ === 'chatTypePrivate') return props.users?.[c.type.user_id];
    if (c.type._ === 'chatTypeSecret') return props.users?.[c.type.user_id];
    return undefined;
});

const myId = computed(() => props.myId || 0);
const isPremium = computed(() => !!props.isPremium);
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
    if (item.key === 'checklist' && !isPremium.value) {
        MessagePlugin.warning('发送清单需要 Telegram Premium');
        closeAttach();
        return;
    }
    if (item.key === 'photo') {
        closeAttach();
        handleAttachPhoto();
        return;
    }
    if (item.key === 'file') {
        closeAttach();
        handleAttachFile();
        return;
    }
    if (item.key === 'music') {
        closeAttach();
        handleAttachMusic();
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

function imageExtFromMime(type: string): string {
    const mime = type.toLowerCase();
    if (mime.includes('gif')) return 'gif';
    if (mime.includes('webp')) return 'webp';
    if (mime.includes('bmp')) return 'bmp';
    if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
    return 'png';
}

function timestampName(now: Date, ext = 'png'): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `image_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.${ext}`;
}

async function cleanupTemp(path: string) {
    try {
        const { remove } = await import('@tauri-apps/plugin-fs');
        await remove(path);
    } catch {
        // 静默
    }
}

async function writeClipboardImage(blob: Blob): Promise<string> {
    const { tempDir } = await import('@tauri-apps/api/path');
    const { writeFile } = await import('@tauri-apps/plugin-fs');
    const dir = await tempDir();
    const buf = new Uint8Array(await blob.arrayBuffer());
    const base = timestampName(new Date(), imageExtFromMime(blob.type));
    let target = `${dir}\\${base}`.replace(/\/$/, '');
    let n = 1;
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
    const fileItems = Array.from(dt.files || []);
    for (const f of fileItems) {
        writeFileItemToTemp(f);
        e.preventDefault();
        return;
    }
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

/**
 * 处理拖拽到输入框的文件。
 *
 * 说明：WebView 的 HTML5 dataTransfer.files 只能拿到内存中的 File 对象，
 * 拿不到磁盘真实路径；若直接复制到系统 Temp 目录再发送，对大文件既低效
 * 又丢失原始路径（用户会看到路径变成 C:\...\Temp\...）。
 *
 * 因此优先使用 Tauri 原生拖拽事件（onDragDropEvent）获取真实磁盘路径后
 * 直接引用原文件发送（见 setupNativeDragDrop）。此函数仅作为
 * dragDropEnabled 未开启时的 HTML5 兜底（复制到 Temp）。
 */
function onDrop(e: DragEvent) {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    for (const f of arr) {
        writeFileItemToTemp(f);
    }
}

/** Tauri 原生拖拽监听退订函数 */
let unlistenDragDrop: (() => void) | null = null;

/**
 * 注册 Tauri 原生拖拽事件，drop 时将真实磁盘路径直接加入附件
 * （不复制到 Temp，引用原文件发送；保持用户看到的路径与所选文件一致）。
 * 需在 tauri.conf.json 将窗口 dragDropEnabled 设为 true。
 */
async function setupNativeDragDrop() {
    try {
        const unlisten = await getCurrentWebview().onDragDropEvent((event) => {
            if (event.payload.type === 'drop') {
                const paths = event.payload.paths || [];
                for (const p of paths) {
                    void addFile(p, baseName(p));
                }
            }
        });
        unlistenDragDrop = unlisten;
    } catch (e) {
        console.warn('Native drag & drop unavailable, fallback to HTML5 copy-to-temp:', e);
    }
}

onMounted(() => {
    document.addEventListener('click', onClickOutside, true);
    void setupNativeDragDrop();
});
onBeforeUnmount(() => {
    document.removeEventListener('click', onClickOutside, true);
    if (unlistenDragDrop) {
        unlistenDragDrop();
        unlistenDragDrop = null;
    }
});

defineExpose({ handleAttachPhoto, onPaste, onDrop });
</script>

<style scoped>
.attach-fade-enter-active,
.attach-fade-leave-active {
    transition: opacity 0.14s ease, transform 0.14s ease;
}

.attach-fade-enter-from,
.attach-fade-leave-to {
    opacity: 0;
    transform: translateY(4px) scale(0.98);
}
</style>
