import { defineComponent, h, ref, watch, type PropType } from 'vue';
import { settings } from '../../store/settings';
import { ring2, squircle, square, reuleaux, infinity, trefoil } from 'ldrs';

/**
 * 可选加载指示器样式（与 settings.loadingStyle 一致）
 */
export type LoaderStyle = "ring2" | "squircle" | "square" | "reuleaux" | "infinity" | "trefoil";

/** 每个 ldrs loader 对应的自定义元素标签名 */
const TAG_MAP: Record<LoaderStyle, string> = {
    ring2: 'l-ring-2',
    squircle: 'l-squircle',
    square: 'l-square',
    reuleaux: 'l-reuleaux',
    infinity: 'l-infinity',
    trefoil: 'l-trefoil',
};

/** 每个 ldrs loader 的 registrable（按需注册，避免无效自定义元素） */
const REGISTRABLE_MAP: Record<LoaderStyle, { register: (name?: string) => void }> = {
    ring2,
    squircle,
    square,
    reuleaux,
    infinity,
    trefoil,
};

/** 每个 loader 的默认外观参数（尺寸/stroke/bg-opacity/速度，来自用户偏好） */
const STYLE_MAP: Record<LoaderStyle, { size: string; stroke: string; bgOpacity: string; speed: string; indeterminate: string }> = {
    ring2: { size: '40', stroke: '5', bgOpacity: '0.1', speed: '0.8', indeterminate: '0.25' },
    squircle: { size: '37', stroke: '5', bgOpacity: '0.1', speed: '0.9', indeterminate: '0.15' },
    square: { size: '35', stroke: '5', bgOpacity: '0.1', speed: '1.2', indeterminate: '0.25' },
    reuleaux: { size: '37', stroke: '5', bgOpacity: '0.1', speed: '1.2', indeterminate: '0.15' },
    infinity: { size: '55', stroke: '4', bgOpacity: '0.1', speed: '1.3', indeterminate: '0.15' },
    trefoil: { size: '40', stroke: '4', bgOpacity: '0.1', speed: '1.4', indeterminate: '0.15' },
};

/** 已注册的样式集合，避免对同一元素重复 register */
const registered = new Set<LoaderStyle>();

/** 供外部预注册（如 App 挂载时提前注册常用样式，避免首次渲染闪烁） */
export function registerLoaderStyle(style: LoaderStyle): void {
    if (!registered.has(style)) {
        REGISTRABLE_MAP[style].register();
        registered.add(style);
    }
}

export const LoaderIndicator = defineComponent({
    name: 'LoaderIndicator',
    props: {
        /**
         * 下载/加载进度 0~1。
         * - 提供进度 → 确定性指示（stroke-length=进度，弧长代表下载量）
         * - 省略 → 不确定动画转圈（仅"加载中"）
         */
        progress: { type: Number as PropType<number | undefined>, default: undefined },
        /** 颜色，默认白色 */
        color: { type: String, default: '#ffffff' },
        /** 覆盖默认尺寸（px），如 "24" */
        size: { type: String, default: undefined },
        /** 覆盖默认描边宽度（如缩小尺寸时需要更细的 stroke，避免过粗） */
        stroke: { type: String, default: undefined },
        /** 指定使用某一种加载样式（默认取 settings.loadingStyle） */
        force: { type: String as PropType<LoaderStyle | undefined>, default: undefined },
    },
    setup(props) {
        const active = ref<LoaderStyle>(props.force || settings.loadingStyle);

        // 按需注册当前样式对应的自定义元素
        function useStyle(style: LoaderStyle) {
            registerLoaderStyle(style);
        }

        // 外部 force 变化时同步
        watch(() => props.force, (v) => {
            if (v && v !== active.value) {
                active.value = v;
                useStyle(v);
            }
        });

        // settings 中切换加载样式时，若未强制指定则跟随
        watch(() => settings.loadingStyle, (v) => {
            if (!props.force && v !== active.value) {
                active.value = v;
                useStyle(v);
            }
        });

        // 初始化当前样式
        useStyle(active.value);

        return () => {
            // 强制指定优先，否则跟随用户设置
            const style = props.force || settings.loadingStyle;
            const cfg = STYLE_MAP[style] || STYLE_MAP.ring2;
            const tag = TAG_MAP[style] || 'l-ring-2';
            // 确保当前使用的样式已注册（force 场景 setup 里可能未注册）
            if (!registered.has(style)) {
                registerLoaderStyle(style);
            }
            // 确定性进度：把 stroke-length 设为进度（0~1），弧长 = 下载百分比；
            // 不确定状态：使用 loader 默认 stroke-length（呈现经典旋转弧圈）
            const hasProgress = typeof props.progress === 'number' && !Number.isNaN(props.progress);
            const strokeLength = hasProgress
                ? String(Math.min(1, Math.max(0.01, props.progress as number)))
                : cfg.indeterminate;

            return h(tag, {
                size: props.size || cfg.size,
                // 指定 stroke 时优先，否则用该样式默认值
                stroke: props.stroke || cfg.stroke,
                'bg-opacity': cfg.bgOpacity,
                speed: cfg.speed,
                color: props.color,
                'stroke-length': strokeLength,
            });
        };
    },
});

export default LoaderIndicator;
