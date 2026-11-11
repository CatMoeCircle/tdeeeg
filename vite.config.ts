import { defineConfig, type UserConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import vueDevTools from 'vite-plugin-vue-devtools'
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async (): Promise<UserConfig> => ({
  plugins: [
    vue(),
    tailwindcss(),
    vueDevTools(),
  ],
  // 把 .tgs 纳入资源处理：默认 assetsInclude 不含 .tgs，导致
  // new URL('...party.tgs', import.meta.url) 在打包时不会被 Vite 处理/产出，
  // 生产环境 URL 指向不存在的文件而加载不出来。
  assetsInclude: ["**/*.tgs"],
  // tlottie 用 new URL('assets/tlottie.worker-*.js', import.meta.url) 创建 Worker。
  // 依赖预构建会把相对 Worker 路径改写到 .vite/deps 下导致 404，必须排除。
  optimizeDeps: {
    exclude: ["tlottie"],
  },
  worker: {
    format: "es",
  },
  // 单入口：主应用 index.html
  build: {
    // 需要运行时 fetch 的本地资源必须保持为独立文件（钻石模型表的 9 个 .bin，
    // 见 src/utils/diamond/tables.ts；以及小体积的 .tgs 动画）。
    // 默认 assetsInlineLimit 会把小于 4 KB 的资源内联成 data: URL，而打包后的
    // CSP（tauri.conf.json）connect-src 只有 'self' / blob: / asset: 等，不含
    // data:，于是 fetch('data:…') 被 WebView 直接拒绝：钻石那边 Promise.all
    // 整体失败，石头永远不出现。开发环境不套 CSP，所以只在打包后才复现。
    // 这里让这两类一律产出真实文件，仍按 'self' 从资源协议读取。
    assetsInlineLimit: (filePath: string) =>
      /\.(bin|tgs)$/.test(filePath) ? false : undefined,
    rolldownOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
    },
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
        protocol: "ws",
        host,
        port: 1421,
      }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
