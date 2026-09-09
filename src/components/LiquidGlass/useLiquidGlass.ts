import {
    onBeforeUnmount,
    onMounted,
    ref,
    watch,
    type Ref,
} from 'vue'

import {
    createDefaultFragment,
    type FragmentFunction,
} from '../../utils/liquidGlassShader'

export interface LiquidGlassShaderOptions {
    width: number
    height: number
    canvasDPI: number
    fragment?: FragmentFunction
}

export interface LiquidGlassShaderInstance {
    updateShader: () => void
    resize: (
        width: number,
        height: number,
    ) => void
    destroy: () => void
}

function generateId(): string {
    return (
        'liquid-glass-' +
        Math.random()
            .toString(36)
            .substring(2, 11)
    )
}

function clamp(
    value: number,
    min: number,
    max: number,
): number {
    return Math.max(
        min,
        Math.min(max, value),
    )
}

export function useLiquidGlass(
    element: Ref<HTMLElement | null>,
    options: Ref<LiquidGlassShaderOptions>,
) {
    const id = generateId()

    const filterId =
        `${id}_filter`

    const mapId =
        `${id}_map`

    const canvas =
        ref<HTMLCanvasElement | null>(null)

    const context =
        ref<CanvasRenderingContext2D | null>(null)

    const svg =
        ref<SVGSVGElement | null>(null)

    const filter =
        ref<SVGFilterElement | null>(null)

    const feImage =
        ref<SVGFEImageElement | null>(null)

    const feDisplacementMap =
        ref<SVGFEDisplacementMapElement | null>(null)

    const isReady =
        ref(false)

    let resizeObserver:
        ResizeObserver | null = null

    let updateTimer:
        number | null = null

    let destroyed = false

    /**
     * Create the SVG filter.
     */
    function createSVGFilter() {
        const svgElement =
            document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg',
            )

        svgElement.setAttribute(
            'xmlns',
            'http://www.w3.org/2000/svg',
        )

        svgElement.setAttribute(
            'width',
            '0',
        )

        svgElement.setAttribute(
            'height',
            '0',
        )

        svgElement.style.cssText = `
      position: absolute;
      width: 0;
      height: 0;
      pointer-events: none;
      overflow: hidden;
    `

        const defs =
            document.createElementNS(
                'http://www.w3.org/2000/svg',
                'defs',
            )

        const filterElement =
            document.createElementNS(
                'http://www.w3.org/2000/svg',
                'filter',
            )

        filterElement.setAttribute(
            'id',
            filterId,
        )

        filterElement.setAttribute(
            'filterUnits',
            'userSpaceOnUse',
        )

        filterElement.setAttribute(
            'colorInterpolationFilters',
            'sRGB',
        )

        const current =
            options.value

        filterElement.setAttribute(
            'x',
            '0',
        )

        filterElement.setAttribute(
            'y',
            '0',
        )

        filterElement.setAttribute(
            'width',
            String(current.width),
        )

        filterElement.setAttribute(
            'height',
            String(current.height),
        )

        const imageElement =
            document.createElementNS(
                'http://www.w3.org/2000/svg',
                'feImage',
            )

        imageElement.setAttribute(
            'id',
            mapId,
        )

        imageElement.setAttribute(
            'width',
            String(current.width),
        )

        imageElement.setAttribute(
            'height',
            String(current.height),
        )

        const displacementElement =
            document.createElementNS(
                'http://www.w3.org/2000/svg',
                'feDisplacementMap',
            )

        displacementElement.setAttribute(
            'in',
            'SourceGraphic',
        )

        displacementElement.setAttribute(
            'in2',
            mapId,
        )

        displacementElement.setAttribute(
            'xChannelSelector',
            'R',
        )

        displacementElement.setAttribute(
            'yChannelSelector',
            'G',
        )

        filterElement.appendChild(
            imageElement,
        )

        filterElement.appendChild(
            displacementElement,
        )

        defs.appendChild(
            filterElement,
        )

        svgElement.appendChild(
            defs,
        )

        document.body.appendChild(
            svgElement,
        )

        svg.value =
            svgElement

        filter.value =
            filterElement

        feImage.value =
            imageElement

        feDisplacementMap.value =
            displacementElement
    }

    /**
     * Create hidden Canvas.
     */
    function createCanvas() {
        const current =
            options.value

        const canvasElement =
            document.createElement(
                'canvas',
            )

        canvasElement.width =
            Math.max(
                1,
                Math.round(
                    current.width *
                    current.canvasDPI,
                ),
            )

        canvasElement.height =
            Math.max(
                1,
                Math.round(
                    current.height *
                    current.canvasDPI,
                ),
            )

        canvasElement.style.display =
            'none'

        const ctx =
            canvasElement.getContext(
                '2d',
            )

        if (!ctx) {
            throw new Error(
                'LiquidGlass: unable to create Canvas 2D context.',
            )
        }

        canvas.value =
            canvasElement

        context.value =
            ctx
    }

    /**
     * Schedule shader update.
     *
     * Multiple resize events can happen during one frame,
     * so we collapse them into a single update.
     */
    function scheduleUpdate() {
        if (destroyed) {
            return
        }

        if (updateTimer !== null) {
            cancelAnimationFrame(
                updateTimer,
            )
        }

        updateTimer =
            requestAnimationFrame(() => {
                updateTimer = null

                updateShader()
            })
    }

    /**
     * Generate displacement texture.
     *
     * This is intentionally equivalent to the original
     * Shader.updateShader() implementation.
     */
    function updateShader() {
        if (
            destroyed ||
            !canvas.value ||
            !context.value ||
            !feImage.value ||
            !feDisplacementMap.value
        ) {
            return
        }

        const current =
            options.value

        const fragment =
            current.fragment ??
            createDefaultFragment()

        const w =
            Math.max(
                1,
                Math.round(
                    current.width *
                    current.canvasDPI,
                ),
            )

        const h =
            Math.max(
                1,
                Math.round(
                    current.height *
                    current.canvasDPI,
                ),
            )

        /**
         * Match original Canvas dimensions.
         */
        if (
            canvas.value.width !== w ||
            canvas.value.height !== h
        ) {
            canvas.value.width =
                w

            canvas.value.height =
                h
        }

        const data =
            new Uint8ClampedArray(
                w * h * 4,
            )

        let maxScale = 0

        const rawValues: number[] =
            []

        /**
         * Mouse proxy.
         *
         * Kept because the original implementation
         * uses it to detect whether the fragment
         * actually accesses mouse coordinates.
         */
        const mouse = {
            x: 0,
            y: 0,
        }

        const mouseProxy =
            new Proxy(mouse, {
                get(target, property) {
                    return target[
                        property as keyof typeof target
                    ]
                },
            })

        for (
            let i = 0;
            i < data.length;
            i += 4
        ) {
            const pixel =
                i / 4

            const x =
                pixel % w

            const y =
                Math.floor(
                    pixel / w,
                )

            const pos =
                fragment(
                    {
                        x: x / w,
                        y: y / h,
                    },
                    mouseProxy,
                )

            const dx =
                pos.x * w - x

            const dy =
                pos.y * h - y

            maxScale =
                Math.max(
                    maxScale,
                    Math.abs(dx),
                    Math.abs(dy),
                )

            rawValues.push(
                dx,
                dy,
            )
        }

        /**
         * Same as original:
         *
         * maxScale *= 0.5
         */
        maxScale *= 0.5

        /**
         * Avoid division by zero.
         */
        if (maxScale === 0) {
            maxScale = 1
        }

        let index = 0

        for (
            let i = 0;
            i < data.length;
            i += 4
        ) {
            const dx =
                rawValues[index++]

            const dy =
                rawValues[index++]

            /**
             * Encode displacement into RG channels.
             *
             * 0.5 = no displacement
             */
            const r =
                dx / maxScale +
                0.5

            const g =
                dy / maxScale +
                0.5

            data[i] =
                clamp(
                    r * 255,
                    0,
                    255,
                )

            data[i + 1] =
                clamp(
                    g * 255,
                    0,
                    255,
                )

            data[i + 2] =
                0

            data[i + 3] =
                255
        }

        context.value.putImageData(
            new ImageData(
                data,
                w,
                h,
            ),
            0,
            0,
        )

        /**
         * Convert displacement map to data URL.
         *
         * Same mechanism as the original.
         */
        const dataUrl =
            canvas.value.toDataURL(
                'image/png',
            )

        feImage.value.setAttributeNS(
            'http://www.w3.org/1999/xlink',
            'href',
            dataUrl,
        )

        /**
         * Same scale calculation as original.
         */
        feDisplacementMap.value.setAttribute(
            'scale',
            String(
                maxScale /
                current.canvasDPI,
            ),
        )

        isReady.value =
            true
    }

    /**
     * Resize the shader.
     */
    function resize(
        width: number,
        height: number,
    ) {
        if (destroyed) {
            return
        }

        const nextWidth =
            Math.max(
                1,
                Math.round(width),
            )

        const nextHeight =
            Math.max(
                1,
                Math.round(height),
            )

        options.value.width =
            nextWidth

        options.value.height =
            nextHeight

        if (
            filter.value
        ) {
            filter.value.setAttribute(
                'width',
                String(nextWidth),
            )

            filter.value.setAttribute(
                'height',
                String(nextHeight),
            )
        }

        if (
            feImage.value
        ) {
            feImage.value.setAttribute(
                'width',
                String(nextWidth),
            )

            feImage.value.setAttribute(
                'height',
                String(nextHeight),
            )
        }

        scheduleUpdate()
    }

    /**
     * Destroy everything created by this composable.
     */
    function destroy() {
        if (destroyed) {
            return
        }

        destroyed = true

        if (
            updateTimer !== null
        ) {
            cancelAnimationFrame(
                updateTimer,
            )

            updateTimer = null
        }

        resizeObserver?.disconnect()

        resizeObserver = null

        svg.value?.remove()

        canvas.value?.remove()

        svg.value = null
        canvas.value = null
        context.value = null
        filter.value = null
        feImage.value = null
        feDisplacementMap.value = null

        isReady.value = false
    }

    onMounted(() => {
        createSVGFilter()

        createCanvas()

        if (
            element.value &&
            typeof ResizeObserver !==
            'undefined'
        ) {
            resizeObserver =
                new ResizeObserver(
                    (entries) => {
                        const entry =
                            entries[0]

                        if (!entry) {
                            return
                        }

                        const rect =
                            entry.contentRect

                        resize(
                            rect.width,
                            rect.height,
                        )
                    },
                )

            resizeObserver.observe(
                element.value,
            )
        }

        /**
         * Initial shader generation.
         */
        scheduleUpdate()
    })

    watch(
        options,
        () => {
            if (!destroyed) {
                scheduleUpdate()
            }
        },
        {
            deep: true,
        },
    )

    onBeforeUnmount(() => {
        destroy()
    })

    return {
        id,
        filterId,
        mapId,
        canvas,
        isReady,
        updateShader,
        resize,
        destroy,
    }
}