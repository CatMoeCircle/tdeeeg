/**
 * 钻石的手势与时钟模型。
 *
 * 逐条移植自 Unigram `Telegram.Native/Graphics/Scene3DRenderer.cpp` 感谢 Unigram 提供的原型,注释非常的完善
 *
 * - 自转一圈 10.54 s、线性；出场先正对停留 0.22 s（等于淡入时长）
 * - 拖拽 0.8°/px（yaw）、0.15°/px（pitch）：pitch 远小于 yaw，否则一碰就翻
 * - pitch 用 `limit * tanh(d/limit)` 软限位，逼近 90° 但永不到达
 * - 松手沿 tension=2 的过冲曲线回到「按下那一刻」的姿态，而不是归零
 * - kick 叠加而非覆盖，连打比单打转得快
 * - 帧间隔上限 0.1 s，卡顿不会跳四分之一圈
 */

/** 每帧推进前先夹住帧间隔，避免一次卡顿跳掉四分之一圈 */
const MAXIMUM_STEP = 0.1;

/**
 * 与 Composition spring 同形状的阻尼弹簧：欠阻尼，会过冲并回振，
 * 而不是平滑地贴到目标值。交给合成器驱动的，这里按帧半隐式积分，
 * 在该刚度下 60 Hz 稳定。
 */
export class Spring {
    private velocity = 0;
    private target: number;

    constructor(
        private readonly stiffness = 300,
        private readonly dampingRatio = 0.55,
        public value = 1,
    ) {
        this.target = value;
    }

    set targetValue(value: number) {
        this.target = value;
    }

    /** 弹簧是否还在肉眼可见地运动 */
    get settled(): boolean {
        return Math.abs(this.velocity) < 0.002 && Math.abs(this.target - this.value) < 0.002;
    }

    advance(delta: number): number {
        const step = Math.min(Math.max(delta, 0), 0.1);
        // 细分积分步长，长帧不会把数值积分炸掉
        const iterations = Math.max(1, Math.ceil(step / (1 / 240)));
        const dt = step / iterations;

        for (let i = 0; i < iterations; i++) {
            const damping = 2 * this.dampingRatio * Math.sqrt(this.stiffness);
            const acceleration = -this.stiffness * (this.value - this.target) - damping * this.velocity;
            this.velocity += acceleration * dt;
            this.value += this.velocity * dt;
        }
        return this.value;
    }
}

/** 把倾角压向一个永远到不了的限位 */
function softLimit(degrees: number, limit: number): number {
    if (limit <= 0) return degrees;
    return limit * Math.tanh(degrees / limit);
}

/** 同一个角按「相对静止位」测量；松手时走最短路径回去 */
function signed(degrees: number): number {
    let value = (degrees + 180) % 360;
    if (value < 0) value += 360;
    return value - 180;
}

/** tension=2 的过冲曲线 */
function overshoot(t: number): number {
    const tension = 2;
    const p = t - 1;
    return p * p * ((tension + 1) * p + tension) + 1;
}

export interface DiamondMotionConfig {
    secondsPerTurn: number;
    spinStartDelaySeconds: number;
    kickDecaySeconds: number;
    dragYawPerPixel: number;
    dragPitchPerPixel: number;
    pitchSoftLimitDegrees: number;
    settleSeconds: number;
    spinsByDefault: boolean;
    pressScale: number;
    pressScaleOrigin: { x: number; y: number };
    pressStiffness: number;
    pressDampingRatio: number;
}

export const DIAMOND_MOTION: DiamondMotionConfig = {
    // 实测：yaw 到 yaw+360，线性、循环，一圈 10540.18445322793 ms
    secondsPerTurn: 10.54018445322793,
    // 出场先正对停留一会儿再转开；等于淡入时长
    spinStartDelaySeconds: 0.22,
    // 一次轻推约三分之一活过半秒，两秒内耗尽
    kickDecaySeconds: 0.5,
    // 每 CSS 像素 0.8°，任何位置拖动都是同样的角度
    dragYawPerPixel: 0.8,
    // 远小于 yaw 的 0.8，后者一碰就把石头掀翻
    dragPitchPerPixel: 0.15,
    // 不硬夹：长距离拖动本来就该把顶面完全转到眼前
    pitchSoftLimitDegrees: 90,
    // 松手后两个角度都沿 tension=2 的过冲曲线回位
    settleSeconds: 0.6,
    // 关闭：自转与锚定的闪光按设计互相打架
    spinsByDefault: false,
    // 按下放大倍数与放大中心（元素自身的比例）
    pressScale: 3,
    pressScaleOrigin: { x: 0.5, y: 0.5 },
    // 37 ms 周期对应 damping 0.55
    pressStiffness: 300,
    pressDampingRatio: 0.55,
};

export class DiamondMotion {
    yaw = 0;
    rawPitch = 0;
    pitch = 0;
    time = 0;
    yawPerSecond = 0;

    spinning: boolean;
    spinSpeed = 0;
    dragging = false;
    pressScale = 1;

    private wasDragging = false;
    private pressedYaw = 0;
    private pressedPitch = 0;
    private settleYaw = 0;
    private settlePitch = 0;
    private settle = -1;
    private kick = 0;
    private dragYaw = 0;
    private dragPitch = 0;
    private pressed = false;
    private readonly pressSpring: Spring;

    constructor(private readonly motion: DiamondMotionConfig = DIAMOND_MOTION) {
        this.spinning = motion.spinsByDefault;
        this.pressSpring = new Spring(motion.pressStiffness, motion.pressDampingRatio, 1);
    }

    get pressOrigin(): { x: number; y: number } {
        return this.motion.pressScaleOrigin;
    }

    /** 石头是否处于放大状态（供渲染器提高采样密度） */
    get oversample(): number {
        return this.pressed ? Math.min(Math.max(this.motion.pressScale, 1), 4) : 1;
    }

    setPressed(pressed: boolean): void {
        if (this.motion.pressScale <= 1 || this.pressed === pressed) return;
        this.pressed = pressed;
        this.pressSpring.targetValue = pressed ? this.motion.pressScale : 1;
    }

    setSpinning(value: boolean): void {
        this.spinning = value && this.motion.secondsPerTurn > 0;
    }

    setSpinSpeed(degreesPerSecond: number): void {
        this.spinSpeed = degreesPerSecond;
    }

    /** 轻推自转；重复 kick 会累加 */
    kickBy(degreesPerSecond: number): void {
        if (this.motion.kickDecaySeconds <= 0) return;
        this.kick += degreesPerSecond;
    }

    beginDrag(): void {
        this.dragging = true;
    }

    /** `dx`/`dy` 是相对上一次调用的逻辑像素位移，按帧累加 */
    drag(dx: number, dy: number): void {
        if (this.motion.dragYawPerPixel === 0 && this.motion.dragPitchPerPixel === 0) return;
        this.dragYaw += dx * this.motion.dragYawPerPixel;
        this.dragPitch += dy * this.motion.dragPitchPerPixel;
    }

    endDrag(): void {
        this.dragging = false;
    }

    /** 推进一帧姿态；每帧调用一次 */
    advance(delta: number): void {
        const step = Math.min(Math.max(delta, 0), MAXIMUM_STEP);

        this.time += step;
        this.pressScale = this.pressSpring.advance(delta);

        let turned = 0;

        // 刚出现时先停住；`time` 只在可见时累计，所以这个停留只发生一次
        const held = this.time < this.motion.spinStartDelaySeconds;
        const settling = this.settle >= 0;

        if (this.spinning && !this.dragging && !settling && !held && this.motion.secondsPerTurn > 0) {
            const speed = this.spinSpeed;
            turned += (speed > 0 ? speed : 360 / this.motion.secondsPerTurn) * step;
        }

        turned += this.dragYaw;
        this.dragYaw = 0;

        // 与自转无关，因此从不在自己转的场景也能被推动；拖动期间由指针独占，不叠加
        if (this.kick !== 0 && !this.dragging) {
            turned += this.kick * step;
            this.kick *= Math.exp(-step / this.motion.kickDecaySeconds);
            if (Math.abs(this.kick) < 0.5) this.kick = 0;
        }

        this.yaw += turned;

        // pitch 原始值不夹，只在读取时压缩：阻力体现在石头的反应而不是指针的输入
        this.rawPitch += this.dragPitch;
        this.dragPitch = 0;
        this.pitch = softLimit(this.rawPitch, this.motion.pitchSoftLimitDegrees);

        // 收在一圈内，免得样条采样漂出表的范围
        this.yaw = this.yaw % 360;
        if (this.yaw < 0) this.yaw += 360;

        this.yawPerSecond = step > 0 ? turned / step : 0;
    }

    /**
     * 处理按下 / 松手的边沿。与 advance() 分开，保证指针在两帧之间移动时
     * 边沿也只被看到一次。
     */
    move(delta: number): void {
        const dragging = this.dragging;

        if (!this.wasDragging && dragging && this.settle < 0) {
            // 只在没有回弹在跑时记录：打断回弹的按下继承当下的姿态，而不是弹回静止再漂
            this.pressedYaw = this.yaw;
            this.pressedPitch = this.rawPitch;
        } else if (this.wasDragging && !dragging && this.motion.settleSeconds > 0) {
            // 松手回到按下那一刻的姿态，而不是回零
            this.settleYaw = signed(this.yaw - this.pressedYaw);
            this.settlePitch = this.rawPitch - this.pressedPitch;
            this.settle = 0;
        }

        if (dragging) this.settle = -1;

        this.wasDragging = dragging;

        this.advance(delta);

        if (this.settle >= 0) {
            const before = this.yaw;

            this.settle += delta / this.motion.settleSeconds;
            const remaining = this.settle >= 1 ? 0 : 1 - overshoot(this.settle);

            // 两个角按同一个余量回位，石头沿被拖出去的那条弧回来，而不是先解一个轴
            this.yaw = this.pressedYaw + this.settleYaw * remaining;

            this.rawPitch = this.pressedPitch + this.settlePitch * remaining;
            this.pitch = softLimit(this.rawPitch, this.motion.pitchSoftLimitDegrees);

            this.yawPerSecond = this.time > 0 ? signed(this.yaw - before) / Math.max(delta, 1e-6) : 0;

            if (this.settle >= 1) this.settle = -1;
        }
    }
}
