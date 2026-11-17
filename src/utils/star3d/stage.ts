/**
 * 星星渲染调度：**一个** WebGL 上下文服务所有星星实例。
 *
 * 与钻石那边同一套做法：只保留一个离屏画布，逐帧为每个可见星星按各自姿态渲染一次，
 * 再把结果 `drawImage` 到组件自己的 2D 画布上。星星在页面上可能出现多个（入口卡片、
 * 详情弹窗、设置页头部），每个实例各开一个 GL 上下文会撞上浏览器约 16 个的上限。
 *
 * 门控：
 * - 只有视口内（组件用共享 IntersectionObserver 判定）的星星参与渲染；
 * - 没有可见星星时停掉 rAF，不常驻空转；
 * - 空闲 30 fps、拖动 / 按压时 60 fps；节流按「上一次真正绘制」累计 delta，
 *   动画速度不受跳帧影响；
 * - `prefers-reduced-motion` 时只画一帧静止的星星（不淡入、不自转、不播空闲把戏）。
 */

import type { StarDrawOptions } from './scene';
import { StarFrameClock, StarMotion } from './motion';
import type { StarPose } from './motion';

/** 空闲帧率：星星大部分时间只是安静躺着，30 足够 */
const IDLE_FPS = 30;
/** 交互帧率 */
const ACTIVE_FPS = 60;
/** 单帧 delta 上限（秒）：卡顿后不跳姿态 */
const MAX_DELTA = 0.1;
/** 渲染分辨率上限（设备像素）：120 CSS 像素 × 2 DPR = 240，留足余量 */
const MAX_RENDER_PX = 512;
/** 渲染分辨率下限 */
const MIN_RENDER_PX = 32;
/** 设备像素比上限：3x 屏上再把 512 顶满没有意义，只会让软件光栅化过载 */
const MAX_DPR = 2;
/** 默认显示尺寸（CSS 像素） */
const DEFAULT_SIZE = 120;
/** 初始化失败后的重试冷却（毫秒） */
const INIT_RETRY_MS = 3000;

/** 一个星星实例在调度器里需要实现的东西 */
interface StarSprite {
    /** 视口内？离屏时不渲染 */
    visible: boolean;
    /** 是否持续动画（减少动效时为 false，只画一帧） */
    animated: boolean;
    /** 交互中（拖动 / 按压 / 松手回位）：提高帧率 */
    urgent: boolean;
    /** 需要补画一帧（姿态变化 / 刚滚回视口） */
    dirty: boolean;
    /** 推进并绘制一帧 */
    paint(delta: number): void;
}

/** 系统是否要求减少动效 */
function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

class StarStage {
    private canvas: HTMLCanvasElement | null = null;
    private gl: WebGL2RenderingContext | null = null;
    private scene: { draw(options: StarDrawOptions): void; dispose(): void } | null = null;
    private initPromise: Promise<void> | null = null;
    /** 上一次初始化的失败原因；短暂失败（模型请求被打断）允许退避重试 */
    private failure: unknown = null;
    private failedAt = 0;
    /** 上下文丢失是永久性的，不再重试 */
    private lost = false;

    private readonly sprites = new Set<StarSprite>();
    private raf = 0;
    private lastDraw = 0;
    private size = 0;
    /** 每个 sprite 当前画布的像素边长；共享画布按其中的最大值开 */
    private readonly spritePixels = new Map<StarSprite, number>();

    /** 最近一次初始化失败的原因（诊断用） */
    get lastError(): unknown {
        return this.failure;
    }

    /** 共享画布边长（设备像素，正方形） */
    get renderSize(): number {
        if (!this.size) {
            const dpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, MAX_DPR);
            this.size = Math.min(MAX_RENDER_PX, Math.max(MIN_RENDER_PX, Math.round(DEFAULT_SIZE * dpr)));
        }
        return this.size;
    }

    /**
     * 登记一个星星的画布像素尺寸，并把共享画布调到其中的最大值。
     *
     * 所有星星共用一个上下文，所以画布只按当前最大的那颗开；小星星由
     * `drawImage` 缩回自己的尺寸（双线性，视觉上够用）。
     */
    trackPixels(sprite: StarSprite, pixels: number): void {
        this.spritePixels.set(sprite, pixels);
        this.applyLargestPixels();
    }

    private applyLargestPixels(): void {
        let largest = MIN_RENDER_PX;
        for (const pixels of this.spritePixels.values()) largest = Math.max(largest, pixels);
        if (largest === this.size) return;
        this.size = largest;
        if (this.canvas) {
            // 画布尺寸一变，下一帧的 viewport 跟着新尺寸
            this.canvas.width = largest;
            this.canvas.height = largest;
        }
    }

    get glCanvas(): HTMLCanvasElement | null {
        return this.canvas;
    }

    /**
     * 懒初始化：第一次有星星需要渲染时才拉模型、建上下文。
     *
     * @returns 就绪后 resolve；失败时 reject（调用方保持空画布降级）
     */
    init(): Promise<void> {
        if (this.scene) return Promise.resolve();
        if (this.initPromise) return this.initPromise;
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
                // 画布内容会被 drawImage 读走，按预乘 alpha 解释（片元输出的也是预乘）
                premultipliedAlpha: true,
                // 官方用 4× MSAA 再 Resolve 回后缓冲；WebGL 里交给默认帧缓冲的 MSAA
                antialias: true,
                // 深度测试要开：星星自己是立体的，靠深度区分前后
                depth: true,
                // drawImage 要读回画布内容，必须保留绘制缓冲
                preserveDrawingBuffer: true,
                powerPreference: 'low-power',
            });
            if (!gl) throw new Error('WebGL2 unavailable');

            try {
                // 渲染器与模型表各自单独成 chunk：普通页面不背 630 KB 的星星几何
                const [{ StarScene }, { loadStarTables, loadStarTextures }] = await Promise.all([
                    import('./scene'),
                    import('./tables'),
                ]);
                const [tables, textures] = await Promise.all([loadStarTables(), loadStarTextures()]);
                const scene = StarScene.create(gl, tables, textures);

                // 加载期间可能有新的星星登记了更大的像素尺寸，这里按最新最大值校正
                const pixels = this.renderSize;
                if (canvas.width !== pixels) {
                    canvas.width = pixels;
                    canvas.height = pixels;
                }

                canvas.addEventListener('webglcontextlost', (event) => {
                    event.preventDefault();
                    this.lost = true;
                    this.scene = null;
                    this.gl = null;
                    this.canvas = null;
                    this.stop();
                });

                this.canvas = canvas;
                this.gl = gl;
                this.scene = scene;
                this.failure = null;
                // 初始化期间可能有星星已经请求过帧（那时 scene 还是空），就绪后补一次
                if (this.sprites.size > 0) this.request();
            } catch (error) {
                // 失败时显式丢掉上下文：GL 上下文有硬上限，每次重试都新建一个迟早拖垮别处
                gl.getExtension('WEBGL_lose_context')?.loseContext();
                throw error;
            }
        })();

        this.initPromise.catch((error: unknown) => {
            this.failure = error;
            this.failedAt = Date.now();
            this.initPromise = null;
            if (import.meta.env.DEV) console.warn('[star3d] init failed', error);
        });
        return this.initPromise;
    }

    /**
     * 登记一个星星。
     *
     * @param sprite 星星实现的渲染接口
     * @returns 注销函数（幂等）
     */
    add(sprite: StarSprite): () => void {
        this.sprites.add(sprite);
        this.request();
        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.sprites.delete(sprite);
            this.spritePixels.delete(sprite);
            this.applyLargestPixels();
            if (this.sprites.size === 0) this.stop();
        };
    }

    /** 请求重绘（姿态或可见性变化后调用）；未就绪时顺带推进初始化 */
    request(): void {
        if (!this.scene && !this.lost) {
            void this.init().catch(() => {
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
            // 尚未就绪（模型还在路上）：等 request() 再启动，不空转
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

        if (this.hasWork()) this.raf = requestAnimationFrame(this.tick);
    };

    /** 把一颗星星按当前姿态画进共享离屏画布（结果由调用方 drawImage 取走） */
    render(state: StarDrawOptions): void {
        const scene = this.scene;
        const gl = this.gl;
        const canvas = this.canvas;
        if (!scene || !gl || !canvas) return;

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        // 每颗星星先清成完全透明：画布在实例之间复用，不能留上一颗的像素
        gl.clearColor(0, 0, 0, 0);
        gl.clearDepth(1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        scene.draw({ ...state, width: canvas.width, height: canvas.height });
    }

    /** 释放上下文（热重载 / 退出时用） */
    dispose(): void {
        this.stop();
        this.scene?.dispose();
        this.scene = null;
        this.gl = null;
        this.canvas = null;
        this.sprites.clear();
        this.spritePixels.clear();
        this.size = 0;
        this.initPromise = null;
        this.failure = null;
        this.failedAt = 0;
        this.lost = false;
    }
}

/** 全进程唯一的星星渲染调度器 */
export const starStage = new StarStage();

/** 挂载参数 */
export interface StarMountOptions {
    /** 显示边长（CSS 像素），默认 120；必须与组件的 CSS 尺寸一致 */
    size?: number;
    /** 夜间主题（只影响高光与背景色） */
    night?: boolean;
    /** 金色外观（默认 true；false 走 Premium 紫星分支） */
    golden?: boolean;
    /** 是否播放动画（默认 true；减少动效时强制关闭） */
    animated?: boolean;
    /** 每帧回调，宿主可以据此做跟随动效 */
    onFrame?: (pose: StarPose) => void;
}

/** 一颗星星的控制句柄 */
export interface StarHandle {
    /**
     * 拖动倾斜。
     *
     * @param dx 水平位移，**上一次减当前**（与官方手势同向；向右拖为负）
     * @param dy 竖直位移，上一次减当前（向下拖为负）
     */
    setTilt(dx: number, dy: number): void;
    /** 按下（true）或松手（false）；松手后沿过冲曲线回位 */
    setActive(active: boolean): void;
    /** 切换日夜主题 */
    setNight(night: boolean): void;
    /** 改变显示尺寸（CSS 像素） */
    setSize(cssSize: number): void;
    /** 视口门控：离屏时停掉渲染 */
    setVisible(visible: boolean): void;
    /** 释放渲染资源 */
    dispose(): void;
}

/**
 * 把一块 2D 画布接到共享渲染器上，成为一颗可拖动、会自己玩的 3D 金星。
 *
 * @param target 组件里用来显示星星的 2D 画布
 * @param options 尺寸、主题与外观
 * @returns 控制句柄
 */
export function mountStar3D(target: HTMLCanvasElement, options: StarMountOptions = {}): StarHandle {
    const context = target.getContext('2d');
    const reduced = prefersReducedMotion();
    const motion = new StarMotion();
    const clock = new StarFrameClock();
    let animating = (options.animated ?? true) && !reduced;
    if (!animating) clock.settle();

    let night = options.night ?? false;
    const golden = options.golden ?? true;
    let cssSize = options.size && options.size > 0 ? options.size : DEFAULT_SIZE;

    const dpr = Math.min(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1, MAX_DPR);
    /** CSS 尺寸 → 设备像素，夹在上下限之间 */
    const pixelsFor = (size: number): number =>
        Math.min(MAX_RENDER_PX, Math.max(MIN_RENDER_PX, Math.round(size * dpr)));

    let interacting = false;

    const sprite: StarSprite = {
        visible: false,
        animated: animating,
        urgent: false,
        dirty: true,
        paint(delta: number) {
            const canvas = starStage.glCanvas;
            if (!canvas) return;
            if (sprite.animated) {
                const pose = motion.advance(delta);
                clock.advance(delta);
                options.onFrame?.(pose);
            }
            starStage.render({
                width: canvas.width,
                height: canvas.height,
                angleX: motion.angleX,
                angleY: motion.angleY,
                lift: motion.lift,
                alpha: clock.alpha,
                time: clock.time,
                xOffset: clock.xOffset,
                night,
                golden,
            });
            if (context) {
                context.clearRect(0, 0, target.width, target.height);
                // 共享画布可能比这块大（别的实例更大），按自己的尺寸贴回来
                context.drawImage(canvas, 0, 0, target.width, target.height);
            }
            // 松手回位跑完后自动降回空闲帧率
            if (!interacting && !motion.animating) sprite.urgent = false;
        },
    };

    function resize(): void {
        const pixels = pixelsFor(cssSize);
        if (target.width !== pixels) {
            target.width = pixels;
            target.height = pixels;
        }
        starStage.trackPixels(sprite, pixels);
    }

    resize();
    const release = starStage.add(sprite);

    return {
        setTilt(dx: number, dy: number) {
            motion.drag(dx, dy);
            sprite.dirty = true;
            starStage.request();
        },
        setActive(active: boolean) {
            interacting = active;
            if (active) {
                motion.press();
                sprite.urgent = true;
            } else if (sprite.animated) {
                motion.release();
                // 回位这 0.6 s 按 60 fps 走，跑完 paint 里再降频
                sprite.urgent = true;
            } else {
                // 减少动效：不推进时间，弹簧永远跑不完，直接归位
                motion.reset();
                sprite.urgent = false;
            }
            sprite.dirty = true;
            starStage.request();
        },
        setNight(next: boolean) {
            if (night === next) return;
            night = next;
            sprite.dirty = true;
            starStage.request();
        },
        setSize(next: number) {
            if (!next || next <= 0 || next === cssSize) return;
            cssSize = next;
            resize();
            sprite.dirty = true;
            starStage.request();
        },
        setVisible(visible: boolean) {
            if (sprite.visible === visible) return;
            sprite.visible = visible;
            if (visible) {
                sprite.dirty = true;
                starStage.request();
            }
        },
        dispose() {
            release();
        },
    };
}
