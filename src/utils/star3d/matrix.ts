/**
 * 星星场景用到的列主序矩阵工具。
 *
 * 单独成文件：一是渲染器本体可以保持精简，二是这部分能脱离 WebGL 单独做断言测试
 * （列主序下标、乘法顺序、投影的深度范围都在 `.tmp` 的测试脚本里核对）。
 *
 * 约定与官方 Matrix4 一致：`m[column * 4 + row]`，与 `at(column, row)` 同义；
 * 矩阵左乘列向量，传给 GLSL 时直接 `uniformMatrix4fv(loc, false, m)`。
 */

/** 4×4 列主序矩阵 */
export type Mat4 = Float32Array;

/** 视场角（度） */
const FIELD_OF_VIEW = 53.13;
/** 近平面 */
const NEAR_PLANE = 1;
/** 远平面 */
const FAR_PLANE = 200;
/** 角度 → 弧度 */
const TO_RADIANS = Math.PI / 180;

/** 列主序矩阵工具 */
export const mat4 = {
    /** 单位矩阵 */
    identity(): Mat4 {
        return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    },

    /** out = a * b（标准矩阵乘法，结果按列主序存放） */
    multiply(a: Mat4, b: Mat4): Mat4 {
        const out = new Float32Array(16);
        for (let column = 0; column < 4; column++) {
            const b0 = b[column * 4];
            const b1 = b[column * 4 + 1];
            const b2 = b[column * 4 + 2];
            const b3 = b[column * 4 + 3];
            for (let row = 0; row < 4; row++) {
                out[column * 4 + row] = a[row] * b0 + a[4 + row] * b1 + a[8 + row] * b2 + a[12 + row] * b3;
            }
        }
        return out;
    },

    /** 绕 x 轴的旋转 */
    rotationX(radians: number): Mat4 {
        const c = Math.cos(radians);
        const s = Math.sin(radians);
        return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
    },

    /** 绕 y 轴的旋转 */
    rotationY(radians: number): Mat4 {
        const c = Math.cos(radians);
        const s = Math.sin(radians);
        return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
    },

    /** 模型在 y 方向抬起 lift 个单位（官方的 `rotation.at(3, 1) = Lift()`） */
    translationY(lift: number): Mat4 {
        const out = mat4.identity();
        out[13] = lift;
        return out;
    },

    /**
     * 透视投影：官方同一个右手相机、眼睛在 +z，但深度映射到 GL 的 [-1, 1]
     * （官方那份把 z 映射到 D3D 的 [0, 1]，在 WebGL 里有一半深度会被裁掉）。
     */
    perspective(aspect: number): Mat4 {
        const f = 1 / Math.tan(FIELD_OF_VIEW * TO_RADIANS / 2);
        const out = new Float32Array(16);
        out[0] = f / aspect;
        out[5] = f;
        out[10] = (FAR_PLANE + NEAR_PLANE) / (NEAR_PLANE - FAR_PLANE);
        out[11] = -1;
        out[14] = 2 * NEAR_PLANE * FAR_PLANE / (NEAR_PLANE - FAR_PLANE);
        out[15] = 0;
        return out;
    },
};
