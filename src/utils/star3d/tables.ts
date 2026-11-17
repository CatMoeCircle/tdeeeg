/**
 * Telegram 官方星星模型（`star.binobj`）的二进制解析与本地加载。
 *
 * 模型、贴图都随前端一起打包，从本地读，不联网：生产包里它们由 Tauri 的资源协议
 * 直接从安装目录读出，开发时由本地 Vite 服务提供。
 *
 * 文件格式（官方 .binobj，全部**大端**）：
 *   1. int32 数量 + N 个 float32 —— 顶点位置，每顶点 3 个
 *   2. int32 数量 + N 个 float32 —— 纹理坐标，每顶点 2 个
 *   3. int32 数量 + N 个 float32 —— 法线，每顶点 3 个
 *   4. int32 顶点条目数 + 每个条目 3 个 int32 索引（位置 / 纹理 / 法线各一个）
 *
 * 第 4 段的数量是**顶点条目数**而不是三角形数：一次绘制按 TRIANGLELIST 解释，
 * 三个连续条目组成一个三角形，所以它必须是 3 的倍数。
 *
 * 三组索引分别指向上面三张表，而 WebGL 一次绘制只能有一份顶点缓冲，所以这里沿用
 * 官方做法：按条目把三个索引解引用成"每顶点一份"的交错缓冲，
 *   position(3f) + normal(3f) + uv(2f) = 32 字节
 * 展开后是一次连续的 `drawArrays(TRIANGLES, 0, 顶点数)`，没有索引缓冲。
 *
 * 两处与官方一致的细节：纹理坐标的 v 在读取时翻转为 `1 - v`；纹理索引越界时
 * u / v 都按 0 处理（官方金币模型依赖后者，星星模型本身没有越界索引）。
 */

import starModelUrl from '../../assets/star3d/star.binobj?url';
import startTextureUrl from '../../assets/star3d/start_texture.png?url';
import flecksTextureUrl from '../../assets/star3d/flecks.png?url';

/** 顶点 stride（字节）：position 3f + normal 3f + uv 2f */
export const STAR_VERTEX_STRIDE = 32;
/** 顶点 stride（float 数）：3 + 3 + 2 */
export const STAR_VERTEX_FLOATS = 8;

/** 一次绘制的范围，对应官方 `Draw(count, 0)` */
export interface StarDrawRange {
    /** 起始顶点（永远是 0：展开后的缓冲不留偏移） */
    first: number;
    /** 顶点数，等于展开的条目数 */
    count: number;
}

/** 解析后的星星模型 */
export interface StarTables {
    /** 原始位置表：每顶点 3 个 float，共 3889 个顶点 */
    positions: Float32Array;
    /** 原始纹理坐标表：每顶点 2 个 float，共 3889 个顶点 */
    coordinates: Float32Array;
    /** 原始法线表：每顶点 3 个 float，共 3896 个顶点 */
    normals: Float32Array;
    /** 原始索引：每顶点条目 3 个（位置 / 纹理 / 法线） */
    indices: Int32Array;
    /** 展开后的交错顶点缓冲，布局 pos3 + normal3 + uv2，共 19725 个顶点 */
    vertices: Float32Array;
    /** 唯一的一次绘制 */
    draw: StarDrawRange;
    /** 展开后的顶点数（= draw.count = indices.length / 3） */
    vertexCount: number;
    /** 索引数（= vertexCount × 3） */
    indexCount: number;
    /** 三角形数（= vertexCount / 3） */
    triangleCount: number;
}

/** 大端读取器：与官方的 BigEndianReader 一一对应 */
class BigEndianReader {
    private offset = 0;

    constructor(private readonly view: DataView) { }

    /** 剩余字节数 */
    get remaining(): number {
        return this.view.byteLength - this.offset;
    }

    /** 读一个 int32（大端） */
    int(): number {
        if (this.remaining < 4) throw new Error('star3d: 模型数据在读取 int32 时截断');
        const value = this.view.getInt32(this.offset);
        this.offset += 4;
        return value;
    }

    /** 读一个 float 数组：先 int32 长度，再逐个 float32（大端） */
    floats(): Float32Array {
        const count = this.int();
        if (count < 0 || count > this.remaining / 4) {
            throw new Error('star3d: 模型数据的 float 数组长度非法');
        }
        const values = new Float32Array(count);
        for (let index = 0; index < count; index++) {
            values[index] = this.view.getFloat32(this.offset);
            this.offset += 4;
        }
        return values;
    }
}

/**
 * 解析 `.binobj`。
 *
 * @param buffer 模型文件原始字节
 * @returns 解析结果；展开后的交错顶点缓冲可直接上传成 VBO
 * @throws 格式、长度或索引非法时抛错（宁可渲染不出来，也不静默画错）
 */
export function parseStarBinobj(buffer: ArrayBuffer): StarTables {
    const reader = new BigEndianReader(new DataView(buffer));

    const positions = reader.floats();
    const coordinates = reader.floats();
    const normals = reader.floats();

    // 顶点条目数：每个条目三个索引，三个条目一个三角形
    const vertexCount = reader.int();
    if (vertexCount < 0 || vertexCount > reader.remaining / 12 || vertexCount % 3 !== 0) {
        throw new Error('star3d: 模型数据的顶点数量非法');
    }
    const indexCount = vertexCount * 3;
    const indices = new Int32Array(indexCount);
    for (let index = 0; index < indexCount; index++) {
        indices[index] = reader.int();
    }
    if (reader.remaining !== 0) {
        throw new Error('star3d: 模型数据末尾有多余字节');
    }

    // 官方展开逻辑：位置 / 法线必须落在表内；纹理索引越界时 u 与 v 都取 0
    const hasCoordinate = (index: number): boolean => index >= 0 && index < coordinates.length;

    const vertices = new Float32Array(vertexCount * STAR_VERTEX_FLOATS);
    for (let vertex = 0; vertex < vertexCount; vertex++) {
        const position = indices[vertex * 3];
        const texture = indices[vertex * 3 + 1];
        const normal = indices[vertex * 3 + 2];

        const p = position * 3;
        const n = normal * 3;
        if (p < 0 || p + 2 >= positions.length || n < 0 || n + 2 >= normals.length) {
            throw new Error(`star3d: 第 ${vertex} 个顶点的索引越界`);
        }

        const target = vertex * STAR_VERTEX_FLOATS;
        vertices[target] = positions[p];
        vertices[target + 1] = positions[p + 1];
        vertices[target + 2] = positions[p + 2];
        vertices[target + 3] = normals[n];
        vertices[target + 4] = normals[n + 1];
        vertices[target + 5] = normals[n + 2];

        const t = texture * 2;
        // 越界的纹理索引：u、v 都是 0，且 v 不做翻转（翻转只作用于存在的值）
        vertices[target + 6] = hasCoordinate(t) ? coordinates[t] : 0;
        vertices[target + 7] = hasCoordinate(t + 1) ? 1 - coordinates[t + 1] : 0;
    }

    return {
        positions,
        coordinates,
        normals,
        indices,
        vertices,
        draw: { first: 0, count: vertexCount },
        vertexCount,
        indexCount,
        triangleCount: vertexCount / 3,
    };
}

/** 模型文件地址（构建期由 Vite 改写成打包后的真实文件路径） */
export const STAR_MODEL_URL = starModelUrl;
/** 星星底色 / 遮罩贴图（白色 240×240） */
export const START_TEXTURE_URL = startTextureUrl;
/** 闪光贴图（128×128，作普通贴图用：官方把 flecks 绑在法线槽上） */
export const FLECKS_TEXTURE_URL = flecksTextureUrl;

let cache: StarTables | null = null;
let pending: Promise<StarTables> | null = null;

/**
 * 取星星模型表（懒加载，全进程一份）。
 *
 * 失败不缓存，调用方可以退避重试。
 */
export function loadStarTables(): Promise<StarTables> {
    if (cache) return Promise.resolve(cache);
    if (!pending) {
        pending = (async () => {
            const response = await fetch(STAR_MODEL_URL);
            if (!response.ok) throw new Error(`star3d: 模型 HTTP ${response.status}`);
            const buffer = await response.arrayBuffer();
            if (buffer.byteLength % 4 !== 0) {
                throw new Error(`star3d: 模型长度 ${buffer.byteLength} 不是 4 字节对齐`);
            }
            const tables = parseStarBinobj(buffer);
            cache = tables;
            return tables;
        })().finally(() => {
            pending = null;
        });
    }
    return pending;
}

/** 两张贴图，解码后交给渲染器上传 */
export interface StarTextures {
    /** 白色 240×240：星星的底色 / 遮罩 */
    start: HTMLImageElement;
    /** 128×128：闪光 */
    flecks: HTMLImageElement;
}

/** 解一张图：解码完成前不返回，失败带标签抛错 */
async function loadImage(url: string, label: string): Promise<HTMLImageElement> {
    const image = new Image();
    image.decoding = 'async';
    const ready = new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(`star3d: 贴图 ${label} 解码失败`));
    });
    image.src = url;
    await ready;
    return image;
}

let textureCache: StarTextures | null = null;
let texturePending: Promise<StarTextures> | null = null;

/** 取两张星星贴图（懒加载，全进程一份） */
export function loadStarTextures(): Promise<StarTextures> {
    if (textureCache) return Promise.resolve(textureCache);
    if (!texturePending) {
        texturePending = Promise.all([
            loadImage(START_TEXTURE_URL, 'start_texture'),
            loadImage(FLECKS_TEXTURE_URL, 'flecks'),
        ]).then(([start, flecks]) => {
            textureCache = { start, flecks };
            return textureCache;
        }).finally(() => {
            texturePending = null;
        });
    }
    return texturePending;
}
