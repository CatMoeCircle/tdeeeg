/**
 * 星星 3D 渲染器的对外入口。
 *
 * 用法（与钻石一致）：
 *   const handle = mountStar3D(canvas, { size: 120, night: isDark.value });
 *   handle.setVisible(true);        // 视口门控
 *   handle.setActive(true);         // 按下
 *   handle.setTilt(dx, dy);         // 拖动
 *   handle.setActive(false);        // 松手
 *   handle.dispose();               // 卸载
 */

export { mountStar3D, starStage } from './stage';
export type { StarHandle, StarMountOptions } from './stage';

export { StarFrameClock, StarMotion, ALPHA_FADE_SECONDS, PITCH_LIMIT_DEGREES, X_OFFSET_PER_SECOND } from './motion';
export type { StarPose } from './motion';

export {
    GOLDEN_STAR_PALETTE_LIGHT,
    GOLDEN_STAR_PALETTE_NIGHT,
    PREMIUM_STAR_PALETTE_LIGHT,
    PREMIUM_STAR_PALETTE_NIGHT,
    starPalette,
} from './palette';
export type { Rgb, StarPalette } from './palette';

export { ICON_UNIFORM_BYTES, ICON_UNIFORM_FLOATS, ICON_UNIFORM_OFFSETS } from './shader';
export type { StarTables, StarTextures } from './tables';
