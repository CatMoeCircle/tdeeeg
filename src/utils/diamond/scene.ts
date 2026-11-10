/**
 * TON 钻石渲染（WebGL2）。
 *
 * 逐条移植自 Telegram 的 `DiamondRenderer` 与 Unigram 的 `DiamondScene`：
 * 三遍管线（主体带深度 + 背面剔除 → 预乘 alpha 闪光层 → 全屏 copy 做整体淡入），
 * 轮廓样条与水平压缩校正都按原实现保留，否则转动时石头会塌成纸片。
 *
 * 着色器来自 Telegram`shaders/diamond/*.glsl`，GLSL ES 3.00）。
 */

import { SHADER_SOURCE, FRAME_FLOATS, FRAMES_PER_SECOND, FRAME_COUNT, type DiamondTables } from './tables';
import { PALETTE_BLUE } from './palette';

const LIGHTS = [
    'crownGradient', 'pavilionGradient', 'lightSweep',
    'crownSweep', 'rightCrownSweep', 'leftCrownSweep',
    'pavilionSweep', 'rightPavilionSweep', 'leftPavilionSweep',
] as const;

/** 钻石配色：0 蓝 / 1 Ice 冰白 / 2 Cool 冷蓝（转账气泡用） */
export { PALETTE_BLUE, PALETTE_ICE, PALETTE_COOL } from './palette';

type Mat4 = Float32Array;

const mat4 = {
    identity(): Mat4 {
        return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    },
    /** out = a * b（out 可与 a / b 同一份数据） */
    multiply(out: Mat4, a: Mat4, b: Mat4): Mat4 {
        const left = Float32Array.from(a);
        const right = Float32Array.from(b);
        for (let c = 0; c < 4; c++) {
            const b0 = right[c * 4], b1 = right[c * 4 + 1], b2 = right[c * 4 + 2], b3 = right[c * 4 + 3];
            for (let r = 0; r < 4; r++) {
                out[c * 4 + r] = left[r] * b0 + left[4 + r] * b1 + left[8 + r] * b2 + left[12 + r] * b3;
            }
        }
        return out;
    },
    rotationX(radians: number): Mat4 {
        const c = Math.cos(radians), s = Math.sin(radians);
        return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
    },
    rotationY(radians: number): Mat4 {
        const c = Math.cos(radians), s = Math.sin(radians);
        return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
    },
    rotationZ(radians: number): Mat4 {
        const c = Math.cos(radians), s = Math.sin(radians);
        return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    },
    transpose(out: Mat4, a: Mat4): Mat4 {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) out[c * 4 + r] = a[r * 4 + c];
        return out;
    },
};

function smoothstep(value: number): number {
    const t = Math.min(1, Math.max(0, value));
    return t * t * (3 - 2 * t);
}

interface Attribute {
    data: Float32Array;
    numComponents: number;
}

interface Mesh {
    vao: WebGLVertexArrayObject;
    count: number;
}

interface ProgramInfo {
    program: WebGLProgram;
}

/**
 * 驱动的异步编译扩展：编译 / 链接都在 GPU 进程里跑，主线程只轮询
 * `COMPLETION_STATUS_KHR`。37 KB 的片元着色器要由驱动翻译成 HLSL 再编译，
 * 冷启动（没有着色器磁盘缓存）时以秒计；没有这个扩展就只能同步等
 * `COMPILE_STATUS` / `LINK_STATUS`，那一下会把整个前端钉住。
 */
interface ParallelShaderCompile {
    readonly COMPLETION_STATUS_KHR: number;
}

/** 一个还在编译中的程序：着色器对象要留到取完日志再删 */
interface PendingProgram {
    program: WebGLProgram;
    vertex: WebGLShader;
    fragment: WebGLShader;
}

/** 轮询间隔：约一个显示帧，既不空转也让主线程随时能画下一帧 */
const COMPILE_POLL_MS = 16;
/** 编译超时：驱动彻底不响应时不要把初始化永远吊住，交给调用方退避重试 */
const COMPILE_TIMEOUT_MS = 20000;

/** 把控制权交回事件循环（宏任务），期间浏览器可以处理输入和绘制 */
function yieldToEventLoop(delay: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, delay);
    });
}

/** 只把源码交给驱动：编译和链接都是异步的，这里不读任何状态 */
function startProgram(
    gl: WebGL2RenderingContext,
    vertexSource: string,
    fragmentSource: string,
): PendingProgram {
    const vertex = startShader(gl, gl.VERTEX_SHADER, vertexSource);
    const fragment = startShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    if (!program) {
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        throw new Error('diamond: createProgram failed');
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    return { program, vertex, fragment };
}

function startShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error(`diamond: createShader(${type}) failed`);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
}

/** 失败路径清场：重复删除 GL 对象是合法的，不用区分有没有删过 */
function disposePending(gl: WebGL2RenderingContext, pending: readonly PendingProgram[]): void {
    for (const entry of pending) {
        gl.deleteProgram(entry.program);
        gl.deleteShader(entry.vertex);
        gl.deleteShader(entry.fragment);
    }
}

/**
 * 等一组程序编译 / 链接完成，再统一取状态，并把驱动的日志抛出来而不是静默失败。
 *
 * 有 `KHR_parallel_shader_compile` 时全程只轮询完成标志，主线程一次都不阻塞；
 * 没有这个扩展（极少数驱动）就只能同步查询，但至少先让出一帧：让聊天列表先
 * 画出来，别把「打开聊天」和「等编译」叠在同一帧里。
 */
async function resolvePrograms(
    gl: WebGL2RenderingContext,
    pending: PendingProgram[],
    labels: readonly string[],
): Promise<ProgramInfo[]> {
    const ext = gl.getExtension('KHR_parallel_shader_compile') as ParallelShaderCompile | null;
    if (ext) {
        const deadline = performance.now() + COMPILE_TIMEOUT_MS;
        const done = (): boolean => pending.every(
            (entry) => Boolean(gl.getProgramParameter(entry.program, ext.COMPLETION_STATUS_KHR)),
        );
        while (!done()) {
            if (gl.isContextLost()) {
                // 编译途中上下文没了（GPU 进程崩溃 / 被回收）：轮询永远不会变 true，
                // 立刻失败交给调用方重试，别白等满 20 秒
                disposePending(gl, pending);
                throw new Error('diamond: context lost during shader compile');
            }
            if (performance.now() > deadline) {
                disposePending(gl, pending);
                throw new Error('diamond: shader compile timed out');
            }
            await yieldToEventLoop(COMPILE_POLL_MS);
        }
    } else {
        // 没有扩展就只能同步查询（唯一会卡住主线程的一步）；先让出一帧，
        // 让聊天列表先画出来，别把「打开聊天」和「等编译」叠在同一帧里
        if (import.meta.env.DEV) {
            console.warn('[diamond] KHR_parallel_shader_compile unavailable, shader compile will block');
        }
        await yieldToEventLoop(0);
    }

    const result: ProgramInfo[] = [];
    for (let index = 0; index < pending.length; index++) {
        const entry = pending[index];
        const label = labels[index] ?? `program ${index}`;
        const vertexLog = gl.getShaderParameter(entry.vertex, gl.COMPILE_STATUS)
            ? null
            : gl.getShaderInfoLog(entry.vertex) ?? '';
        const fragmentLog = gl.getShaderParameter(entry.fragment, gl.COMPILE_STATUS)
            ? null
            : gl.getShaderInfoLog(entry.fragment) ?? '';
        if (vertexLog !== null || fragmentLog !== null) {
            disposePending(gl, pending);
            throw new Error(`${label} shader: ${vertexLog ?? fragmentLog ?? ''}`);
        }
        if (!gl.getProgramParameter(entry.program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(entry.program) ?? '';
            disposePending(gl, pending);
            throw new Error(`${label} program link: ${log}`);
        }
        gl.deleteShader(entry.vertex);
        gl.deleteShader(entry.fragment);
        result.push({ program: entry.program });
    }
    return result;
}

/** 把一组属性写进 VAO；着色器用 `layout(location=N)` 字面声明，故按序号绑定 */
function createMesh(gl: WebGL2RenderingContext, arrays: Record<string, Attribute>): Mesh {
    const vao = gl.createVertexArray();
    if (!vao) throw new Error('diamond: createVertexArray failed');
    gl.bindVertexArray(vao);

    const entries = Object.values(arrays);
    entries.forEach((attribute, index) => {
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, attribute.data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(index);
        gl.vertexAttribPointer(index, attribute.numComponents, gl.FLOAT, false, 0, 0);
    });

    gl.bindVertexArray(null);
    const first = entries[0];
    return { vao, count: first ? first.data.length / first.numComponents : 0 };
}

function deinterleave(mesh: Float32Array, attributes: number, count: number): Attribute[] {
    return Array.from({ length: attributes }, (_, a) => {
        const values = new Float32Array(count * 4);
        for (let v = 0; v < count; v++) {
            for (let c = 0; c < 4; c++) values[v * 4 + c] = mesh[(v * attributes + a) * 4 + c];
        }
        return { data: values, numComponents: 4 };
    });
}

class Uniforms {
    private readonly cache = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>();

    constructor(private readonly gl: WebGL2RenderingContext) { }

    at(program: WebGLProgram, name: string): WebGLUniformLocation | null {
        let entries = this.cache.get(program);
        if (!entries) {
            entries = new Map();
            this.cache.set(program, entries);
        }
        if (!entries.has(name)) {
            entries.set(name, this.gl.getUniformLocation(program, name));
        }
        return entries.get(name) ?? null;
    }

    float4(program: WebGLProgram, name: string, x: number, y: number, z: number, w: number): void {
        this.gl.uniform4f(this.at(program, name), x, y, z, w);
    }

    matrix(program: WebGLProgram, name: string, values: Float32Array): void {
        this.gl.uniformMatrix4fv(this.at(program, name), false, values);
    }
}

/** 一次 `draw()` 的入参 */
export interface DiamondDrawOptions {
    width: number;
    height: number;
    /** 偏航角（度） */
    yaw: number;
    /** 俯仰角（度） */
    pitch: number;
    /** 翻滚角（度） */
    roll?: number;
    /** 场景时钟（秒）：决定光照表采样点 */
    time: number;
    /** 整体透明度 */
    alpha?: number;
    /** 配色：0 蓝 / 1 Ice / 2 Cool */
    palette?: number;
    /** 官方从不启用，保留位 */
    white?: number;
    /** 按压时提高渲染密度（>1 时按倍数离屏渲染再缩回） */
    oversample?: number;
    /** 帧间隔（秒），用于计算转动速率以抑制闪光 */
    dt?: number;
}

interface Targets {
    msaa: WebGLFramebuffer;
    resolved: WebGLFramebuffer;
    texture: WebGLTexture;
    color: WebGLRenderbuffer;
    depth: WebGLRenderbuffer;
    width: number;
    height: number;
}

export class DiamondScene {
    private readonly uniforms: Uniforms;
    private readonly frame = new Float32Array(FRAME_FLOATS);
    private readonly model = mat4.identity();
    private readonly inverse = mat4.identity();
    private projectionMatrix = mat4.identity();

    private programDiamond!: ProgramInfo;
    private programSparkle!: ProgramInfo;
    private programCopy!: ProgramInfo;

    private meshBody!: Mesh;
    private meshMain!: Mesh;
    private meshSmall!: Mesh;
    private emptyVao!: WebGLVertexArrayObject;

    private frames!: Float32Array;
    private planes!: Float32Array;
    private anchors!: Float32Array;
    private widths!: Float32Array;
    private facetProjection!: Float32Array;
    private camera!: Float32Array;

    private targets: Targets | null = null;
    private width = 0;
    private height = 0;
    private samples = 1;
    private previousYaw = 0;
    private previousPitch = 0;
    private hasPrevious = false;
    private horizontalScale = 1;

    private constructor(private readonly gl: WebGL2RenderingContext) {
        this.uniforms = new Uniforms(gl);
    }

    /**
     * 建好着色器与网格。
     *
     * 着色器编译 / 链接走异步轮询（见 `resolvePrograms`），所以这个初始化
     * 再慢也不会把主线程钉住——调用方 await 期间前端照常响应。
     *
     * @param gl WebGL2 上下文
     * @param tables 模型表
     * @param samples 期望的 MSAA 采样数（会被驱动上限截断）
     */
    static async create(
        gl: WebGL2RenderingContext,
        tables: DiamondTables,
        samples = 4,
    ): Promise<DiamondScene> {
        const scene = new DiamondScene(gl);
        try {
            await scene.load(tables, samples);
        } catch (error) {
            // 半成品也带走：着色器 / 缓冲已经挂在上下文上了，重试前先清干净
            scene.dispose();
            throw error;
        }
        return scene;
    }

    private async load(tables: DiamondTables, maxSamples: number): Promise<void> {
        const gl = this.gl;

        // 冷启动最贵的一步就在这里：37 KB 的片元着色器要由驱动翻译再编译，没有
        // 着色器磁盘缓存时以秒计。resolvePrograms 把这段等待拆成主线程可以喘气的
        // 轮询，所以 wait 期间聊天照常滚动、输入照常响应，最多只是石头晚点出现。
        const [diamond, sparkle, copy] = await resolvePrograms(gl, [
            startProgram(gl, SHADER_SOURCE.diamondVertex, SHADER_SOURCE.diamondFragment),
            startProgram(gl, SHADER_SOURCE.sparkleVertex, SHADER_SOURCE.sparkleFragment),
            startProgram(gl, SHADER_SOURCE.fullscreenVertex, SHADER_SOURCE.copyFragment),
        ], ['diamond', 'sparkle', 'copy']);
        this.programDiamond = diamond;
        this.programSparkle = sparkle;
        this.programCopy = copy;

        this.frames = tables.frames;
        this.planes = tables.planes;
        this.anchors = tables.anchors;
        this.widths = tables.widths;
        this.facetProjection = tables.facetProjection;
        this.camera = tables.camera;

        const vertexCount = tables.vertices.length / 12;
        const mainCount = tables.main.length / 8;
        const smallCount = tables.small.length / 8;

        this.meshBody = this.buildMesh(deinterleave(tables.vertices, 3, vertexCount), vertexCount,
            ['a_position', 'a_normal', 'a_surface']);
        this.meshMain = this.buildMesh(deinterleave(tables.main, 2, mainCount), mainCount,
            ['a_contours', 'a_material']);
        this.meshSmall = this.buildMesh(deinterleave(tables.small, 2, smallCount), smallCount,
            ['a_contours', 'a_material']);

        const emptyVao = gl.createVertexArray();
        if (!emptyVao) throw new Error('diamond: createVertexArray failed');
        this.emptyVao = emptyVao;

        const driverMax = gl.getParameter(gl.MAX_SAMPLES) as number | null;
        this.samples = Math.min(maxSamples, driverMax || 1);
    }

    private buildMesh(attributes: Attribute[], count: number, names: string[]): Mesh {
        const arrays: Record<string, Attribute> = {};
        attributes.forEach((attribute, index) => { arrays[names[index]] = attribute; });
        const mesh = createMesh(this.gl, arrays);
        mesh.count = count;
        return mesh;
    }

    // ------------------------------------------------------------ 渲染目标

    private createTargets(width: number, height: number): void {
        const gl = this.gl;
        this.destroyTargets();

        const samples = this.samples;
        const msaa = gl.createFramebuffer();
        const color = gl.createRenderbuffer();
        const depth = gl.createRenderbuffer();
        if (!msaa || !color || !depth) throw new Error('diamond: framebuffer allocation failed');

        gl.bindRenderbuffer(gl.RENDERBUFFER, color);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, width, height);
        gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT16, width, height);

        gl.bindFramebuffer(gl.FRAMEBUFFER, msaa);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error('incomplete diamond framebuffer');
        }

        const texture = gl.createTexture();
        if (!texture) throw new Error('diamond: createTexture failed');
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        const resolved = gl.createFramebuffer();
        if (!resolved) throw new Error('diamond: framebuffer allocation failed');
        gl.bindFramebuffer(gl.FRAMEBUFFER, resolved);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error('incomplete diamond resolve framebuffer');
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this.targets = { msaa, resolved, texture, color, depth, width, height };
        this.width = width;
        this.height = height;
    }

    private destroyTargets(): void {
        const gl = this.gl;
        const targets = this.targets;
        if (!targets) return;
        gl.deleteFramebuffer(targets.msaa);
        gl.deleteFramebuffer(targets.resolved);
        gl.deleteTexture(targets.texture);
        gl.deleteRenderbuffer(targets.color);
        gl.deleteRenderbuffer(targets.depth);
        this.targets = null;
    }

    // ------------------------------------------------------------ 钻石数学

    /** 某个偏航角下的轮廓半宽（三次样条，91 个采样点） */
    private widthAt(yaw: number): number {
        const widths = this.widths;
        const quarter = Math.PI / 2;
        const folded = yaw - quarter * Math.floor(yaw / quarter + 0.5);
        const position = Math.min(89, Math.max(0, (360 * Math.abs(folded)) / Math.PI));
        const index = Math.floor(position);
        const t = position - index;
        const at = (k: number) => widths[Math.min(Math.max(k, 0), widths.length - 1)];
        const p0 = at(index), p1 = at(index + 1);
        const slope = (p1 - p0) * 3 - ((p1 - at(index - 1)) / 2) * 2 - (at(index + 2) - p0) / 2;
        return p0 + (p1 - p0) * t + slope * t * (1 - t);
    }

    /** 让轮廓保持正对时宽度的额外水平压缩（否则转动时像纸片） */
    private horizontalSqueeze(yaw: number, pitch: number): number {
        const quarter = Math.PI / 2;
        const fold = yaw - quarter * Math.floor(yaw / quarter + 0.5);
        const wobble = Math.sin(Math.abs(fold) * 2);
        const flatten = 1 - 0.035 * wobble * wobble;
        const low = Math.sin(0.25), high = Math.sin(0.96);
        const a = (Math.abs(Math.sin(pitch + this.camera[0])) - low) / (high - low);
        const ease = smoothstep(a);
        const width = this.widthAt(yaw);
        if (width <= 0) return 1;
        return 1 + (1 - ease) * ((flatten * this.widths[0]) / width - 1);
    }

    private projection(aspect: number, zoom: number): Mat4 {
        const h = (1.52 / zoom) * Math.max(1, 1 / aspect);
        const m = mat4.identity();
        m[0] = 1 / (h * aspect);
        m[5] = 1 / h;
        // Metal 的透视矩阵；顶点着色器负责把裁剪深度换算回 GLES
        const w0 = 1 / this.camera[2];
        const wz = -w0 / this.camera[1];
        m[0] *= this.horizontalScale;
        m[9] = (0.12 / h) * wz;
        m[10] = -w0 / 6;
        m[11] = wz;
        m[13] = (0.12 / h) * w0;
        m[14] = 0.5 * w0;
        m[15] = w0;
        return m;
    }

    /** 240 Hz 光照表的线性插值采样 */
    private frameAt(seconds: number): Float32Array {
        const loop = FRAME_COUNT - 1;
        let position = (seconds * FRAMES_PER_SECOND) % loop;
        if (position < 0) position += loop;
        const index = Math.floor(position);
        const blend = position - index;
        const a = index * FRAME_FLOATS;
        const b = (index + 1) * FRAME_FLOATS;
        for (let n = 0; n < FRAME_FLOATS; n++) {
            const current = this.frames[a + n];
            this.frame[n] = current + (this.frames[b + n] - current) * blend;
        }
        return this.frame;
    }

    // ------------------------------------------------------------ 绘制

    /**
     * 渲染一帧。`width`/`height` 是画布尺寸；`oversample` 会先按倍数渲染到离屏目标，
     * 再由 copy pass 缩回，这样按压放大用的是真实像素而不是被放大的位图。
     */
    draw(options: DiamondDrawOptions): void {
        const gl = this.gl;
        const {
            yaw, pitch, time, oversample = 1,
            roll = 0, alpha = 1, palette = PALETTE_BLUE, white = 0, dt = 0,
        } = options;
        const width = Math.max(1, Math.round(options.width));
        const height = Math.max(1, Math.round(options.height));
        const renderWidth = Math.max(1, Math.round(width * oversample));
        const renderHeight = Math.max(1, Math.round(height * oversample));
        if (!this.targets || renderWidth !== this.width || renderHeight !== this.height) {
            this.createTargets(renderWidth, renderHeight);
        }

        const frame = this.frameAt(time);
        const yawRadians = (yaw * Math.PI) / 180;
        const pitchRadians = (pitch * Math.PI) / 180;
        const rollRadians = (roll * Math.PI) / 180;

        this.horizontalScale = this.horizontalSqueeze(yawRadians, pitchRadians + this.camera[0]);

        // 模型：先绕 z 翻滚、再绕 x 俯仰、最后绕 y 偏航（列主序，右乘）
        const model = mat4.multiply(mat4.identity(), mat4.rotationZ(-rollRadians), mat4.rotationX(pitchRadians));
        mat4.multiply(model, model, mat4.rotationY(yawRadians));
        this.model.set(model);
        mat4.transpose(this.inverse, model);

        // 哪个象限正对相机，以及它自带的闪光是否可见
        let best = -1;
        let angle = 0;
        for (let n = 0; n < 4; n++) {
            const quarter = (n * Math.PI) / 2;
            const facing = Math.cos(yawRadians + quarter) * Math.cos(pitchRadians - this.camera[0]);
            if (facing > best) { best = facing; angle = quarter; }
        }
        const delta = Math.atan2(Math.sin(yawRadians - this.previousYaw), Math.cos(yawRadians - this.previousYaw));
        const rate = this.hasPrevious && dt > 0
            ? Math.hypot(delta, pitchRadians - this.previousPitch) / dt
            : 0.596;
        this.previousYaw = yawRadians;
        this.previousPitch = pitchRadians;
        this.hasPrevious = true;

        const visibility = smoothstep(1 - Math.acos(Math.max(-1, Math.min(1, best))) / (Math.PI / 15))
            * smoothstep((((Math.PI * 2) / 15) / Math.max(rate, 0.001) - 0.06) / 0.34);

        const zoom = (336 / 512) * (1.52 / this.widths[0]);
        this.projectionMatrix = this.projection(renderWidth / renderHeight, zoom);

        const targets = this.targets;
        if (!targets) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, targets.msaa);
        gl.viewport(0, 0, renderWidth, renderHeight);
        gl.depthMask(true);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

        this.setup(this.programDiamond.program, frame, time, angle, visibility, renderWidth, renderHeight, palette);

        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.depthFunc(gl.LEQUAL);
        this.drawMesh(this.programDiamond, this.meshBody, this.meshBody.count);

        this.setup(this.programSparkle.program, frame, time, angle, visibility, renderWidth, renderHeight, palette);
        gl.enable(gl.BLEND);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.DEPTH_TEST);

        gl.useProgram(this.programSparkle.program);
        gl.uniform1ui(this.uniforms.at(this.programSparkle.program, 'baseInstance'), 0);
        this.drawMesh(this.programSparkle, this.meshMain, this.meshMain.count, 1);
        gl.uniform1ui(this.uniforms.at(this.programSparkle.program, 'baseInstance'), 1);
        this.drawMesh(this.programSparkle, this.meshSmall, this.meshSmall.count, 7);

        // 先解析 MSAA，再对整组预乘像素（含闪光）做淡入
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, targets.msaa);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, targets.resolved);
        gl.blitFramebuffer(0, 0, renderWidth, renderHeight, 0, 0, renderWidth, renderHeight,
            gl.COLOR_BUFFER_BIT, gl.NEAREST);

        this.composite(width, height, alpha, white);
    }

    private drawMesh(programInfo: ProgramInfo, mesh: Mesh, count: number, instanceCount?: number): void {
        const gl = this.gl;
        gl.useProgram(programInfo.program);
        gl.bindVertexArray(mesh.vao);
        if (instanceCount === undefined) {
            gl.drawArrays(gl.TRIANGLES, 0, count);
        } else {
            gl.drawArraysInstanced(gl.TRIANGLES, 0, count, instanceCount);
        }
    }

    /**
     * 把解析后的结果缩到画布。超采样时在这里做 3×3 盒式平均：
     * 交给浏览器用双线性缩，会把 1px 的抗锯齿边整个丢掉，边缘又变回硬台阶。
     * 按压放大仍由宿主用 CSS transform 施加（整个元素缩放，与官方一致）。
     */
    private composite(width: number, height: number, alpha: number, white: number): void {
        const gl = this.gl;
        const targets = this.targets;
        if (!targets) return;
        const program = this.programCopy.program;
        // 渲染目标 / 显示尺寸，1 表示没有超采样
        const taps = this.width > 0 && width > 0 ? this.width / width : 1;
        const step = taps / 3;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.disable(gl.BLEND);
        gl.disable(gl.DEPTH_TEST);
        gl.useProgram(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, targets.texture);
        gl.uniform1i(this.uniforms.at(program, 'image'), 0);
        gl.uniform1f(this.uniforms.at(program, 'opacity'), alpha);
        gl.uniform1f(this.uniforms.at(program, 'white'), white);
        gl.uniform1f(this.uniforms.at(program, 'copyTaps'), taps);
        gl.uniform2f(this.uniforms.at(program, 'copyStep'), step / this.width, step / this.height);
        gl.bindVertexArray(this.emptyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
        gl.enable(gl.DEPTH_TEST);
    }

    private setup(
        program: WebGLProgram,
        frame: Float32Array,
        seconds: number,
        angle: number,
        visibility: number,
        width: number,
        height: number,
        palette: number,
    ): void {
        const u = this.uniforms;
        const gl = this.gl;
        gl.useProgram(program);
        u.matrix(program, 'u.model', this.model);
        u.matrix(program, 'u.inverseModel', this.inverse);
        u.matrix(program, 'u.projection', this.projectionMatrix);
        u.float4(program, 'u.parameters', seconds, 0.72, 1, 1);
        u.float4(program, 'u.facetProjection',
            this.facetProjection[0], this.facetProjection[1], this.facetProjection[2], this.facetProjection[3]);
        u.float4(program, 'u.appearance', palette, 0, 0, 0);
        u.float4(program, 'u.referenceCrownFlash', 0, 0, 0, 0);
        u.float4(program, 'u.referencePavilionFlash', 0, 0, 0, 0);

        for (let n = 0; n < 8; n++) {
            const position = u.at(program, `anchors[${n}].position`);
            const normal = u.at(program, `anchors[${n}].normal`);
            gl.uniform4fv(position, this.anchors.subarray(n * 8, n * 8 + 4));
            gl.uniform4fv(normal, this.anchors.subarray(n * 8 + 4, n * 8 + 8));
        }

        u.float4(program, 'u.viewport', width, height, 17, 0);
        u.float4(program, 'u.sparkleShape', frame[36], frame[37], frame[38], frame[39]);
        u.float4(program, 'u.sparkleHalo', frame[40], angle, this.horizontalScale, visibility);
        for (let n = 0; n < LIGHTS.length; n++) {
            u.float4(program, `u.${LIGHTS[n]}`, frame[n * 4], frame[n * 4 + 1], frame[n * 4 + 2], frame[n * 4 + 3]);
        }
        gl.uniform4fv(u.at(program, 'planes[0]'), this.planes);
    }

    /** 释放 GPU 资源（上下文本身由调用方持有） */
    dispose(): void {
        const gl = this.gl;
        this.destroyTargets();
        for (const program of [this.programDiamond, this.programSparkle, this.programCopy]) {
            if (program) gl.deleteProgram(program.program);
        }
        for (const mesh of [this.meshBody, this.meshMain, this.meshSmall]) {
            if (mesh) gl.deleteVertexArray(mesh.vao);
        }
        if (this.emptyVao) gl.deleteVertexArray(this.emptyVao);
    }
}
