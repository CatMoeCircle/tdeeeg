/**
 * rlottie (rlottie-wasm-vue-player) 全局运行时预加载器。
 *
 * 背景：
 * rlottie-wasm-vue-player 的 `RlottiePlayer` 组件内部使用 `document.createElement('script')`
 * 动态注入 data: URL 内联脚本，这在 tdeeeg 的严格 CSP（未放开 `data:` / `blob:`，也未放开
 * `'wasm-unsafe-eval'`）的 Tauri WebView 下会被拦截，且其「先创建空 `window.Module` 再判定
 * `loadSingleScriptOnce`」的逻辑存在 bug，会导致 Emscripten 运行时永远不初始化、动画不显示。
 *
 * 本模块绕开该机制：把 rlottie 的独立资产（rlottie-wasm.js / rlottie-module.js /
 * rlottie-handler.js / rlottie-wasm.wasm，均来自包 dist/assets，已复制到 public/rlottie/）
 * 在同源路径下用普通 `<script src>` 加载并初始化全局：
 *   - window.Module                 —— Emscripten 运行时（此处提前设好 locateFile/onRuntimeInitialized）
 *   - window.RLottieModule          —— rlottie 画布模块
 *   - window.RLottieHandler         —— rlottie 动画控制句柄
 *
 * 这样 RlottiePlayer 组件挂载时看到三者均已就绪，`loadModules` 会直接通过，
 * 不会再尝试注入被 CSP 拦截的 data: 脚本，也绕开了组件自身的加载 bug。
 *
 * 必须在应用挂载（app.mount）之前 await initRlottie()。
 */

/** 资产同源路径前缀（public/rlottie → /rlottie） */
const RlottieBase = '/rlottie';

declare global {
    interface Window {
        Module?: {
            locateFile?: (file: string) => string;
            onRuntimeInitialized?: () => void;
            calledRun?: boolean;
            RlottieWasm?: new () => unknown;
            [key: string]: unknown;
        };
        RLottieModule?: unknown;
        RLottieHandler?: new (canvasId: string) => unknown;
    }
}

/** 当前是否已由本模块（或系统）把 rlottie 运行时准备就绪 */
function isEmscriptenReady(): boolean {
    return !!(
        window.Module?.calledRun &&
        typeof window.Module?.RlottieWasm === 'function'
    );
}

/** 注入一个同源脚本并等待其执行完成（onload） */
function injectScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = false;
        s.onload = () => resolve();
        s.onerror = (e) => {
            console.error(`[rlottiePreload] 加载 ${src} 失败:`, e);
            reject(new Error(`Failed to load ${src}`));
        };
        document.head.appendChild(s);
    });
}

/**
 * 加载 Emscripten 运行时模块（rlottie-wasm.js）。
 * 解析条件：window.Module.calledRun === true 且 Module.RlottieWasm 为构造函数。
 */
async function loadEmscriptenModule(): Promise<void> {
    if (isEmscriptenReady()) {
        console.log('[rlottiePreload] Emscripten 运行时已就绪，跳过加载。');
        return;
    }

    await new Promise<void>((resolve, reject) => {
        // 复用/准备模块配置对象；emscripten 的 rlottie-wasm.js 会尊重已有 Module.
        const mod: Window['Module'] = window.Module ?? {};
        window.Module = mod;
        mod.locateFile = (file: string) =>
            file.endsWith('.wasm') ? `${RlottieBase}/rlottie-wasm.wasm` : `${RlottieBase}/${file}`;

        let settled = false;
        const done = () => {
            if (settled) return;
            settled = true;
            if (isEmscriptenReady()) {
                console.log('[rlottiePreload] Emscripten 运行时初始化完成，RlottieWasm 可用。');
                resolve();
            } else {
                console.error('[rlottiePreload] Emscripten 运行时初始化完成，但 RlottieWasm 不可用。');
                reject(new Error('RlottieWasm 未在 onRuntimeInitialized 后出现'));
            }
        };

        // 此回调在 WebAssembly 实例化完成、Module.RlottieWasm 暴露后触发
        mod.onRuntimeInitialized = done;

        injectScript(`${RlottieBase}/rlottie-wasm.js`)
            .then(() => {
                // 注入完成时若已初始化（例如模块很快跑完 or 已注入过）则直接结算
                if (isEmscriptenReady()) done();
                // 否则等 onRuntimeInitialized 触发 done()
            })
            .catch(reject);
    });
}

/** 加载一个定义全局名字的普通脚本，等待其全局可用 */
function loadGlobalScript(src: string, globalName: 'RLottieModule' | 'RLottieHandler'): Promise<void> {
    return new Promise((resolve, reject) => {
        if (window[globalName]) {
            console.log(`[rlottiePreload] ${globalName} 已存在，跳过加载。`);
            resolve();
            return;
        }
        injectScript(`${RlottieBase}/${src}`)
            .then(() => {
                if (window[globalName]) {
                    console.log(`[rlottiePreload] ${globalName} 加载完成。`);
                    resolve();
                } else {
                    console.error(`[rlottiePreload] ${src} 已加载但 ${globalName} 未定义。`);
                    reject(new Error(`${globalName} undefined after ${src}`));
                }
            })
            .catch(reject);
    });
}

let readyPromise: Promise<void> | null = null;

/**
 * 初始化 rlottie 全局运行时（幂等，可安全多次调用）。
 * 应在 app.mount() 之前 await。
 */
export function initRlottie(): Promise<void> {
    if (!readyPromise) {
        readyPromise = (async () => {
            await loadEmscriptenModule();
            await loadGlobalScript('rlottie-module.js', 'RLottieModule');
            await loadGlobalScript('rlottie-handler.js', 'RLottieHandler');
            console.log('[rlottiePreload] rlottie 运行时全部就绪。');
        })().catch((e) => {
            // 失败后允许下次重试
            readyPromise = null;
            throw e;
        });
    }
    return readyPromise;
}
