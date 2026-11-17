/**
 * 星星着色器源码与 uniform 常量缓冲的宿主端布局。
 *
 * GLSL 放在 `src/assets/star3d/shaders/` 里，构建期以字符串内联（`?raw`），
 * 运行期零请求；这里只做导出，并把官方的 `cbuffer Uniforms`（224 字节 / 56 个
 * float）在 JS 侧按**相同字段顺序**铺成一份 Float32Array，整块上传成 UBO。
 *
 * 字段顺序与官方 IconUniforms 结构体逐字段一致（std140 下每个 vec3 对齐到 16，
 * 所以 4 组 vec3+float 正好各占 16 字节，末尾 8 个标量占 32 字节）：
 *
 *   [ 0..15] mvp                 mat4
 *   [16..31] world               mat4
 *   [32..34] gradientColor1      vec3      [35] spec1
 *   [36..38] gradientColor2      vec3      [39] spec2
 *   [40..42] normalSpecColor     vec3      [43] diffuse
 *   [44..46] backgroundColor     vec3      [47] normalSpec
 *   [48] xOffset  [49] alpha  [50] golden  [51] white  [52] time
 *   [53] type     [54] night  [55] padding
 */

import starVertexShader from '../../assets/star3d/shaders/star.vert.glsl?raw';
import starFragmentShader from '../../assets/star3d/shaders/star.frag.glsl?raw';
import type { StarPalette } from './palette';

/** 着色器源码（构建期以字符串内联，运行期零请求） */
export const SHADER_SOURCE = {
    starVertex: starVertexShader,
    starFragment: starFragmentShader,
} as const;

/** uniform 缓冲的字节数，与官方 `static_assert(sizeof(IconUniforms) == 224)` 一致 */
export const ICON_UNIFORM_BYTES = 224;
/** uniform 缓冲的 float 数（224 / 4） */
export const ICON_UNIFORM_FLOATS = 56;
/** GLSL 里的 uniform block 名字，用于 `getUniformBlockIndex` */
export const ICON_UNIFORM_BLOCK = 'IconUniforms';

/** 官方的模型类型（Icon.hlsl 的 TYPE_*；星星只用到后两个） */
export const TYPE_STAR = 0;
export const TYPE_COIN = 1;
export const TYPE_GOLDEN_STAR = 2;

/**
 * 每个字段在 56 个 float 里的下标。
 *
 * 写成常量表而不是散落的魔数：断言测试按这张表校验布局，改字段顺序时一处可见。
 */
export const ICON_UNIFORM_OFFSETS = {
    mvp: 0,
    world: 16,
    gradientColor1: 32,
    spec1: 35,
    gradientColor2: 36,
    spec2: 39,
    normalSpecColor: 40,
    diffuse: 43,
    backgroundColor: 44,
    normalSpec: 47,
    xOffset: 48,
    alpha: 49,
    golden: 50,
    white: 51,
    time: 52,
    type: 53,
    night: 54,
    padding: 55,
} as const;

/**
 * IconUniforms：官方常量缓冲的宿主端副本。
 *
 * 同一段内存有两个视图：float 视图写浮点字段，int 视图写 `type` / `night`
 * ——它们按 int 解释，用 float 视图写会变成 float 的位模式（2.0 → 0x40000000），
 * GPU 读到的就是一个荒唐的大整数。
 */
export class IconUniforms {
    /** 56 个 float 的缓冲，直接上传成 UBO */
    readonly data: Float32Array;
    private readonly ints: Int32Array;

    constructor() {
        const buffer = new ArrayBuffer(ICON_UNIFORM_BYTES);
        this.data = new Float32Array(buffer);
        this.ints = new Int32Array(buffer);
        // 官方结构体里的字段默认值（IconUniforms 的成员初始化），
        // 渲染时再按主题覆盖；不先写一遍的话，切到 Premium 分支会得到全黑的法线高光。
        this.data.set([1, 1, 1], ICON_UNIFORM_OFFSETS.normalSpecColor);
        this.data[ICON_UNIFORM_OFFSETS.diffuse] = 1;
        this.data[ICON_UNIFORM_OFFSETS.normalSpec] = 0.2;
        this.data[ICON_UNIFORM_OFFSETS.spec1] = 2;
        this.data[ICON_UNIFORM_OFFSETS.spec2] = 0.13;
    }

    /** 视角投影矩阵（列主序） */
    setMvp(matrix: Float32Array): void {
        this.data.set(matrix, ICON_UNIFORM_OFFSETS.mvp);
    }

    /** 世界矩阵（列主序），金色外观用它把法线转到世界空间 */
    setWorld(matrix: Float32Array): void {
        this.data.set(matrix, ICON_UNIFORM_OFFSETS.world);
    }

    /** 写一整套配色（渐变两色、背景色与两个高光强度） */
    setPalette(palette: StarPalette): void {
        const data = this.data;
        data.set(palette.gradientColor1, ICON_UNIFORM_OFFSETS.gradientColor1);
        data.set(palette.gradientColor2, ICON_UNIFORM_OFFSETS.gradientColor2);
        data.set(palette.backgroundColor, ICON_UNIFORM_OFFSETS.backgroundColor);
        data[ICON_UNIFORM_OFFSETS.spec1] = palette.spec1;
        data[ICON_UNIFORM_OFFSETS.spec2] = palette.spec2;
    }

    /** 写一帧的表观参数 */
    setFrame(options: {
        /** 0..1，0 是完全透明的淡入起点 */
        alpha: number;
        /** 0 = Premium 紫星，1 = 金色星星 */
        golden: number;
        /** 0 = 白天，1 = 夜间 */
        night: number;
        /** 闪光贴图的滚动偏移，按 0.03/s 累加后对 1 取模 */
        xOffset: number;
        /** 场景时钟（秒） */
        time: number;
        /** 模型类型，金色星星为 TYPE_GOLDEN_STAR */
        type: number;
    }): void {
        const data = this.data;
        data[ICON_UNIFORM_OFFSETS.xOffset] = options.xOffset;
        data[ICON_UNIFORM_OFFSETS.alpha] = options.alpha;
        data[ICON_UNIFORM_OFFSETS.golden] = options.golden;
        data[ICON_UNIFORM_OFFSETS.white] = 0;
        data[ICON_UNIFORM_OFFSETS.time] = options.time;
        this.ints[ICON_UNIFORM_OFFSETS.type] = options.type;
        this.ints[ICON_UNIFORM_OFFSETS.night] = options.night;
        data[ICON_UNIFORM_OFFSETS.padding] = 0;
    }
}
