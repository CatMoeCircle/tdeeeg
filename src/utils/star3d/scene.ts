/**
 * 星星渲染（WebGL2）。
 *
 * 逐条移植自 Telegram 官方桌面端的 IconScene：相机 FOV 53.13°、近平面 1、
 * 远平面 200、眼睛在 +z 100 处；一次深度测试 + 单 pass 绘制，片元着色器自己写
 * 预乘 alpha，所以混合用 ONE / ONE_MINUS_SRC_ALPHA。
 *
 * 与官方唯一的结构差异：官方有 4× MSAA 的离屏目标再 Resolve 回后缓冲；WebGL 里
 * 这一层由 `antialias: true` 的默认帧缓冲承担（浏览器在读取画布时自己做 resolve），
 * 所以这里只画一遍、不建离屏目标。
 *
 * 矩阵约定与官方一致：列主序，矩阵左乘向量（GLSL 写 `m * v`）。投影矩阵按 GL 的
 * 深度范围 [-1, 1] 写；官方那份把深度映射到 D3D 的 [0, 1]，是唯一必须改的地方。
 */

import { ICON_UNIFORM_BLOCK, IconUniforms, ICON_UNIFORM_BYTES, SHADER_SOURCE, TYPE_GOLDEN_STAR, TYPE_STAR } from './shader';
import { starPalette } from './palette';
import { mat4 } from './matrix';
import type { StarTables, StarTextures } from './tables';

/** 眼睛到模型的距离（模型在原点） */
const EYE_DISTANCE = 100;
/** 角度 → 弧度 */
const TO_RADIANS = Math.PI / 180;

/** 一次 `draw()` 的入参 */
export interface StarDrawOptions {
    /** 渲染目标宽（设备像素） */
    width: number;
    /** 渲染目标高（设备像素） */
    height: number;
    /** 偏航角（度） */
    angleX: number;
    /** 俯仰角（度） */
    angleY: number;
    /** 抬起量（模型单位） */
    lift: number;
    /** 整体不透明度 0..1（预乘） */
    alpha: number;
    /** 场景时钟（秒） */
    time: number;
    /** 闪光贴图滚动偏移 0..1 */
    xOffset: number;
    /** 夜间主题 */
    night: boolean;
    /** 金色星星（默认 true；false 走 Premium 紫星分支） */
    golden: boolean;
}

/** 编译一个着色器，失败时把驱动日志抛出来 */
function compileShader(gl: WebGL2RenderingContext, type: number, source: string, label: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error(`star3d: createShader(${label}) 失败`);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader) ?? '';
        gl.deleteShader(shader);
        throw new Error(`star3d: ${label} 着色器编译失败：${log}`);
    }
    return shader;
}

/** 链接一个程序，失败时把驱动日志抛出来 */
function createProgram(gl: WebGL2RenderingContext, vertex: WebGLShader, fragment: WebGLShader): WebGLProgram {
    const program = gl.createProgram();
    if (!program) throw new Error('star3d: createProgram 失败');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program) ?? '';
        gl.deleteProgram(program);
        throw new Error(`star3d: 着色器程序链接失败：${log}`);
    }
    return program;
}

/**
 * 建一张贴图：线性过滤、REPEAT 环绕（官方 sampler 也是 MIN_MAG_MIP_LINEAR + WRAP），
 * 不做 mipmap（官方贴图只有一级），也不做 sRGB 转换（官方按 UNORM 采样）。
 */
function createTexture(gl: WebGL2RenderingContext, image: HTMLImageElement): WebGLTexture {
    const texture = gl.createTexture();
    if (!texture) throw new Error('star3d: createTexture 失败');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    // 官方贴图是未预乘的 RGBA，采样语义与 WebGL 默认一致，这里显式写出来
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    return texture;
}

/** 一个星星渲染器：程序、网格、贴图与一份 224 字节的 uniform 缓冲 */
export class StarScene {
    private readonly uniforms = new IconUniforms();
    private readonly samplerLocations: { texture: WebGLUniformLocation | null; normalMap: WebGLUniformLocation | null };

    private constructor(
        private readonly gl: WebGL2RenderingContext,
        private readonly tables: StarTables,
        private readonly program: WebGLProgram,
        private readonly vao: WebGLVertexArrayObject,
        private readonly vbo: WebGLBuffer,
        private readonly ubo: WebGLBuffer,
        private readonly texture: WebGLTexture,
        private readonly normalMap: WebGLTexture,
    ) {
        this.samplerLocations = {
            texture: gl.getUniformLocation(program, 'u_Texture'),
            normalMap: gl.getUniformLocation(program, 'u_NormalMap'),
        };

        // 默认采样器 0 / 1，跟官方的 t0 / t1 一致
        gl.useProgram(program);
        gl.uniform1i(this.samplerLocations.texture, 0);
        gl.uniform1i(this.samplerLocations.normalMap, 1);

        const blockIndex = gl.getUniformBlockIndex(program, ICON_UNIFORM_BLOCK);
        if (blockIndex === gl.INVALID_INDEX) {
            throw new Error(`star3d: 找不到 uniform block ${ICON_UNIFORM_BLOCK}`);
        }
        // 整块常量缓冲绑到 binding 0，与官方 VSSetConstantBuffers(0, ...) 同义
        gl.uniformBlockBinding(program, blockIndex, 0);
    }

    /**
     * 建一个渲染器。
     *
     * @param gl 共享的 WebGL2 上下文
     * @param tables 解析好的模型
     * @param textures 两张已解码的贴图
     */
    static create(gl: WebGL2RenderingContext, tables: StarTables, textures: StarTextures): StarScene {
        const vertex = compileShader(gl, gl.VERTEX_SHADER, SHADER_SOURCE.starVertex, 'starVertex');
        const fragment = compileShader(gl, gl.FRAGMENT_SHADER, SHADER_SOURCE.starFragment, 'starFragment');
        const program = createProgram(gl, vertex, fragment);

        // 顶点缓冲：展开后的交错顶点，pos3 + normal3 + uv2，stride 32
        const vao = gl.createVertexArray();
        const vbo = gl.createBuffer();
        if (!vao || !vbo) throw new Error('star3d: 顶点缓冲创建失败');
        gl.bindVertexArray(vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, tables.vertices, gl.STATIC_DRAW);
        // 着色器用 layout(location = N) 声明，偏移与官方的输入布局一致：
        // POSITION @0、NORMAL @12、TEXCOORD @24，stride 32
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 32, 12);
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 32, 24);
        gl.bindVertexArray(null);

        const ubo = gl.createBuffer();
        if (!ubo) throw new Error('star3d: uniform 缓冲创建失败');
        gl.bindBuffer(gl.UNIFORM_BUFFER, ubo);
        gl.bufferData(gl.UNIFORM_BUFFER, ICON_UNIFORM_BYTES, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.UNIFORM_BUFFER, null);

        const texture = createTexture(gl, textures.start);
        const normalMap = createTexture(gl, textures.flecks);

        return new StarScene(gl, tables, program, vao, vbo, ubo, texture, normalMap);
    }

    /** 画一帧到当前绑定的帧缓冲（stage 会绑回默认帧缓冲并清过色） */
    draw(options: StarDrawOptions): void {
        const gl = this.gl;
        const aspect = options.height > 0 ? options.width / options.height : 1;

        // 模型抬起、绕 x 与 y 各转一个角度，两个角度都取负；相机在 +z 100 处
        const rotation = mat4.multiply(
            mat4.multiply(mat4.translationY(options.lift), mat4.rotationX(-options.angleY * TO_RADIANS)),
            mat4.rotationY(-options.angleX * TO_RADIANS),
        );
        const view = mat4.identity();
        view[14] = -EYE_DISTANCE;
        const mvp = mat4.multiply(mat4.perspective(aspect), mat4.multiply(view, rotation));

        this.uniforms.setMvp(mvp);
        this.uniforms.setWorld(rotation);
        this.uniforms.setPalette(starPalette(options.golden, options.night));
        this.uniforms.setFrame({
            alpha: options.alpha,
            golden: options.golden ? 1 : 0,
            night: options.night ? 1 : 0,
            xOffset: options.xOffset,
            time: options.time,
            type: options.golden ? TYPE_GOLDEN_STAR : TYPE_STAR,
        });

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.bindBuffer(gl.UNIFORM_BUFFER, this.ubo);
        gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.uniforms.data);
        gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, this.ubo);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.normalMap);

        // 官方：深度测试 LESS、写深度、不剔除、不混合（片元自带预乘 alpha）
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
        gl.depthMask(true);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.SCISSOR_TEST);

        gl.drawArrays(gl.TRIANGLES, this.tables.draw.first, this.tables.draw.count);

        gl.bindVertexArray(null);
    }

    /** 释放 GPU 资源（上下文本身由 stage 持有） */
    dispose(): void {
        const gl = this.gl;
        gl.deleteProgram(this.program);
        gl.deleteVertexArray(this.vao);
        gl.deleteBuffer(this.vbo);
        gl.deleteBuffer(this.ubo);
        gl.deleteTexture(this.texture);
        gl.deleteTexture(this.normalMap);
    }
}
