import { defineConfig, type UserConfig } from "vite";
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
export default defineConfig(async (): Promise<UserConfig> => ({
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
    rollupOptions: {
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
