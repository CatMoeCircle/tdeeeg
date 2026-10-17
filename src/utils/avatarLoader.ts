import { reactive } from 'vue';
import { convertFileSrc } from '@tauri-apps/api/core';
import { tdlibSend, isFileReady } from './tdlib';
import { DL_PRIORITY } from './downloadPriority';
import { DL_TAG } from './downloadTags';
import { enqueueViewportLoad } from './viewportLoadGate';
import { useDownloadStore, remoteIdOf } from '../store/downloads';

/**
 * 头像文件的全局单一来源：以 TDLib file.id 为键。
 * 同一页面里同一用户出现多次（群消息、成员列表、资料页…）时，所有 <Avatar> 共享这里的结果：
 * - 只向 TDLib 发一次 downloadFile（inflight 去重）；
 * - 下载完成后所有实例通过响应式 Map 同时切换到真实图片，而不是只有发起者会更新。
 * 并发上限由 viewportLoadGate 的 'avatar' 池控制。
 */
type AvatarFile = {
    id?: number;
    local: { is_downloading_completed: boolean; path?: string; can_be_downloaded?: boolean };
    remote?: { id?: string; unique_id?: string };
};

/** file.id → 已下载的 asset URL（响应式，驱动所有引用它的组件） */
const urls = reactive(new Map<number, string>());
/** 已入队或正在下载的 file.id（非响应式，仅用于去重） */
const inflight = new Set<number>();

/** 当前可用的头像 URL：已下载结果优先，其次文件本身已就绪的本地路径；都没有返回 undefined */
export function avatarUrlOf(file: AvatarFile | undefined): string | undefined {
    if (!file?.id) return undefined;
    const cached = urls.get(file.id);
    if (cached) return cached;
    if (isFileReady(file as never)) return convertFileSrc(file.local.path!);
    return undefined;
}

/** 请求下载头像（幂等）：已就绪/已在下载中/已入队则直接返回 */
export function requestAvatar(file: AvatarFile | undefined, title = ''): void {
    const id = file?.id;
    if (!file || !id || urls.has(id) || inflight.has(id)) return;
    if (isFileReady(file as never)) {
        urls.set(id, convertFileSrc(file.local.path!));
        return;
    }
    if (!file.local.can_be_downloaded) return;
    inflight.add(id);
    enqueueViewportLoad(() => downloadAvatar(file, title), 'avatar');
}

async function downloadAvatar(file: AvatarFile, title: string): Promise<void> {
    const id = file.id!;
    try {
        // 注册到下载管理器（隐藏资源）；失败不影响头像本身加载
        await useDownloadStore().registerDownload(
            id, `${title || 'avatar'}_${id}.jpg`, title, 0, 'avatar', undefined,
            undefined, undefined, true, false, 'avatar', false,
            [DL_TAG.AVATAR], title || undefined, remoteIdOf(file),
        ).catch(() => { });
        const res = await tdlibSend({
            _: 'downloadFile',
            file_id: id,
            priority: DL_PRIORITY.THUMBNAIL,
            offset: 0,
            limit: 0,
            synchronous: true,
        } as never) as { local?: { is_downloading_completed?: boolean; path?: string } };
        if (res.local?.is_downloading_completed && res.local.path) {
            urls.set(id, convertFileSrc(res.local.path));
        }
    } catch {
        // 失败：不缓存，下次进入视口时可重试
    } finally {
        inflight.delete(id);
    }
}
