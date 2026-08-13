import { ref, watch, type MaybeRef, toValue } from 'vue';
import type { sticker, animation } from 'tdlib-types';
import { convertFileSrc } from '@tauri-apps/api/core';
import * as pako from 'pako';
import { readFile } from '@tauri-apps/plugin-fs';
import { applyFitzpatrick } from '../../../../../utils/fitzpatrick';
import { tdlibSend, isFileReady, downloadingFiles } from '../../../../../utils/tdlib';
import { DL_PRIORITY } from '../../../../../utils/downloadPriority';
import { useDownloadStore } from '../../../../../store/downloads';

export type MediaKind = 'sticker' | 'animation';
export type MediaFormat = 'tgs' | 'webm' | 'webp' | 'mpeg4' | 'other';

/**
 * 从 sticker 或 animation 解析统一的可播放信息。
 */
export interface MediaSource {
  /** 文件对象（sticker.sticker / animation.animation） */
  file: { id: number; local: { is_downloading_completed: boolean; path?: string; can_be_downloaded?: boolean; is_downloading_active?: boolean } } | undefined;
  /** 格式字符串 */
  format: MediaFormat;
  /** 贴纸/动画宽高 */
  width: number;
  height: number;
}

function fileOf(kind: MediaKind, obj: sticker | animation) {
  return kind === 'sticker' ? (obj as sticker).sticker : (obj as animation).animation;
}

/**
 * 解析贴纸/动画的格式（从对象本身）。
 */
export function kindFormat(obj: sticker | animation, kind: MediaKind): MediaFormat {
  if (kind === 'sticker') {
    const s = obj as sticker;
    if (s.format._ === 'stickerFormatTgs') return 'tgs';
    if (s.format._ === 'stickerFormatWebm') return 'webm';
    return 'webp';
  }
  // animation
  return 'mpeg4';
}

function extFor(format: MediaFormat): string {
  if (format === 'tgs') return 'tgs';
  if (format === 'webm') return 'webm';
  if (format === 'mpeg4') return 'mp4';
  return 'webp';
}

/**
 * 表情包面板的媒体按需下载 + 播放源解析 composable。
 *
 * 封装了「TDLib DownloadFile → UpdateFile → 本地路径转换」的管线：
 *  - 未下载时下载到本地，并在下载 store 中记录为隐藏分类资源
 *  - TGS 走 readFile+pako 解压 + Fitzpatrick 肤色替换，输出 stringified JSON
 *  - webm/mpeg4/webp 通过 convertFileSrc 直接得到可播放 URL
 *
 * 返回 { src（可播放源）、format、ready、download() }。
 */
export function useStickerMedia(
  getObj: () => sticker | animation | undefined,
  kind: MediaKind,
  options: { skinTone?: MaybeRef<number> } = {}
) {
  const ready = ref(false);
  const downloading = ref(false);
  const src = ref<string | null>(null);
  const format = ref<MediaFormat>('other');

  const file = ref<any>(undefined);
  const obj = ref<sticker | animation | undefined>(undefined);

  const refresh = () => {
    const o = getObj();
    obj.value = o;
    if (!o) return;
    file.value = fileOf(kind, o);
  };
  refresh();

  watch(obj, (o) => {
    if (o) {
      file.value = fileOf(kind, o);
      // 文件状态变化时若已就绪则自动载入
      if (file.value && isFileReady(file.value)) {
        loadLocal(file.value.local.path);
      }
    }
  });

  /** 根据对象重算并触发（供 list 项在滚动进可视区时调用） */
  async function download() {
    refresh();
    const f = file.value;
    const o = obj.value;
    if (!f || !o) return;
    format.value = kindFormat(o, kind);

    if (isFileReady(f)) {
      await loadLocal(f.local.path);
      return;
    }
    if (!f.local.can_be_downloaded || f.local.is_downloading_active) return;
    if (downloading.value || downloadingFiles.has(f.id)) return;
    downloading.value = true;
    downloadingFiles.add(f.id);

    // 记录为隐藏下载资源（不占用下载面板来源展示）
    try {
      await useDownloadStore().registerDownload(
        f.id,
        `${kind}_${f.id}.${extFor(format.value)}`,
        '', 0, kind === 'sticker' ? 'sticker' : 'animation',
        undefined, undefined, undefined, true, false,
        kind === 'sticker' ? 'sticker' : 'animation',
      );
    } catch { /* 忽略注册失败 */ }

    try {
      const res = await tdlibSend({
        _: 'downloadFile',
        file_id: f.id,
        priority: DL_PRIORITY.DEFAULT,
        offset: 0,
        limit: 0,
        synchronous: true,
      });
      if (isFileReady(res)) {
        await loadLocal(res.local.path);
      }
    } catch (e) {
      // 静默回退（空源），不阻塞界面
    } finally {
      downloadingFiles.delete(f.id);
      downloading.value = false;
    }
  }

  async function loadLocal(path: string) {
    try {
      if (format.value === 'tgs') {
        const compressed = await readFile(path);
        let jsonStr: string;
        try {
          jsonStr = new TextDecoder('utf-8').decode(pako.inflate(compressed));
        } catch {
          jsonStr = new TextDecoder('utf-8').decode(compressed);
        }
        const animData = JSON.parse(jsonStr);
        const skinTone = toValue(options.skinTone) ?? 0;
        const fitzAnimData = applyFitzpatrick(animData, skinTone);
        src.value = JSON.stringify(fitzAnimData);
      } else {
        src.value = convertFileSrc(path);
      }
      ready.value = true;
    } catch (e) {
      // 静默回退
    }
  }

  return { src, format, ready, downloading, download };
}
