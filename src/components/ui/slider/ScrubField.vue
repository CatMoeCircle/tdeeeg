<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useId, watch, type CSSProperties } from 'vue';

type ScrubFieldSize = 'sm' | 'md' | 'lg';

interface Props {
    label?: string;
    suffix?: string;
    value?: number;
    defaultValue?: number;
    min?: number;
    max?: number;
    step?: number;
    size?: ScrubFieldSize;
    /** 每移动多少像素走一步；越小越灵敏 */
    sensitivity?: number;
    /** 越界可拖出的余量，按量程百分比计 */
    rubberReach?: number;
    /** 松手后回弹到边界所用的毫秒数 */
    returnDuration?: number;
    coarseMultiplier?: number;
    fineMultiplier?: number;
    showDelta?: boolean;
    showDirty?: boolean;
    showFill?: boolean;
    /** 强调色：填充、外框与差值气泡都用它。可传任意 CSS 颜色，默认跟随主题色 */
    accent?: string;
    chipColor?: string;
    disabled?: boolean;
    className?: string;
}

interface DragState {
    id: number;
    x: number;
    raw: number;
    mult: number;
    moved: boolean;
    before: number;
    slack: number;
    left: number;
}

type Modifiers = { shiftKey: boolean; altKey: boolean };

/** 松手回弹默认走临界阻尼弹簧：在 duration 内归位且不过冲 */
const SPRING_UI = { duration: 0.3, bounce: 0 };
/** 拖出界外时整体侧倾的最大像素 */
const LEAN = 4;
/**
 * 整定时间系数：临界阻尼下位移包络为 (1+ωt)e^{-ωt}，
 * 解 (1+ωt)e^{-ωt}=0.02 得 ωt≈5.83，反解出 ω 才能让 duration 名副其实。
 * 只按 e^{-ωt}=0.02（ωt=4）推会明显偏慢，回弹结束时残留可见的小数尾巴。
 */
const SETTLE_FACTOR = 5.83;
/** 落位阈值：低于此位移直接归位，避免长时间停在 100.1 这类可见残值上 */
const SETTLE_EPSILON = 0.05;
const SIZES: Record<ScrubFieldSize, { height: number; font: number; radius: number; width: number }> = {
    sm: { height: 28, font: 12, radius: 6, width: 104 },
    md: { height: 34, font: 13, radius: 8, width: 128 },
    lg: { height: 44, font: 16, radius: 10, width: 160 }
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const decimalsOf = (n: number) => {
    const s = String(n);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
};

/** 解析 #rgb / #rrggbb / rgb() / rgba() 为通道值，解析不了返回 null */
function parseRgb(color: string): [number, number, number] | null {
    const s = color.trim();

    const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hex) {
        const raw = hex[1];
        const full = raw.length === 3 ? [...raw].map(ch => ch + ch).join('') : raw;
        const n = parseInt(full, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    const fn = s.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];

    return null;
}

/** 取背景色的对比文字色（YIQ 亮度），用于差值气泡内的字 */
function contrastInk(color: string): string {
    const rgb = parseRgb(color);
    if (!rgb) return '#ffffff';
    const yiq = (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
    return yiq >= 128 ? '#111111' : '#ffffff';
}

/**
 * 把任意 CSS 颜色解析成具体 rgb。
 * accent 默认取主题色变量（var(--app-brand)），拿着变量名算不出亮度，
 * 需要借一个探针元素让浏览器自行求值，这样深浅色主题与用户改主题色都能跟上。
 */
let colorProbe: HTMLSpanElement | null = null;
function resolveCssColor(value: string): string {
    if (typeof document === 'undefined' || !value) return '';
    if (!colorProbe) {
        colorProbe = document.createElement('span');
        colorProbe.style.cssText = 'position:absolute;width:0;height:0;visibility:hidden;pointer-events:none';
        document.body.appendChild(colorProbe);
    }
    colorProbe.style.color = '';
    colorProbe.style.color = value;
    return getComputedStyle(colorProbe).color;
}

/**
 * 最小 motion 原语，等价于 motion-v 的 motionValue。
 * 拖动时直接改 DOM 而不走响应式，避免每帧触发整个弹层的重渲染。
 */
function createMotionValue(initial: number) {
    let current = initial;
    let frame: number | null = null;
    const listeners = new Set<(value: number) => void>();

    const notify = () => {
        for (const cb of listeners) cb(current);
    };

    return {
        get: () => current,
        set(next: number) {
            current = next;
            notify();
        },
        /** 与 set 同样通知，但用于「跳过动画直接到位」的语义 */
        jump(next: number) {
            current = next;
            notify();
        },
        on(_event: 'change', cb: (value: number) => void) {
            listeners.add(cb);
            return () => {
                listeners.delete(cb);
            };
        },
        stop() {
            if (frame !== null) {
                cancelAnimationFrame(frame);
                frame = null;
            }
        },
        /** 交给动画驱动：每帧回调返回 false 即结束，stop() 可中断 */
        drive(step: (now: number) => boolean) {
            const tick = (now: number) => {
                frame = step(now) ? requestAnimationFrame(tick) : null;
            };
            frame = requestAnimationFrame(tick);
        },
    };
}

type MotionValue = ReturnType<typeof createMotionValue>;

/**
 * 由 duration + bounce 反推弹簧参数：bounce 0 为临界阻尼（不过冲，指数归位）。
 * ζ 定阻尼比，ω 由整定时间反解，二者共同决定 stiffness 与 damping。
 */
function animateSpring(
    mv: MotionValue,
    to: number,
    duration: number,
    bounce: number,
    onDone?: () => void,
) {
    const mass = 1;
    const zeta = clamp(1 - bounce, 0.05, 1);
    const omega = SETTLE_FACTOR / (zeta * Math.max(duration, 0.01));
    const stiffness = omega * omega * mass;
    const damping = 2 * zeta * Math.sqrt(stiffness * mass);

    let offset = mv.get() - to;
    let velocity = 0;
    let prev = performance.now();

    mv.drive(now => {
        // 掉帧时限制步长，避免数值积分发散
        const dt = Math.min((now - prev) / 1000, 1 / 30);
        prev = now;

        const accel = (-stiffness * offset - damping * velocity) / mass;
        velocity += accel * dt;
        offset += velocity * dt;

        if (Math.abs(offset) < SETTLE_EPSILON && Math.abs(velocity) < SETTLE_EPSILON) {
            mv.set(to);
            onDone?.();
            return false;
        }
        mv.set(to + offset);
        return true;
    });
}

const props = withDefaults(defineProps<Props>(), {
    label: '',
    suffix: '',
    value: undefined,
    defaultValue: 24,
    min: 0,
    max: 100,
    step: 1,
    size: 'md',
    sensitivity: 2,
    rubberReach: 8,
    returnDuration: 300,
    coarseMultiplier: 10,
    fineMultiplier: 0.1,
    showDelta: true,
    showDirty: false,
    showFill: true,
    accent: 'var(--app-brand)',
    chipColor: '#27272a',
    disabled: false,
    className: '',
});

const emit = defineEmits<{
    change: [value: number];
    commit: [value: number];
    /** 指针拖拽状态，供调用方在拖拽期间保持容器可见 */
    'update:dragging': [value: boolean];
    /**
     * 松手后回弹动画进行中。
     * 单靠 dragging 不够：指针已拖到容器外时，dragging 一落容器就会因失去 hover 而隐藏，
     * 回弹动画等于在看不见的地方播完，调用方需要据此把可见性延续到动画结束。
     */
    'update:settling': [value: boolean];
}>();

const id = useId();

/** 跟随系统「减少动态效果」：置位时取消越界侧倾与回弹动画，直接跳回 */
const reduce = ref(false);
let motionQuery: MediaQueryList | null = null;
const onMotionPreferenceChange = (e: MediaQueryListEvent) => {
    reduce.value = e.matches;
};

const controlled = computed(() => props.value !== undefined);
const value = ref<number>(props.value !== undefined ? props.value : props.defaultValue);
const dragging = ref(false);
/** 回弹动画进行中（见 update:settling 的说明） */
const settling = ref(false);
const draft = ref<string | null>(null);
const display = createMotionValue(value.value);
const chipRef = ref<HTMLDivElement | null>(null);
const fillRef = ref<HTMLSpanElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const ghostRef = ref<HTMLSpanElement | null>(null);

/** 差值气泡里的字色：由 accent 实解析出的对比色 */
const accentInk = ref('#ffffff');
/** 主题切换时 store/theme.ts 会改写 :root 的 style 与 dark class，靠监听这两者跟上主题色变化 */
let themeObserver: MutationObserver | null = null;

const syncAccentInk = () => {
    accentInk.value = contrastInk(resolveCssColor(props.accent) || props.accent);
};

let drag: DragState | null = null;
let valueNow = value.value;
let typing = false;
let moved = false;
let escListener: ((e: KeyboardEvent) => void) | null = null;
let offDisplay: (() => void) | undefined;

const baseDecimals = computed(() => decimalsOf(props.step));
const fineDecimals = computed(() => Math.min(6, baseDecimals.value + decimalsOf(props.fineMultiplier)));
const preset = computed(() => SIZES[props.size] || SIZES.md);

const fmt = (v: number) => {
    const scaled = v * 10 ** baseDecimals.value;
    return v.toFixed(Math.abs(scaled - Math.round(scaled)) < 1e-6 ? baseDecimals.value : fineDecimals.value);
};

const signed = (d: number) => (d < 0 ? '−' : '+') + fmt(Math.abs(d));

const reach = () => (props.rubberReach / 100) * Math.max(props.max - props.min, Number.EPSILON);

/** 越界位移的非线性拉伸：越拉越沉 */
const bend = (raw: number) => {
    const r = reach();
    return r ? Math.sign(raw) * r * Math.log1p(Math.abs(raw) / r) : 0;
};

const unbend = (over: number) => {
    const r = reach();
    return r ? Math.sign(over) * r * Math.expm1(Math.abs(over) / r) : 0;
};

const toShown = (raw: number) => {
    const c = clamp(raw, props.min, props.max);
    return c + bend(raw - c);
};

const toRaw = (shown: number) => {
    const c = clamp(shown, props.min, props.max);
    return c + unbend(shown - c);
};

const multiplierOf = (e: Modifiers) => (e.shiftKey ? props.coarseMultiplier : e.altKey ? props.fineMultiplier : 1);

const commit = (next: number) => {
    const rounded = clamp(Number(next.toFixed(fineDecimals.value)), props.min, props.max);
    if (rounded === valueNow) return;
    valueNow = rounded;
    value.value = rounded;
    emit('change', rounded);
};

// 数字、侧倾与填充由 motion value 手动绘制，保证拖动不等渲染
const paint = (d: number) => {
    if (!typing && inputRef.value) inputRef.value.value = fmt(d);

    const chip = chipRef.value;
    if (chip) {
        chip.dataset.over = d < props.min || d > props.max ? 'true' : 'false';
        const r = reach();
        const lean = reduce.value || !r ? 0 : clamp((d - clamp(d, props.min, props.max)) / r, -1, 1) * LEAN;
        chip.style.transform = lean ? `translateX(${lean}px)` : '';
    }

    if (fillRef.value) {
        const k = (clamp(d, props.min, props.max) - props.min) / Math.max(props.max - props.min, Number.EPSILON);
        fillRef.value.style.transform = `scaleX(${k})`;
    }
};

/** 无拖拽时接受外部值（受控 / 非受控两条路径） */
const adopt = (next: number) => {
    valueNow = next;
    value.value = next;
    display.jump(next);
    if (!typing && inputRef.value) inputRef.value.value = fmt(next);
};

/** 回弹中标记：结束（或被打断）时必须清掉，否则调用方的容器会一直锁在可见状态 */
const setSettling = (next: boolean) => {
    if (settling.value === next) return;
    settling.value = next;
    emit('update:settling', next);
};

const handlePointerDown = (e: PointerEvent) => {
    if (props.disabled || drag || e.button !== 0 || typing) return;
    // 触摸下不 preventDefault，保留纵向滚动
    if (e.pointerType !== 'touch') e.preventDefault();
    display.stop();
    setSettling(false);
    moved = false;
    drag = {
        id: e.pointerId,
        x: e.clientX,
        raw: toRaw(display.get()),
        mult: multiplierOf(e),
        moved: false,
        before: valueNow,
        // 触摸需要更大的死区，避免滚动误触
        slack: e.pointerType === 'touch' ? 8 : 3,
        left: chipRef.value ? chipRef.value.getBoundingClientRect().left : 0,
    };
    try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
        // 指针捕获不可用时退化为普通拖动
    }
    escListener = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape') end(true);
    };
    window.addEventListener('keydown', escListener);
};

const handlePointerMove = (e: PointerEvent) => {
    const g = drag;
    if (!g || e.pointerId !== g.id) return;

    if (!g.moved) {
        if (Math.abs(e.clientX - g.x) < g.slack) return;
        g.moved = true;
        moved = true;
        g.x = e.clientX;
        dragging.value = true;
        emit('update:dragging', true);
        document.documentElement.style.cursor = 'ew-resize';
    }

    // 拖动中切换修饰键：以当前显示值为新基准，避免跳变
    const m = multiplierOf(e);
    if (m !== g.mult) {
        g.mult = m;
        g.raw = toRaw(display.get());
        g.x = e.clientX;
    }

    const raw = g.raw + Math.round((e.clientX - g.x) / props.sensitivity) * props.step * m;
    const shown = toShown(raw);
    display.set(shown);
    commit(clamp(raw, props.min, props.max));

    if (ghostRef.value) {
        ghostRef.value.style.translate = `calc(${e.clientX - g.left}px - 50%) -100%`;
        ghostRef.value.textContent = signed(shown - g.before);
    }
};

function end(cancel = false) {
    const g = drag;
    if (!g) return;
    drag = null;

    if (dragging.value) {
        dragging.value = false;
        emit('update:dragging', false);
    }
    document.documentElement.style.cursor = '';

    if (escListener) {
        window.removeEventListener('keydown', escListener);
        escListener = null;
    }

    if (cancel) {
        commit(g.before);
        display.jump(g.before);
        return;
    }
    if (!g.moved) {
        // 未产生位移视为点击：聚焦输入框进入键入模式
        inputRef.value?.focus();
        return;
    }

    const bound = clamp(display.get(), props.min, props.max);
    if (display.get() !== bound) {
        if (reduce.value) {
            display.jump(bound);
        } else {
            setSettling(true);
            animateSpring(display, bound, props.returnDuration / 1000, SPRING_UI.bounce, () => setSettling(false));
        }
    }
    if (valueNow !== g.before) emit('commit', valueNow);
}

const leaveTyping = () => {
    typing = false;
    draft.value = null;
    if (inputRef.value) inputRef.value.value = fmt(valueNow);
};

const handleKeyDown = (e: KeyboardEvent) => {
    const typedNumber = draft.value !== null && draft.value.trim() !== '' ? Number(draft.value) : NaN;
    const from = Number.isNaN(typedNumber) ? valueNow : typedNumber;
    const deltas: Record<string, number> = {
        ArrowUp: props.step * multiplierOf(e),
        ArrowDown: -props.step * multiplierOf(e),
        PageUp: props.step * props.coarseMultiplier,
        PageDown: -props.step * props.coarseMultiplier,
    };
    const delta = deltas[e.key];

    if (delta !== undefined || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        leaveTyping();
        commit(delta !== undefined ? from + delta : e.key === 'Home' ? props.min : props.max);
        display.jump(valueNow);
        if (inputRef.value) inputRef.value.value = fmt(valueNow);
        emit('commit', valueNow);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        (e.currentTarget as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        leaveTyping();
        (e.currentTarget as HTMLInputElement).blur();
    }
};

const handleFocus = (e: FocusEvent) => {
    typing = true;
    const input = e.target as HTMLInputElement;
    draft.value = input.value;
    input.select();
};

const handleBlur = () => {
    const n = draft.value === null ? NaN : parseFloat(draft.value.replace(/[^\d.-]/g, ''));
    if (!Number.isNaN(n)) {
        commit(n);
        emit('commit', valueNow);
    }
    leaveTyping();
    display.jump(valueNow);
};

/** 拖动后紧跟的 click 会被当作标签点击，这里吞掉避免触发 label 默认行为 */
const onLabelClick = (e: MouseEvent) => {
    if (moved) e.preventDefault();
};

onMounted(() => {
    if (window.matchMedia) {
        motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        reduce.value = motionQuery.matches;
        motionQuery.addEventListener('change', onMotionPreferenceChange);
    }
    syncAccentInk();
    themeObserver = new MutationObserver(syncAccentInk);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });

    offDisplay = display.on('change', paint);
    paint(display.get());
    if (inputRef.value) inputRef.value.value = fmt(value.value);
});

watch(() => props.accent, syncAccentInk);

// 量程或填充开关变化后需要重画，但值没变所以不会触发 change
watch(
    () => [props.min, props.max, props.rubberReach, props.showFill],
    () => paint(display.get()),
    { flush: 'post' }
);

watch(
    () => props.value,
    v => {
        if (controlled.value && !drag && v !== valueNow) adopt(clamp(v as number, props.min, props.max));
    }
);

watch(
    () => props.defaultValue,
    v => {
        if (!controlled.value && !drag) adopt(clamp(v, props.min, props.max));
    }
);

watch([baseDecimals, fineDecimals], () => {
    if (!typing && inputRef.value) inputRef.value.value = fmt(valueNow);
});

onUnmounted(() => {
    offDisplay?.();
    display.stop();
    // 卸载时若正处于回弹中，动画回调不会再触发，必须主动复位否则调用方容器会一直锁在可见状态
    setSettling(false);
    themeObserver?.disconnect();
    themeObserver = null;
    colorProbe?.remove();
    colorProbe = null;
    document.documentElement.style.cursor = '';
    if (escListener) window.removeEventListener('keydown', escListener);
    motionQuery?.removeEventListener('change', onMotionPreferenceChange);
});

const dirty = computed(() => props.showDirty && value.value !== props.defaultValue);

const rootStyle = computed(
    () =>
        ({
            '--sf-accent': props.accent,
            '--sf-chip': props.chipColor,
            '--sf-ghost-ink': accentInk.value,
            '--sf-h': `${preset.value.height}px`,
            '--sf-fs': `${preset.value.font}px`,
            '--sf-r': `${preset.value.radius}px`,
            '--sf-w': `${preset.value.width}px`,
            '--sf-ease-out': 'cubic-bezier(0.23, 1, 0.32, 1)',
        }) as CSSProperties
);
</script>

<template>
    <div ref="chipRef"
        class="group inline-flex isolate relative items-center gap-1 data-[disabled=true]:opacity-50 pr-2 pl-1 rounded-[var(--sf-r)] w-[var(--sf-w)] h-[var(--sf-h)] leading-none [-webkit-touch-callout:none] touch-pan-y cursor-ew-resize data-[disabled=true]:cursor-default data-[typing=true]:cursor-text select-none data-[dirty=true]:[transition-duration:0ms] [font-family:inherit] [font-size:var(--sf-fs)] [background:var(--sf-chip)] [box-shadow:0_0_0_1px_transparent] [-webkit-tap-highlight-color:transparent] [transition:background-color_200ms_ease,box-shadow_200ms_ease] data-[dirty=true]:[box-shadow:0_0_0_1px_color-mix(in_srgb,var(--sf-accent)_55%,transparent)] data-[typing=true]:[background:color-mix(in_srgb,currentColor_7%,var(--sf-chip))]"
        :class="className" :data-dirty="dirty ? 'true' : 'false'" :data-dragging="dragging ? 'true' : 'false'"
        :data-typing="draft !== null ? 'true' : 'false'" :data-disabled="disabled ? 'true' : 'false'"
        :aria-disabled="disabled || undefined" :style="rootStyle" @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove" @pointerup="end()" @pointercancel="end(true)" @lostpointercapture="end()">
        <span v-if="showFill" class="-z-10 absolute inset-0 rounded-[inherit] overflow-hidden pointer-events-none"
            aria-hidden="true">
            <span ref="fillRef"
                class="absolute inset-0 origin-left [background:color-mix(in_srgb,var(--sf-accent)_16%,transparent)]" />
        </span>
        <label v-if="label" :for="id"
            class="inline-flex items-center px-1.5 rounded-[calc(var(--sf-r)-2px)] h-full font-medium whitespace-nowrap [transition:color_120ms_ease,transform_160ms_var(--sf-ease-out)] cursor-[inherit] motion-reduce:[transition:color_120ms_ease] [color:color-mix(in_srgb,currentColor_55%,transparent)] [@media(hover:hover)_and_(pointer:fine)]:group-data-[disabled=false]:group-hover:[color:color-mix(in_srgb,currentColor_85%,transparent)] group-data-[disabled=false]:group-data-[typing=false]:group-active:[transform:scale(0.96)] group-data-[disabled=false]:group-data-[typing=false]:group-active:[color:currentColor] group-data-[dragging=true]:[transform:scale(0.96)] group-data-[dragging=true]:[color:currentColor] motion-reduce:group-data-[dragging=true]:[transform:none] motion-reduce:group-data-[disabled=false]:group-data-[typing=false]:group-active:[transform:none]"
            @click="onLabelClick">
            {{ label }}
        </label>
        <input :id="id" ref="inputRef"
            class="flex-1 bg-transparent m-0 p-0 border-0 outline-0 w-full min-w-0 font-medium tabular-nums text-right cursor-[inherit] group-data-[typing=true]:cursor-text [color:inherit] [font-family:inherit] [font-size:inherit] [transition:color_120ms_ease] group-data-[over=true]:[color:color-mix(in_srgb,currentColor_55%,transparent)]"
            type="text" inputmode="decimal" role="spinbutton" :aria-valuenow="value" :aria-valuemin="min"
            :aria-valuemax="max" :aria-valuetext="`${fmt(value)}${suffix ? ` ${suffix}` : ''}`" :disabled="disabled"
            @focus="handleFocus" @input="draft = ($event.target as HTMLInputElement).value" @keydown="handleKeyDown"
            @blur="handleBlur" />
        <span v-if="suffix" class="font-medium [color:color-mix(in_srgb,currentColor_45%,transparent)]" aria-hidden="true">
            {{ suffix }}
        </span>
        <span v-if="showDelta" ref="ghostRef"
            class="-top-1.5 left-0 absolute opacity-0 group-data-[dragging=true]:opacity-100 px-1.5 py-0.5 rounded-full font-semibold tabular-nums text-[11px] leading-[1.4] whitespace-nowrap origin-bottom [transition:opacity_125ms_var(--sf-ease-out),scale_125ms_var(--sf-ease-out)] pointer-events-none motion-reduce:[scale:1] [color:var(--sf-ghost-ink)] [translate:0_-100%] [scale:0.95] [background:var(--sf-accent)] group-data-[dragging=true]:[scale:1] motion-reduce:[transition:opacity_200ms_ease]"
            aria-hidden="true" />
    </div>
</template>
