/**
 * Liquid Glass shader core.
 *
 * Based on the original Liquid Glass implementation
 * by Shu Ding.
 */

export interface TextureResult {
    type: 't'
    x: number
    y: number
}

export interface ShaderMouse {
    x: number
    y: number
}

export type FragmentFunction = (
    uv: {
        x: number
        y: number
    },
    mouse: ShaderMouse,
) => TextureResult

/**
 * Clamp + smooth interpolation.
 *
 * Same algorithm as the original implementation.
 */
export function smoothStep(
    a: number,
    b: number,
    t: number,
): number {
    t = Math.max(
        0,
        Math.min(
            1,
            (t - a) / (b - a),
        ),
    )

    return t * t * (3 - 2 * t)
}

/**
 * Vector length.
 */
export function length(
    x: number,
    y: number,
): number {
    return Math.sqrt(
        x * x + y * y,
    )
}

/**
 * Rounded rectangle signed distance field.
 *
 * This is intentionally kept equivalent to
 * the original Liquid Glass implementation.
 */
export function roundedRectSDF(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
): number {
    const qx =
        Math.abs(x) -
        width +
        radius

    const qy =
        Math.abs(y) -
        height +
        radius

    return (
        Math.min(
            Math.max(qx, qy),
            0,
        ) +
        length(
            Math.max(qx, 0),
            Math.max(qy, 0),
        ) -
        radius
    )
}

/**
 * Texture lookup description.
 *
 * The original implementation does not actually
 * sample an image here. It describes where the
 * browser should sample the backdrop.
 */
export function texture(
    x: number,
    y: number,
): TextureResult {
    return {
        type: 't',
        x,
        y,
    }
}

/**
 * Generate the original Liquid Glass fragment.
 *
 * This is the important part of the visual effect.
 */
export function createDefaultFragment(): FragmentFunction {
    return (uv, _mouse) => {
        const ix = uv.x - 0.5
        const iy = uv.y - 0.5

        const distanceToEdge =
            roundedRectSDF(
                ix,
                iy,
                0.3,
                0.2,
                0.6,
            )

        const displacement =
            smoothStep(
                0.8,
                0,
                distanceToEdge - 0.15,
            )

        const scaled =
            smoothStep(
                0,
                1,
                displacement,
            )

        return texture(
            ix * scaled + 0.5,
            iy * scaled + 0.5,
        )
    }
}