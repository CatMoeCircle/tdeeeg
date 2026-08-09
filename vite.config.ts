import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import { TDesignResolver } from "@tdesign-vue-next/auto-import-resolver";
import vueDevTools from 'vite-plugin-vue-devtools'
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    vue(),
    tailwindcss(),
    AutoImport({
      resolvers: [
        TDesignResolver({
          library: "vue-next",
        }),
      ],
      // put generated types into src so TypeScript picks them up automatically
      dts: "src/auto-imports.d.ts",
    }),
    Components({
      resolvers: [
        TDesignResolver({
          library: "vue-next",
        }),
      ],
      // put generated component typings into src so IDE/TS finds them
      dts: "src/components.d.ts",
    }),
    vueDevTools(),
  ],
  // 把 .tgs 纳入资源处理：默认 assetsInclude 不含 .tgs，导致
  // new URL('...party.tgs', import.meta.url) 在打包时不会被 Vite 处理/产出，
  // 生产环境 URL 指向不存在的文件而加载不出来。
  assetsInclude: ["**/*.tgs"],
  // 单入口：主应用 index.html
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
      },
      output: {
        manualChunks: {
          // rlottie（TGS 动画引擎）体积很大，拆分到独立 chunk，
          // 避免被内联进 MediaViewer / ChatDetail 等组件 chunk 导致其过大，
          // 同时便于浏览器长期缓存复用。
          rlottie: ["rlottie-wasm-vue-player"],
          // pako 是 rlottie 解压 .tgs 数据时常用的 gzip 库，一并拆出
          pako: ["pako"],
        },
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
