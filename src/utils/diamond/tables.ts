/**
 * TON 钻石模型表。
 *
 * 9 张 `.bin` 是 Telegram 官方烘焙好的几何 / 光照数据（Unigram
 * `Telegram/Assets/Models/Diamond/`，GPL-3.0，与本项目一致），共约 524 KB。
 *
 * 数据在构建期就被内联成 base64（见 `scripts/build-diamond-assets.mjs` 与
 * `assets.generated.ts`）
 */

import { DIAMOND_TABLE_BASE64 } from './assets.generated';

import diamondVertex from '../../assets/diamond/shaders/diamondVertex.glsl?raw';
import diamondFragment from '../../assets/diamond/shaders/diamondFragment.glsl?raw';
import sparkleVertex from '../../assets/diamond/shaders/sparkleVertex.glsl?raw';
import sparkleFragment from '../../assets/diamond/shaders/sparkleFragment.glsl?raw';
import fullscreenVertex from '../../assets/diamond/shaders/fullscreenVertex.glsl?raw';
import copyFragment from '../../assets/diamond/shaders/copyFragment.glsl?raw';

/** 着色器源码（构建期以字符串内联，运行期零请求） */
export const SHADER_SOURCE = {
    diamondVertex,
    diamondFragment,
    sparkleVertex,
    sparkleFragment,
    fullscreenVertex,
    copyFragment,
} as const;

/** 逐帧光照表 1441 帧 × 42 float */
export const FRAME_FLOATS = 42;
/** 光照表采样率（Hz） */
export const FRAMES_PER_SECOND = 240;
/** 一轮光照循环的帧数（最后一帧与第一帧重合，故步进用 1440） */
export const FRAME_COUNT = 1441;

export interface DiamondTables {
    /** 240 Hz 烘焙光照表，1441 帧 × 42 float */
    frames: Float32Array;
    /** 17 个光学平面 */
    planes: Float32Array;
    /** 8 个闪光锚点，每个 8 float */
    anchors: Float32Array;
    /** 91 个轮廓半宽采样 */
    widths: Float32Array;
    /** 顶面投影参数 */
    facetProjection: Float32Array;
    /** 相机参数 */
    camera: Float32Array;
    /** 主体网格（position / normal / surface） */
    vertices: Float32Array;
    /** 主闪光面片网格 */
    main: Float32Array;
    /** 小星芒网格（实例化 7 次） */
    small: Float32Array;
}

type TableName = keyof DiamondTables;

/** base64 → little-endian float32 表 */
function decodeTable(name: TableName): Float32Array {
    const binary = atob(DIAMOND_TABLE_BASE64[name]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    if (bytes.byteLength % 4 !== 0) {
        throw new Error(`diamond table ${name}: length ${bytes.byteLength} is not float32 aligned`);
    }
    return new Float32Array(bytes.buffer);
}

let cache: DiamondTables | null = null;

/**
 * 解码并校验钻石模型表（幂等，同步）。
 *
 * @returns 全部 9 张表；长度与官方数据不符时抛错，避免拿错数据静默渲染
 */
export function loadDiamondTables(): DiamondTables {
    if (cache) return cache;

    const tables: DiamondTables = {
        frames: decodeTable('frames'),
        planes: decodeTable('planes'),
        anchors: decodeTable('anchors'),
        widths: decodeTable('widths'),
        facetProjection: decodeTable('facetProjection'),
        camera: decodeTable('camera'),
        vertices: decodeTable('vertices'),
        main: decodeTable('main'),
        small: decodeTable('small'),
    };

    if (tables.anchors.length !== 64 || tables.widths.length !== 91
        || tables.facetProjection.length !== 4 || tables.camera.length !== 3) {
        throw new Error('unexpected diamond camera data');
    }
    if (tables.frames.length !== FRAME_COUNT * FRAME_FLOATS || tables.planes.length !== 17 * 4) {
        throw new Error('unexpected diamond animation data');
    }

    cache = tables;
    return tables;
}
