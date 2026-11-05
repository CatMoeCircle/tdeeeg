/**
 * Telegram TGS 的 Fitzpatrick 肤色替换。
 *
 * Telegram 的动态 emoji（messageAnimatedEmoji）会在 TGS Lottie JSON 顶层嵌入
 * "fitz" 字段——一张肤色映射表：
 *   {
 *     "o": 16567852,   // original 颜色（0xRRGGBB 整数）
 *     "f12": 16110513, // Fitzpatrick type 1-2 共用颜色
 *     "f3": 14595728,  // type 3
 *     "f4": 12553832,  // type 4
 *     "f5": 10315326,  // type 5
 *     "f6": 5850170    // type 6
 *   }
 *
 * lottie-web 不认识 "fitz" 字段，只会播放 original(o) 的颜色。
 * 因此需在加载 JSON 前，根据 animatedEmoji.fitzpatrick_type 把映射里的
 * 原色(o) 批量替换为目标肤色颜色(fXX)，再交给 lottie 渲染。
 *
 * 颜色换算：Lottie 颜色是 [r,g,b,a]（0-1 浮点），telegram 用 0xRRGGBB 整数。
 * 已验证必须用 Math.round(x*255) 换算（floor 会错配）。
 */

/** TGS 顶层 fitz 映射项 */
export interface FitzEntry {
  /** 原始颜色（0xRRGGBB） */
  o: number;
  /** Fitzpatrick type 1 与 2 共用 */
  f12?: number;
  f3?: number;
  f4?: number;
  f5?: number;
  f6?: number;
}

/** fitzpatrick_type (0-6) → fitz 字段 key；type 1 和 2 共享 f12 */
export function fitzKeyForType(type: number): string {
  if (type <= 2) return "f12";
  if (type === 3) return "f3";
  if (type === 4) return "f4";
  if (type === 5) return "f5";
  return "f6";
}

/** [r,g,b,a]（0-1）→ 0xRRGGBB 整数（四舍五入） */
export function rgbaToInt(rgb: number[]): number {
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  return (r << 16) | (g << 8) | b;
}

/** 0xRRGGBB 整数回写为 [r,g,b,a]（仅改 rgb，保留原 alpha） */
export function intToRgba(rgba: number[], intVal: number): void {
  rgba[0] = ((intVal >> 16) & 0xff) / 255;
  rgba[1] = ((intVal >> 8) & 0xff) / 255;
  rgba[2] = (intVal & 0xff) / 255;
}

/** 递归收集并替换所有 Lottie 颜色节点（c.k）下的颜色 */
function walkColors(node: unknown, replacer: (rgba: number[]) => void): void {
  if (node === null || typeof node !== "object") return;
  const n = node as Record<string, unknown>;

  // 该节点是颜色节点（含 c 属性）：替换其 k 中的颜色
  if ("c" in n) {
    applyColorK(n.c, replacer);
  }

  // 递归子节点（顶层对象、assets、shapes、it、kf 等）
  for (const key of Object.keys(n)) {
    const child = n[key];
    if (child && typeof child === "object") {
      walkColors(child, replacer);
    }
  }
}

/** 对 c 的多种形态做颜色替换 */
function applyColorK(c: unknown, replacer: (rgba: number[]) => void): void {
  if (c === null || typeof c !== "object") return;
  const obj = c as Record<string, unknown>;
  // 情况 B / A：c 可能是 { k: ... } 包装，取其 k
  let k = ("k" in obj) ? obj.k : c;

  if (k === null || typeof k !== "object") return;

  // 静态数组 [r,g,b,a]
  if (Array.isArray(k) && k.length === 4 && k.every((v) => typeof v === "number")) {
    replacer(k as unknown as number[]);
    return;
  }

  // 动画 kf 结构：数组元素可能是 { t, s:[r,g,b,a], o/i } 或 `s`/`o` 为颜色数组
  if (Array.isArray(k)) {
    for (const item of k) {
      if (Array.isArray(item) && item.length === 4 && item.every((v) => typeof v === "number")) {
        replacer(item as unknown as number[]);
      } else if (item && typeof item === "object") {
        const kf = item as Record<string, unknown>;
        // s = start 颜色，o = 出站 color（部分版本）
        if (Array.isArray(kf.s)) {
          applyColorK({ k: kf.s }, replacer);
        }
        if (Array.isArray(kf.o)) {
          applyColorK({ k: kf.o }, replacer);
        }
      }
    }
    return;
  }

  // 对象形态（含 k）→ 递归其 k
  if ("k" in obj) {
    applyColorK(k, replacer);
  }
}

/**
 * 根据 fitzpatrick_type 对 TGS 动画数据应用肤色替换。
 * 返回新的动画对象（就地修改入参即可，因为调用方每次解压都是新副本）。
 * 若无需替换（无 fitz / type 为 0 / 无匹配），原样返回。
 */
export function applyFitzpatrick<T>(animData: T, fitzpatrickType: number): T {
  if (!fitzpatrickType) return animData;
  const obj = animData as Record<string, unknown> | null;
  if (!obj || !Array.isArray(obj.fitz)) return animData;

  const key = fitzKeyForType(fitzpatrickType);
  // 构建 原色 → 目标肤色色 映射
  const colorMap = new Map<number, number>();
  const entries = obj.fitz as Array<Record<string, number | undefined>>;
  for (const entry of entries) {
    const o = entry.o;
    if (typeof o !== "number") continue;
    const target = entry[key];
    if (typeof target === "number") {
      colorMap.set(o, target);
    }
  }
  if (colorMap.size === 0) return animData;

  walkColors(animData, (rgba) => {
    const orig = rgbaToInt(rgba);
    const target = colorMap.get(orig);
    if (target !== undefined) {
      intToRgba(rgba, target);
    }
  });

  return animData;
}
