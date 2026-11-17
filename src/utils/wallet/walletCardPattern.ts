/**
 * 钱包卡片背景符号的落点。
 *
 * 对齐 Telegram Desktop WalletCard.PatternSlots：六边形点阵，按固定 hash 抖动，
 * 再互相推开、补空隙、靠边缩小并淡出。同一张卡每次渲染的位置完全一致。
 */
export interface WalletCardPatternSlot {
    x: number;
    y: number;
    size: number;
    alpha: number;
}

const TUNING_HEIGHT = 205;

function smooth(e0: number, e1: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
}

/** C# unchecked int + LCG */
function rnd(seed: number, salt: number): number {
    const v = (Math.imul((seed ^ Math.imul(salt, 83492791)) | 0, 1103515245) + 12345) | 0;
    return (((v >>> 8) & 0xffff) / 65535) * 2 - 1;
}

export function walletCardPatternSlots(width: number, height: number): WalletCardPatternSlot[] {
    const k = height / TUNING_HEIGHT;
    const row = 50 * k;
    const col = (row * 2) / Math.sqrt(3);
    const baseSize = 22 * k;
    const sizes = [1.12, 0.95, 0.78];

    const xs: number[] = [];
    const ys: number[] = [];
    const ss: number[] = [];
    const alphas: number[] = [];

    for (let r = -3; r < 3; r++) {
        const offset = (r & 1) !== 0 ? col / 2 : 0;
        const n = Math.floor(width / col) + 2;

        for (let c = -n; c <= n; c++) {
            const seed = ((r + 7) * 73856093) ^ ((c + 31) * 19349663);
            const x = width / 2 + c * col + offset + 0.27 * col * rnd(seed, 1);
            const y = height / 2 + (r + 0.5) * row + 0.27 * row * rnd(seed, 2);

            if (x < -col || x > width + col || y < -row || y > height + row) {
                continue;
            }

            const pick = (((2 * r + c + (rnd(seed, 3) > 0.55 ? 1 : 0)) % 3) + 3) % 3;
            xs.push(x);
            ys.push(y);
            ss.push(sizes[pick] * baseSize * (1 + 0.05 * Math.sin((8.2 * x) / width + (3.1 * y) / height)));
            alphas.push(0.41 + 0.03 * rnd(seed, 4));
        }
    }

    // 互相推开，避免符号叠在一起
    for (let pass = 0; pass < 8; pass++) {
        for (let i = 0; i < xs.length; i++) {
            for (let j = i + 1; j < xs.length; j++) {
                const dx = xs[j] - xs[i];
                const dy = ys[j] - ys[i];
                const d = Math.sqrt(dx * dx + dy * dy);
                const minimum = 0.62 * row + 0.3 * (ss[i] + ss[j]);

                if (d > 0.01 && d < minimum) {
                    const push = ((minimum - d) * 0.25) / d;
                    xs[i] -= dx * push;
                    ys[i] -= dy * push;
                    xs[j] += dx * push;
                    ys[j] += dy * push;
                }
            }
        }
    }

    // 补空隙
    for (let y = row / 4; y < height; y += row / 4) {
        for (let x = col / 4; x < width; x += col / 4) {
            let nearest = Number.MAX_VALUE;
            for (let i = 0; i < xs.length; i++) {
                nearest = Math.min(nearest, Math.sqrt((xs[i] - x) * (xs[i] - x) + (ys[i] - y) * (ys[i] - y)));
            }

            if (nearest > 0.8 * row) {
                xs.push(x);
                ys.push(y);
                ss.push(baseSize * 0.78);
                alphas.push(0.41);
            }
        }
    }

    const slots: WalletCardPatternSlot[] = [];
    for (let i = 0; i < xs.length; i++) {
        const x = xs[i];
        const y = ys[i];
        const edge = Math.min(Math.min(x, width - x), Math.min(y, height - y));
        const shrink = 0.72 + 0.28 * smooth(9 * k, 40 * k, edge);
        const size = ss[i] * shrink;

        if (edge < size / 2 + 4 * k) {
            continue;
        }

        slots.push({
            x,
            y,
            size,
            alpha: alphas[i]
                * smooth(0, 0.2 * width, Math.min(x, width - x))
                * smooth(0, 0.2 * height, Math.min(y, height - y)),
        });
    }

    return slots;
}
