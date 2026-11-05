/**
 * TON 钻石模型表。
 *
 * 9 张 `.bin` 是 Telegram 官方烘焙好的几何 / 光照数据（Unigram
 * `Telegram/Assets/Models/Diamond/`，GPL-3.0，与本项目一致），共约 524 KB。
 *
 * 读取方式：这 9 个文件随前端一起打包，**从本地读**——生产包里它们被内嵌进
 * 可执行文件，由 Tauri 的资源协议直接从内存取出；开发时由本地 Vite 服务提供。
 * 这里不存在联网下载。一次懒加载把它们并行读进来，`arrayBuffer()` 的结果直接开
 * `Float32Array` 视图，不做 base64、也不做逐表拷贝，全程只驻留一份 524 KB。
 * （旧实现把同样这些字节以 base64 内联在 TS 里：字符串 + Uint8Array + 9 张表
 * 同时存在，常驻约 1.2 MB，还得多花几毫秒 atob。）
 */

import anchorsUrl from '../../assets/diamond/models/anchors.bin?url';
import cameraUrl from '../../assets/diamond/models/camera.bin?url';
import facetProjectionUrl from '../../assets/diamond/models/facetProjection.bin?url';
import framesUrl from '../../assets/diamond/models/frames.bin?url';
import mainUrl from '../../assets/diamond/models/main.bin?url';
import planesUrl from '../../assets/diamond/models/planes.bin?url';
import smallUrl from '../../assets/diamond/models/small.bin?url';
import verticesUrl from '../../assets/diamond/models/vertices.bin?url';
import widthsUrl from '../../assets/diamond/models/widths.bin?url';

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

/** 每张表的本地地址（构建期由 Vite 改写成打包后的路径） */
const TABLE_URLS: Readonly<Record<keyof DiamondTables, string>> = {
    frames: framesUrl,
    planes: planesUrl,
    anchors: anchorsUrl,
    widths: widthsUrl,
    facetProjection: facetProjectionUrl,
    camera: cameraUrl,
    vertices: verticesUrl,
    main: mainUrl,
    small: smallUrl,
};

/** 校验各表的语义长度，拿错数据时立刻报错而不是静默渲染 */
function validate(tables: DiamondTables): void {
    if (tables.anchors.length !== 64 || tables.widths.length !== 91
        || tables.facetProjection.length !== 4 || tables.camera.length !== 3) {
        throw new Error('unexpected diamond camera data');
    }
    if (tables.frames.length !== FRAME_COUNT * FRAME_FLOATS || tables.planes.length !== 17 * 4) {
        throw new Error('unexpected diamond animation data');
    }
    // 顶点按 12 / 8 / 8 个 float 一组解释，长度对不上说明文件与代码版本不匹配
    if (tables.vertices.length % 12 !== 0 || tables.main.length % 8 !== 0
        || tables.small.length % 8 !== 0) {
        throw new Error('unexpected diamond mesh data');
    }
}

/** 读一个 .bin：返回的视图直接落在 ArrayBuffer 上，没有中间拷贝 */
async function fetchTable(name: keyof DiamondTables, url: string): Promise<Float32Array> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`diamond ${name}: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength % 4 !== 0) {
        throw new Error(`diamond ${name}: 长度 ${buffer.byteLength} 不是 float32 对齐`);
    }
    return new Float32Array(buffer);
}

async function fetchTables(): Promise<DiamondTables> {
    const names = Object.keys(TABLE_URLS) as (keyof DiamondTables)[];
    // 9 个文件互不依赖，并行读；它们都是本地资源，没有串行等待的必要
    const arrays = await Promise.all(names.map((name) => fetchTable(name, TABLE_URLS[name])));

    const tables = {} as DiamondTables;
    const record = tables as unknown as Record<string, Float32Array>;
    names.forEach((name, index) => {
        record[name] = arrays[index];
    });

    validate(tables);
    return tables;
}

let cache: DiamondTables | null = null;
let pending: Promise<DiamondTables> | null = null;

/**
 * 取钻石模型表（懒加载，全进程一份）。
 *
 * 首次调用才会去读这 9 个文件；失败不缓存，调用方可以退避重试。
 *
 * @returns 9 张表的视图；各自持有一份 524 KB 总量里属于自己的那段
 */
export function loadDiamondTables(): Promise<DiamondTables> {
    if (cache) return Promise.resolve(cache);
    if (!pending) {
        pending = fetchTables()
            .then((tables) => {
                cache = tables;
                return tables;
            })
            .finally(() => {
                pending = null;
            });
    }
    return pending;
}
