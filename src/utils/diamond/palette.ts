/**
 * 钻石配色索引，对应着色器里的 `u.appearance.x`。
 *
 * 单独放一个文件：渲染器本体（含 700 KB 内联模型表）是懒加载的，
 * 而"默认用哪套配色"这种小常量需要留在主 chunk 里。
 */

/** 蓝色（默认）：发送面板、交易详情 */
export const PALETTE_BLUE = 0;
/** Ice 冰白：钱包卡片 */
export const PALETTE_ICE = 1;
/** Cool 冷蓝：Gram 转账气泡（带白色描边） */
export const PALETTE_COOL = 2;
