/**
 * 星星的姿态模型：自转、拖动、松手回位、以及空闲时轮播的小把戏。
 *
 * 逐条移植自 Telegram 官方桌面端渲染器的 IconMotion（IconMotion.cpp/.h），
 * 三个通道与官方一致：
 *   angleX —— 绕竖直轴转（"偏航"）
 *   angleY —— 绕水平轴翻（"俯仰"）
 *   lift   —— 在模型空间里把星星整体抬起几个单位（打盹时上下浮动）
 *
 * 官方行为：
 * - 静止两秒后开始一个空闲把戏，把戏从一个洗过的牌堆里抽，抽完一轮才重洗；
 *   星星的牌堆是 5 个：拉一下 / 慢慢翻一圈 / 打盹 / 快翻（两次）。
 * - 拖动按 1.5°/px、0.15°/px 改角度；松手 0.6 s 沿 tension=2 的过冲曲线回到原位。
 * - 一次把戏结束时把 angleX 归零：每个把戏都转整数圈，归零看不出来。
 *
 * 与官方的差异只有一处：官方拖动**不**限幅，网页端可以一路把星星翻过去；
 * 这里按交互需求给俯仰加 ±60° 限幅（偏航仍是自由的）。
 *
 * 金色星星不播"转半圈再弹回来"的出场（官方只对非金色外观调 Enter），
 * 它只有 0.22 s 的透明度淡入，那部分在 StarFrameClock 里。
 */

/** 空闲几秒后开始一个把戏（秒） */
const IDLE_DELAY_SECONDS = 2;

/**
 * 官方按"密度 3 的物理像素"给出拖动系数，并注明一个逻辑像素就是
 * density-independent 像素，所以这里直接把系数乘上密度。
 */
const DENSITY = 3;
/** 偏航：每逻辑像素的度数 */
const YAW_PER_PIXEL = 0.5 * DENSITY;
/** 俯仰：每逻辑像素的度数（远小于偏航，否则一碰就翻） */
const PITCH_PER_PIXEL = 0.05 * DENSITY;

/** 俯仰限幅（度）：官方不限，网页端按交互需求加一个 */
export const PITCH_LIMIT_DEGREES = 60;

/** 打盹时的抬起量关键帧（模型单位），等距取点 */
const WOBBLE_KEYS = [0, 2, -3, 2, -1, 2, -3, 2, -1, 0] as const;

/** 淡入时长（秒）：官方 220 ms */
export const ALPHA_FADE_SECONDS = 0.22;
/** 闪光偏移的漂移速度（每秒），官方 0.03 */
export const X_OFFSET_PER_SECOND = 0.03;

/** 松手回位时长（秒） */
const BACK_SECONDS = 0.6;

/** 星星当前的姿态（advance() 复用同一个对象，避免每帧分配） */
export interface StarPose {
    /** 偏航角（度） */
    angleX: number;
    /** 俯仰角（度） */
    angleY: number;
    /** 抬起量（模型单位） */
    lift: number;
}

/** 缓动曲线，名字与官方一致 */
type Curve = 'linear' | 'standard' | 'easeOut' | 'easeOutQuint' | 'overshoot' | 'wobble';

/** 通道：与官方 Channel 枚举同序 */
const CHANNEL_X = 0;
const CHANNEL_Y = 1;
const CHANNEL_X2 = 2;

/** 一段动画：延迟 delay 秒后从 from 走到 to，走 duration 秒 */
interface Track {
    channel: number;
    curve: Curve;
    from: number;
    to: number;
    delay: number;
    duration: number;
}

/**
 * 三次贝塞尔缓动：与官方一样用牛顿迭代反解 x（最多 13 步、容差 1e-3），
 * 这样曲线落在设计好的数值上，而不是近似成别的形状。
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number, time: number): number {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;

    let x = time;
    for (let i = 1; i < 14; i++) {
        const z = x * (cx + x * (bx + x * ax)) - time;
        if (Math.abs(z) < 1e-3) break;
        x -= z / (cx + x * (2 * bx + 3 * ax * x));
    }

    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;

    return x * (cy + x * (by + x * ay));
}

/** 按曲线把一个 0..1 的时间映射成进度 */
function interpolate(curve: Curve, t: number): number {
    switch (curve) {
        case 'standard':
            return cubicBezier(0.25, 0.1, 0.25, 1, t);
        case 'easeOut':
            return cubicBezier(0, 0, 0.58, 1, t);
        case 'easeOutQuint':
            return cubicBezier(0.23, 1, 0.32, 1, t);
        case 'overshoot': {
            const tension = 2;
            const p = t - 1;
            return p * p * ((tension + 1) * p + tension) + 1;
        }
        default:
            return t;
    }
}

/** 在 [min, max] 之间夹住 */
function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value;
}

/** 星星的姿态机（官方 IconMotion 的移植，去掉了金币分支） */
export class StarMotion {
    /** 三个通道的当前值：X 偏航、Y 俯仰、X2 抬起 */
    private readonly values = [0, 0, 0];

    /** 正在播放的一组动画（官方固定 8 个槽位，超出的丢弃） */
    private readonly tracks: Track[] = [];
    private trackCount = 0;
    private setTime = 0;
    private setRunning = false;

    /** 松手回位：独立于上面那组动画 */
    private readonly backFrom = [0, 0, 0];
    private backTime = 0;
    private backRunning = false;

    /** 距下一次空闲把戏的秒数 / 出场的延迟，负数表示没有 */
    private idleIn = -1;
    private enterIn = -1;

    /** 洗过的牌堆：星星 5 个把戏，抽完一轮再洗 */
    private readonly deck = [0, 1, 2, 3, 4];
    private deckNext = 0;

    /** advance() 复用的姿态对象，避免每帧分配 */
    private readonly pose: StarPose = { angleX: 0, angleY: 0, lift: 0 };

    constructor() {
        this.shuffle();
        this.scheduleIdle();
    }

    /** 偏航角（度） */
    get angleX(): number {
        return this.values[CHANNEL_X];
    }

    /** 俯仰角（度） */
    get angleY(): number {
        return this.values[CHANNEL_Y];
    }

    /** 抬起量（模型单位） */
    get lift(): number {
        return this.values[CHANNEL_X2];
    }

    /** 是否正在播放动画（回位 / 一组把戏 / 出场延迟中） */
    get animating(): boolean {
        return this.backRunning || this.setRunning || this.enterIn >= 0;
    }

    /**
     * 出场：从 -180° 转到正面，延迟 delaySeconds 秒后开始回位。
     * 金色星星不调用它（官方只给 Premium 星和金币播这个）。
     */
    enter(delaySeconds: number): void {
        this.values[CHANNEL_X] = -180;
        this.enterIn = delaySeconds;
    }

    /** 按下：一切停在原地，直到松手前都不再空闲 */
    press(): void {
        this.cancel();
        this.idleIn = -1;
    }

    /**
     * 拖动：dx / dy 是"上一次减当前"的逻辑像素（与官方手势同向）。
     *
     * @param dx 水平位移，向右拖为负
     * @param dy 竖直位移，向下拖为负
     */
    drag(dx: number, dy: number): void {
        this.values[CHANNEL_X] += dx * YAW_PER_PIXEL;
        this.values[CHANNEL_Y] = clamp(
            this.values[CHANNEL_Y] + dy * PITCH_PER_PIXEL,
            -PITCH_LIMIT_DEGREES,
            PITCH_LIMIT_DEGREES,
        );
    }

    /** 松手：三个通道一起回原位，并从现在起重新计时空闲 */
    release(): void {
        this.startBack();
    }

    /**
     * 立刻回到静止姿态。
     *
     * 给"减少动效"用：那种模式下不推进时间，弹簧回位也就永远跑不完，
     * 松手时直接归零，星星不会停在拖动后的角度上。
     */
    reset(): void {
        this.cancel();
        this.values[CHANNEL_X] = 0;
        this.values[CHANNEL_Y] = 0;
        this.values[CHANNEL_X2] = 0;
        this.pose.angleX = 0;
        this.pose.angleY = 0;
        this.pose.lift = 0;
        this.enterIn = -1;
        this.idleIn = -1;
    }

    /**
     * 点一下：官方把星星"推"向点的那一侧再弹回来；如果已经被转得太远，
     * 就让松手回位跑下去（返回 false 表示没接手）。
     *
     * @param x 点处相对半边宽度的比例，左右各为负正
     * @param y 点处相对半边宽度的比例
     */
    tap(x: number, y: number): boolean {
        const toX = (40 + this.random(30)) * x;
        const toY = (40 + this.random(30)) * y;

        this.cancel();

        if (Math.abs(this.values[CHANNEL_X]) > 10) {
            this.startBack();
            return false;
        }

        this.idleIn = -1;

        this.add(CHANNEL_X, this.values[CHANNEL_X], toX, 0, 0.22, 'easeOutQuint');
        this.add(CHANNEL_X, toX, 0, 0.22, 0.6, 'overshoot');
        this.add(CHANNEL_Y, this.values[CHANNEL_Y], toY, 0, 0.22, 'easeOutQuint');
        this.add(CHANNEL_Y, toY, 0, 0.22, 0.6, 'overshoot');
        this.play();
        return true;
    }

    /**
     * 推进一个时间步，返回当前姿态（复用同一个对象）。
     *
     * @param step 秒，调用方应夹住上限（卡顿后不跳姿态）
     */
    advance(step: number): StarPose {
        if (this.enterIn >= 0) {
            this.enterIn -= step;
            if (this.enterIn < 0) this.startBack();
        }

        if (this.idleIn >= 0) {
            this.idleIn -= step;
            if (this.idleIn < 0) {
                if (this.setRunning || this.backRunning) {
                    this.scheduleIdle();
                } else {
                    this.startIdle();
                }
            }
        }

        if (this.backRunning) {
            this.backTime += step;
            const t = Math.min(this.backTime / BACK_SECONDS, 1);
            const remaining = 1 - interpolate('overshoot', t);
            for (let channel = 0; channel < 3; channel++) {
                this.values[channel] = this.backFrom[channel] * remaining;
            }
            if (t >= 1) this.backRunning = false;
        }

        if (this.setRunning) {
            this.setTime += step;
            let done = true;
            for (let index = 0; index < this.trackCount; index++) {
                const track = this.tracks[index];
                if (this.setTime < track.delay + track.duration) done = false;
                if (this.setTime < track.delay) continue;

                const t = Math.min((this.setTime - track.delay) / track.duration, 1);
                if (track.curve === 'wobble') {
                    const segments = WOBBLE_KEYS.length - 1;
                    const position = t * segments;
                    const k = Math.min(Math.floor(position), segments - 1);
                    this.values[track.channel] = WOBBLE_KEYS[k] + (WOBBLE_KEYS[k + 1] - WOBBLE_KEYS[k]) * (position - k);
                } else {
                    this.values[track.channel] = track.from + (track.to - track.from) * interpolate(track.curve, t);
                }
            }

            if (done) {
                // 每个把戏都转整数圈，归零看不出来，只防止角度无限增长
                this.values[CHANNEL_X] = 0;
                this.setRunning = false;
                this.trackCount = 0;
                this.scheduleIdle();
            }
        }

        this.pose.angleX = this.values[CHANNEL_X];
        this.pose.angleY = this.values[CHANNEL_Y];
        this.pose.lift = this.values[CHANNEL_X2];
        return this.pose;
    }

    /** 追加一段动画（槽位满了就丢弃，与官方一致） */
    private add(channel: number, from: number, to: number, delay: number, duration: number, curve: Curve): void {
        if (this.trackCount < 8) {
            this.tracks[this.trackCount++] = { channel, curve, from, to, delay, duration };
        }
    }

    /** 开始播放这一组动画 */
    private play(): void {
        this.setTime = 0;
        this.setRunning = true;
    }

    /** 停掉这一组动画与回位 */
    private cancel(): void {
        this.backRunning = false;
        this.setRunning = false;
        this.trackCount = 0;
    }

    /** 从当前位置一起回到原位，并从现在起重新计时空闲 */
    private startBack(): void {
        this.cancel();
        for (let channel = 0; channel < 3; channel++) {
            this.backFrom[channel] = this.values[channel];
        }
        this.backTime = 0;
        this.backRunning = true;
        this.scheduleIdle();
    }

    /** 重置空闲倒计时 */
    private scheduleIdle(): void {
        this.idleIn = IDLE_DELAY_SECONDS;
    }

    /** 从牌堆里抽一个把戏开始播 */
    private startIdle(): void {
        const trick = this.deck[this.deckNext++];
        if (this.deckNext >= this.deck.length) {
            this.shuffle();
            this.deckNext = 0;
        }

        switch (trick) {
            case 0:
                this.pull();
                break;
            case 1:
                this.slowFlip();
                break;
            case 2:
                this.sleep();
                break;
            default:
                this.flip();
                break;
        }
    }

    /** 拉一下：四分之一是"点头"，其余是转一圈多一点 */
    private pull(): void {
        const variant = this.random(4);

        if (variant === 0) {
            // 点头：先往后仰 48°，再弹回来
            this.add(CHANNEL_Y, this.values[CHANNEL_Y], 48, 0, 2.3, 'easeOutQuint');
            this.add(CHANNEL_Y, 48, 0, 2.3, 0.5, 'overshoot');
        } else {
            // 转 485°（约一圈三分之一），要么正转要么反转。
            // 官方从 angleY 起转而不是 angleX（静止时两者都是 0，所以无害），照抄。
            const turn = 485;
            const to = variant === 2 ? -turn : turn;
            this.add(CHANNEL_X, this.values[CHANNEL_Y], to, 0, 3.0, 'easeOutQuint');
            this.add(CHANNEL_X, to, 0, 3.0, 1.0, 'overshoot');
        }

        this.play();
    }

    /** 慢慢翻一圈：8 秒 */
    private slowFlip(): void {
        this.add(CHANNEL_X, this.values[CHANNEL_X], 360, 0, 8.0, 'standard');
        this.play();
    }

    /** 快翻：0.6 秒翻半圈，停 2 秒，再翻半圈 */
    private flip(): void {
        this.add(CHANNEL_X, this.values[CHANNEL_X], 180, 0, 0.6, 'standard');
        this.add(CHANNEL_X, 180, 360, 2.0, 0.6, 'standard');
        this.play();
    }

    /** 打盹：翻过去、仰起来、上下浮动十秒，最后弹正 */
    private sleep(): void {
        this.add(CHANNEL_X, this.values[CHANNEL_X], 184, 0, 0.6, 'easeOut');
        this.add(CHANNEL_Y, this.values[CHANNEL_Y], 50, 0, 0.6, 'easeOut');
        this.add(CHANNEL_X2, 0, 0, 0, 10.0, 'wobble');
        this.add(CHANNEL_X, 180, 0, 10.0, 0.8, 'overshoot');
        this.add(CHANNEL_Y, 60, 0, 10.0, 0.8, 'overshoot');
        this.play();
    }

    /** 洗牌 */
    private shuffle(): void {
        for (let i = this.deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const value = this.deck[i];
            this.deck[i] = this.deck[j];
            this.deck[j] = value;
        }
    }

    /** 0..bound-1 的随机整数 */
    private random(bound: number): number {
        return Math.floor(Math.random() * bound);
    }
}

/**
 * 场景时钟：官方 IconScene::Choreograph 里除姿态之外的那几个 uniform。
 *
 * - alpha 0 → 1 线性淡入，0.22 s；
 * - xOffset 以 0.03/s 递增并对 1 取模，闪光贴图靠它滚动；
 * - time 累计，金币分支用它，星星分支只记录。
 */
export class StarFrameClock {
    /** 整体不透明度 0..1 */
    alpha = 0;
    /** 闪光滚动偏移 0..1 */
    xOffset = 0;
    /** 场景时钟（秒） */
    time = 0;

    /** 推进一帧 */
    advance(step: number): void {
        this.alpha = Math.min(1, this.alpha + step / ALPHA_FADE_SECONDS);
        this.xOffset = (this.xOffset + step * X_OFFSET_PER_SECOND) % 1;
        this.time += step;
    }

    /** 直接跳到完全可见：减少动效时只画一张静止帧，不播淡入 */
    settle(): void {
        this.alpha = 1;
    }
}
