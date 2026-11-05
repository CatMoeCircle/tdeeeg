/**
 * 钻石渲染调度：**一个** WebGL 上下文服务所有转账气泡。
 *
 * 消息列表里不能每个气泡开一个 GL 上下文——上下文数量有硬上限，而且每个都要
 * 编译 37 KB 的片元着色器。这里只保留一个离屏画布，逐帧为每个可见气泡按各自
 * 姿态渲染一次，再把结果 `drawImage` 到气泡自己的 2D 画布上。
 *
 * 门控：
 * - 只有视口内（由组件用共享 IntersectionObserver 判定）的气泡参与渲染；
 * - 没有可见气泡时停掉 rAF，不常驻空转；
 * - 空闲 30 fps、拖动 / 按压时 60 fps；节流按「上一次真正绘制」累计 delta，
 *   动画速度不受跳帧影响；
 * - 开启「减少动效」时不推进时间，只画一帧静止的石头。
 */

import type { DiamondScene } from './scene';
import { DiamondMotion, DIAMOND_MOTION } from './motion';
import { PALETTE_COOL } from './palette';

/** 空闲帧率：42 dp 的小石头没必要跑满 60 */
const IDLE_FPS = 30;
/** 交互帧率 */
const ACTIVE_FPS = 60;
/** 单帧 delta 上限（秒）：卡顿后不跳姿态 */
const MAX_DELTA = 0.1;
/** 渲染分辨率上限（设备像素）：按压放大时也不糊，同时不让软件光栅化过载 */
const MAX_RENDER_PX = 192;
/** 相对 CSS 尺寸的超采样倍数：42 dp 的石头用 3× 画再缩回去，边缘才不会糊 */
const RENDER_SUPERSAMPLE = 3;
/** 初始化失败后的重试冷却（毫秒） */
const INIT_RETRY_MS = 3000;

/** 一个气泡里的钻石需要实现的东西 */
interface DiamondSprite {
    /** 视口内？离屏时不渲染 */
    visible: boolean;
    /** 是否持续动画（减少动效时为 false，只画一帧） */
    animated: boolean;
    /** 交互中（拖动 / 按压）：提高帧率 */
    urgent: boolean;
    /** 需要补画一帧（姿态变化 / 刚滚回视口） */
    dirty: boolean;
    /** 推进并绘制一帧 */
    paint(delta: number): void;
}

function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

class DiamondStage {
    private canvas: HTMLCanvasElement | null = null;
    private gl: WebGL2RenderingContext | null = null;
    private scene: DiamondScene | null = null;
    private initPromise: Promise<void> | null = null;
    /** 上一次初始化的失败原因；短暂失败（例如模型表请求被打断）允许退避重试 */
    private failure: unknown = null;
    private failedAt = 0;
    /** 上下文丢失是永久性的，不再重试 */
    private lost = false;

    private readonly sprites = new Set<DiamondSprite>();
    private raf = 0;
    private lastDraw = 0;
    private size = 0;

    /** 最近一次初始化失败的原因（诊断用） */
    get lastError(): unknown {
        return this.failure;
    }

    /** 渲染分辨率（设备像素，正方形）；所有气泡共用，避免反复重建离屏目标 */
    get renderSize(): number {
        if (!this.size) {
            const dpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, 2);
            this.size = Math.min(MAX_RENDER_PX, Math.max(48, Math.round(42 * dpr * RENDER_SUPERSAMPLE)));
        }
        return this.size;
    }

    get glCanvas(): HTMLCanvasElement | null {
        return this.canvas;
    }

    /**
     * 懒初始化：第一次有气泡需要渲染时才拉模型表、建上下文。
     *
     * @returns 就绪后 resolve；失败时 reject（调用方保持空画布降级）
     */
    init(): Promise<void> {
        if (this.scene) return Promise.resolve();
        if (this.initPromise) return this.initPromise;
        // 永久失败（上下文丢失）直接拒绝；短暂失败按退避重试，避免一次网络抖动
        // 就让整个会话里的钻石全部消失
        if (this.lost) return Promise.reject(this.failure ?? new Error('WebGL context lost'));
        if (this.failure && Date.now() - this.failedAt < INIT_RETRY_MS) {
            return Promise.reject(this.failure);
        }

        this.initPromise = (async () => {
            const canvas = document.createElement('canvas');
            const size = this.renderSize;
            canvas.width = size;
            canvas.height = size;
            const gl = canvas.getContext('webgl2', {
                alpha: true,
                premultipliedAlpha: true,
                antialias: false,
                // drawImage 要读回画布内容，必须保留绘制缓冲
                preserveDrawingBuffer: true,
                powerPreference: 'low-power',
            });
            if (!gl) throw new Error('WebGL2 unavailable');
            canvas.addEventListener('webglcontextlost', (event) => {
                event.preventDefault();
                this.lost = true;
                this.scene = null;
                this.gl = null;
                this.canvas = null;
                this.stop();
            });

            // 渲染器（着色器源码）单独成 chunk；模型表是 9 个本地 .bin
            // （共 524 KB），只有真的出现 Gram 转账消息时才读取，普通聊天
            // 不会背上这份体积；读进来直接开 Float32Array 视图，零拷贝共享。
            const [{ DiamondScene: SceneClass }, { loadDiamondTables }] = await Promise.all([
                import('./scene'),
                import('./tables'),
            ]);
            const tables = await loadDiamondTables();
            const scene = SceneClass.create(gl, tables, 4);
            this.canvas = canvas;
            this.gl = gl;
            this.scene = scene;
            this.failure = null;
        })();

        this.initPromise.catch((error: unknown) => {
            this.failure = error;
            this.failedAt = Date.now();
            this.initPromise = null;
            if (import.meta.env.DEV) console.warn('[diamond] init failed', error);
        });
        return this.initPromise;
    }

    /**
     * 登记一个气泡。
     *
     * @param sprite 气泡实现的渲染接口
     * @returns 注销函数（幂等）
     */
    add(sprite: DiamondSprite): () => void {
        this.sprites.add(sprite);
        this.request();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.sprites.delete(sprite);
            if (this.sprites.size === 0) this.stop();
        };
    }

    /** 请求重绘（姿态或可见性变化后调用）；未就绪时顺带推进初始化 */
    request(): void {
        if (!this.scene && !this.lost) {
            void this.init().catch(() => {
                // 失败后按冷却时间再试一次，网络抖动不该让钻石永久消失
                if (this.sprites.size > 0) {
                    window.setTimeout(() => this.request(), INIT_RETRY_MS);
                }
            });
        }
        if (this.raf || this.sprites.size === 0) return;
        this.lastDraw = 0;
        this.raf = requestAnimationFrame(this.tick);
    }

    private stop(): void {
        if (this.raf) cancelAnimationFrame(this.raf);
        this.raf = 0;
    }

    private hasWork(): boolean {
        for (const sprite of this.sprites) {
            if (sprite.visible && (sprite.animated || sprite.dirty || sprite.urgent)) return true;
        }
        return false;
    }

    private targetFps(): number {
        for (const sprite of this.sprites) {
            if (sprite.visible && sprite.urgent) return ACTIVE_FPS;
        }
        return IDLE_FPS;
    }

    private tick = (now: number): void => {
        this.raf = 0;
        if (!this.scene || !this.canvas || !this.gl) {
            // 尚未就绪（模型表还在路上）：等 request() 再启动，不空转
            return;
        }

        // 节流：按上一次真正绘制累计 delta，动画速度不受跳帧影响
        const interval = 1000 / this.targetFps();
        if (this.lastDraw && now - this.lastDraw < interval - 1.5) {
            this.raf = requestAnimationFrame(this.tick);
            return;
        }
        const delta = this.lastDraw ? Math.min((now - this.lastDraw) / 1000, MAX_DELTA) : 1 / this.targetFps();
        this.lastDraw = now;

        for (const sprite of this.sprites) {
            if (!sprite.visible) continue;
            if (!sprite.animated && !sprite.dirty && !sprite.urgent) continue;
            sprite.dirty = false;
            sprite.paint(delta);
        }

        if (this.hasWork()) {
            this.raf = requestAnimationFrame(this.tick);
        }
    };

    /** 按一个姿态把石头画进共享离屏画布（结果由调用方 drawImage 取走） */
    render(motion: DiamondMotion, palette: number, delta: number): void {
        const scene = this.scene;
        const canvas = this.canvas;
        const gl = this.gl;
        if (!scene || !canvas || !gl) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        scene.draw({
            width: canvas.width,
            height: canvas.height,
            yaw: motion.yaw,
            pitch: motion.pitch,
            time: motion.time,
            palette,
            dt: delta,
            oversample: 1,
        });
    }

    /** 释放上下文（热重载 / 退出时用） */
    dispose(): void {
        this.stop();
        this.scene?.dispose();
        this.scene = null;
        this.gl = null;
        this.canvas = null;
        this.sprites.clear();
        this.initPromise = null;
        this.failure = null;
        this.failedAt = 0;
        this.lost = false;
    }
}

export const diamondStage = new DiamondStage();

export interface DiamondHandle {
    /** 姿态模型，供交互层读取 */
    motion: DiamondMotion;
    /** 视口门控：离屏时停掉渲染 */
    setVisible(visible: boolean): void;
    /** 姿态变化后补画一帧 */
    invalidate(): void;
    /** 交互动画中（拖动 / 按压）提高帧率 */
    setUrgent(urgent: boolean): void;
    dispose(): void;
}

/**
 * 把一块 2D 画布接到共享渲染器上，成为一颗可拖动 / 按压的钻石。
 *
 * @param options 画布与配色
 * @returns 控制句柄
 */
export function mountDiamond(options: {
    /** 气泡里用来显示石头的 2D 画布 */
    target: HTMLCanvasElement;
    /** 配色，转账气泡固定用 Cool */
    palette?: number;
    /** 是否自转（默认开启；减少动效时自动关闭） */
    spin?: boolean;
    /** 每帧回调：宿主要跟着姿态更新 CSS（例如按压放大） */
    onFrame?: (motion: DiamondMotion) => void;
}): DiamondHandle {
    const { target } = options;
    const palette = options.palette ?? PALETTE_COOL;
    const reduced = prefersReducedMotion();
    const motion = new DiamondMotion(DIAMOND_MOTION);
    motion.setSpinning((options.spin ?? true) && !reduced);

    const context = target.getContext('2d');
    const size = diamondStage.renderSize;
    target.width = size;
    target.height = size;

    const sprite: DiamondSprite = {
        visible: false,
        animated: motion.spinning,
        urgent: false,
        dirty: false,
        paint(delta: number) {
            const canvas = diamondStage.glCanvas;
            if (!canvas) return;
            if (sprite.animated || sprite.urgent) motion.move(delta);
            diamondStage.render(motion, palette, delta);
            if (context) {
                context.clearRect(0, 0, target.width, target.height);
                context.drawImage(canvas, 0, 0);
            }
            options.onFrame?.(motion);
        },
    };

    // add() 内部会 request()，首次 request 顺带把渲染器初始化起来
    const release = diamondStage.add(sprite);

    return {
        motion,
        setVisible(visible: boolean) {
            if (sprite.visible === visible) return;
            sprite.visible = visible;
            if (visible) {
                sprite.dirty = true;
                diamondStage.request();
            }
        },
        invalidate() {
            sprite.dirty = true;
            diamondStage.request();
        },
        setUrgent(urgent: boolean) {
            sprite.urgent = urgent;
        },
        dispose() {
            release();
        },
    };
}
