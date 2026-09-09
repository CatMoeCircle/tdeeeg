<script setup lang="ts">
import {
    computed,
    ref,
} from 'vue'

import {
    useLiquidGlass,
    type LiquidGlassShaderOptions,
} from './useLiquidGlass'

import {
    createDefaultFragment,
} from '../../utils/liquidGlassShader'

interface Props {
    /**
     * Element rendered by the component.
     */
    as?: string

    /**
     * Width of the glass.
     */
    width?: number | string

    /**
     * Height of the glass.
     */
    height?: number | string

    /**
     * Original Liquid Glass radius.
     *
     * Default: 150px.
     */
    radius?: number

    /**
     * Original backdrop blur.
     *
     * Default: 0.25px.
     */
    blur?: number

    /**
     * Original contrast.
     *
     * Default: 1.2.
     */
    contrast?: number

    /**
     * Original brightness.
     *
     * Default: 1.05.
     */
    brightness?: number

    /**
     * Original saturation.
     *
     * Default: 1.1.
     */
    saturation?: number

    /**
     * Canvas DPI.
     *
     * Original implementation uses 1.
     */
    canvasDPI?: number

    /**
     * Whether the glass can be dragged.
     */
    draggable?: boolean

    /**
     * Distance from viewport edges.
     */
    boundaryOffset?: number

    /**
     * Disable the effect.
     */
    disabled?: boolean

    /**
     * Custom class.
     */
    class?: string
}

const props =
    withDefaults(
        defineProps<Props>(),
        {
            as: 'div',

            radius: 150,

            blur: 0.25,

            contrast: 1.2,

            brightness: 1.05,

            saturation: 1.1,

            canvasDPI: 1,

            draggable: false,

            boundaryOffset: 10,

            disabled: false,
        },
    )

const element =
    ref<HTMLElement | null>(null)

const shaderOptions =
    ref<LiquidGlassShaderOptions>({
        width:
            typeof props.width ===
                'number'
                ? props.width
                : 1,

        height:
            typeof props.height ===
                'number'
                ? props.height
                : 1,

        canvasDPI:
            props.canvasDPI,

        fragment:
            createDefaultFragment(),
    })

const {
    filterId,
} =
    useLiquidGlass(
        element,
        shaderOptions,
    )

const isDragging =
    ref(false)

let dragStartX = 0
let dragStartY = 0

let initialX = 0
let initialY = 0

/**
 * Keep the glass inside the viewport.
 *
 * Same boundary behavior as the original.
 */
function constrainPosition(
    x: number,
    y: number,
) {
    const viewportWidth =
        window.innerWidth

    const viewportHeight =
        window.innerHeight

    const minX =
        props.boundaryOffset

    const minY =
        props.boundaryOffset

    const rect =
        element.value?.getBoundingClientRect()

    const glassWidth =
        rect?.width ?? 0

    const glassHeight =
        rect?.height ?? 0

    const maxX =
        viewportWidth -
        glassWidth -
        props.boundaryOffset

    const maxY =
        viewportHeight -
        glassHeight -
        props.boundaryOffset

    return {
        x: Math.max(
            minX,
            Math.min(
                maxX,
                x,
            ),
        ),

        y: Math.max(
            minY,
            Math.min(
                maxY,
                y,
            ),
        ),
    }
}

function onPointerDown(
    event: PointerEvent,
) {
    if (
        !props.draggable ||
        !element.value ||
        props.disabled
    ) {
        return
    }

    const rect =
        element.value.getBoundingClientRect()

    isDragging.value =
        true

    dragStartX =
        event.clientX

    dragStartY =
        event.clientY

    initialX =
        rect.left

    initialY =
        rect.top

    element.value.style.cursor =
        'grabbing'

    element.value.setPointerCapture(
        event.pointerId,
    )

    event.preventDefault()
}

function onPointerMove(
    event: PointerEvent,
) {
    if (
        !isDragging.value ||
        !element.value
    ) {
        return
    }

    const deltaX =
        event.clientX -
        dragStartX

    const deltaY =
        event.clientY -
        dragStartY

    const newX =
        initialX + deltaX

    const newY =
        initialY + deltaY

    const constrained =
        constrainPosition(
            newX,
            newY,
        )

    element.value.style.left =
        `${constrained.x}px`

    element.value.style.top =
        `${constrained.y}px`

    element.value.style.transform =
        'none'
}

function onPointerUp(
    event: PointerEvent,
) {
    if (
        !element.value
    ) {
        return
    }

    isDragging.value =
        false

    element.value.style.cursor =
        props.draggable
            ? 'grab'
            : ''

    if (
        element.value.hasPointerCapture(
            event.pointerId,
        )
    ) {
        element.value.releasePointerCapture(
            event.pointerId,
        )
    }
}

const style = computed(() => {
    const size = {
        ...(props.width !== undefined
            ? {
                width:
                    typeof props.width === 'number'
                        ? `${props.width}px`
                        : props.width,
            }
            : {}),

        ...(props.height !== undefined
            ? {
                height:
                    typeof props.height === 'number'
                        ? `${props.height}px`
                        : props.height,
            }
            : {}),
    }

    if (
        props.disabled
    ) {
        return {
            ...size,
        }
    }

    return {
        ...size,

        borderRadius:
            `${props.radius}px`,

        backdropFilter:
            [
                `url(#${filterId})`,
                `blur(${props.blur}px)`,
                `contrast(${props.contrast})`,
                `brightness(${props.brightness})`,
                `saturate(${props.saturation})`,
            ].join(' '),

        WebkitBackdropFilter:
            [
                `url(#${filterId})`,
                `blur(${props.blur}px)`,
                `contrast(${props.contrast})`,
                `brightness(${props.brightness})`,
                `saturate(${props.saturation})`,
            ].join(' '),

        cursor:
            props.draggable
                ? 'grab'
                : undefined,
    }
})
</script>

<template>
    <component :is="props.as" ref="element" :class="[
        'liquid-glass',
        props.class,
    ]" :style="style" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp"
        @pointercancel="onPointerUp">
        <div class="liquid-glass__content">
            <slot />
        </div>
    </component>
</template>

<style scoped>
.liquid-glass {
    position: relative;

    overflow: hidden;

    box-sizing: border-box;

    /*
   * Original:
   *
   * box-shadow:
   *   0 4px 8px rgba(0, 0, 0, 0.25),
   *   0 -10px 25px inset rgba(0, 0, 0, 0.15);
   */
    box-shadow:
        0 4px 8px rgb(0 0 0 / 10%),
        0 -10px 25px inset rgb(0 0 0 / 1%);

    /*
   * Make the element its own compositing layer.
   */
    transform: translateZ(0);

    /*
   * Important for backdrop-filter.
   */
    isolation: isolate;

    /*
   * Preserve pointer interaction.
   */
    touch-action: none;
}

.liquid-glass__content {
    display: contents;
}
</style>