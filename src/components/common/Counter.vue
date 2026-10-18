<template>
    <span :style="{ position: 'relative', display: 'inline-block', ...props.containerStyle }">
        <span :style="computedCounterStyle">
            <template v-for="place in places" :key="place">
                <span
                    v-if="place === '.'"
                    :style="{
                        height: `${height}px`,
                        width: 'fit-content',
                        position: 'relative',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...props.digitStyle
                    }"
                >
                    .
                </span>
                <DigitColumn v-else :place="place as number" :value="value" :height="height" :digit-style="props.digitStyle" />
            </template>
        </span>
        <span :style="gradientContainerStyle">
            <span :style="props.topGradientStyle ?? computedTopGradientStyle" />
            <span :style="props.bottomGradientStyle ?? computedBottomGradientStyle" />
        </span>
    </span>
</template>

<script setup lang="ts">
import { motion, useSpring, useTransform } from 'motion-v';
import type { CSSProperties } from 'vue';
import { computed, defineComponent, h, watchEffect } from 'vue';

type PlaceValue = number | '.';

interface CounterProps {
    value: number;
    /** 是否显示小数点：在自动推导的整数位后追加一位小数（如 12.0） */
    decimal?: boolean;
    fontSize?: number;
    padding?: number;
    places?: PlaceValue[];
    gap?: number;
    borderRadius?: number;
    horizontalPadding?: number;
    textColor?: string;
    fontWeight?: CSSProperties['fontWeight'];
    containerStyle?: CSSProperties;
    counterStyle?: CSSProperties;
    digitStyle?: CSSProperties;
    gradientHeight?: number;
    gradientFrom?: string;
    gradientTo?: string;
    topGradientStyle?: CSSProperties;
    bottomGradientStyle?: CSSProperties;
}

const props = withDefaults(defineProps<CounterProps>(), {
    decimal: false,
    fontSize: 100,
    padding: 0,
    places: undefined,
    gap: 8,
    borderRadius: 4,
    horizontalPadding: 8,
    textColor: 'inherit',
    fontWeight: 'inherit',
    gradientHeight: 16,
    gradientFrom: 'black',
    gradientTo: 'transparent'
});

function normalizeNearInteger(num: number): number {
    const nearest = Math.round(num);
    const tolerance = 1e-9 * Math.max(1, Math.abs(num));
    return Math.abs(num - nearest) < tolerance ? nearest : num;
}

function getValueRoundedToPlace(value: number, place: number): number {
    return Math.floor(normalizeNearInteger(value / place));
}

function derivePlaces(value: number): PlaceValue[] {
    return [...value.toString()].map((ch, i, a) => {
        if (ch === '.') return '.';
        const dotIndex = a.indexOf('.');
        const isInteger = dotIndex === -1;
        const exponent = isInteger ? a.length - i - 1 : i < dotIndex ? dotIndex - i - 1 : -(i - dotIndex);
        return 10 ** exponent;
    });
}

const height = computed(() => props.fontSize + props.padding);

const places = computed<PlaceValue[]>(() => {
    if (props.places) return props.places;
    const derived = derivePlaces(props.value);
    return props.decimal ? [...derived, '.', 0.1] : derived;
});

const computedCounterStyle = computed<CSSProperties>(() => ({
    fontSize: `${props.fontSize}px`,
    display: 'flex',
    // Vue 内联 style 不会给数字补单位，所有 px 值必须自己拼，否则浏览器直接丢弃
    gap: `${props.gap}px`,
    overflow: 'hidden',
    borderRadius: `${props.borderRadius}px`,
    paddingLeft: `${props.horizontalPadding}px`,
    paddingRight: `${props.horizontalPadding}px`,
    lineHeight: 1,
    color: props.textColor,
    fontWeight: props.fontWeight,
    direction: 'ltr',
    ...props.counterStyle
}));

const gradientContainerStyle: CSSProperties = {
    pointerEvents: 'none',
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'space-between'
};

const computedTopGradientStyle = computed<CSSProperties>(() => ({
    height: `${props.gradientHeight}px`,
    background: `linear-gradient(to bottom, ${props.gradientFrom}, ${props.gradientTo})`
}));

const computedBottomGradientStyle = computed<CSSProperties>(() => ({
    height: `${props.gradientHeight}px`,
    background: `linear-gradient(to top, ${props.gradientFrom}, ${props.gradientTo})`
}));

const DigitColumn = defineComponent({
    name: 'DigitColumn',
    props: {
        place: { type: Number, required: true },
        value: { type: Number, required: true },
        height: { type: Number, required: true },
        digitStyle: { type: Object as () => CSSProperties | undefined, default: undefined }
    },
    setup(columnProps) {
        const valueRoundedToPlace = computed(() => getValueRoundedToPlace(columnProps.value, columnProps.place));

        const animatedValue = useSpring(valueRoundedToPlace.value, { stiffness: 300, damping: 30 });

        watchEffect(() => {
            animatedValue.set(valueRoundedToPlace.value);
        });

        const digitNodes = Array.from({ length: 10 }, (_, i) => {
            const y = useTransform(animatedValue, (latest: number) => {
                const placeValue = latest % 10;
                const offset = (10 + i - placeValue) % 10;
                let memo = offset * columnProps.height;
                if (offset > 5) memo -= 10 * columnProps.height;
                return memo;
            });
            return { i, y };
        });

        const baseStyle: CSSProperties = {
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        };

        return () => {
            const wrapperStyle: CSSProperties = {
                // 必须带 px：数字形式的 height 会被浏览器丢弃，列高变 0 后 overflow 把数字裁没
                height: `${columnProps.height}px`,
                position: 'relative',
                width: '1ch',
                fontVariantNumeric: 'tabular-nums',
                display: 'inline-flex',
                overflow: 'hidden',
                ...columnProps.digitStyle
            };

            return h(
                'span',
                { style: wrapperStyle },
                digitNodes.map(({ i, y }) => h(motion.span, { key: i, style: { ...baseStyle, y } }, () => String(i)))
            );
        };
    }
});
</script>
