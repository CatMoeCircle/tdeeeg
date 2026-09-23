import type { $Function, $FunctionResultByName } from "tdlib-types";
import "@tauri-apps/api/core";

declare module "@tauri-apps/api/core" {
  export function invoke<T extends $Function>(
    cmd: "tdlib_send",
    args: { request: T }
  ): Promise<$FunctionResultByName[T["_"]]>;

  export function invoke(
    cmd: "set_tdlib_parameters",
    args: {
      apiId?: number;
      apiHash?: string;
      /** true=写入自定义凭据；false=回落编译期内置凭据 */
      useCustomApi?: boolean;
      useTestDc?: boolean;
      persist?: boolean;
      languagePackId?: string;
      localizationTarget?: string;
      systemLanguageCode?: string;
    }
  ): Promise<void>;

  /** force=true 时关闭已有客户端并按当前参数重建（含自定义 API） */
  export function invoke(cmd: "init_tdlib", args?: { force?: boolean }): Promise<void>;

  export function invoke(cmd: "restart_tdlib"): Promise<void>;
  export function invoke(cmd: "force_reinit_active"): Promise<{
    session_id: number;
    auth: { _: string } & Record<string, unknown>;
  }>;
  export function invoke(cmd: "logout_tdlib"): Promise<void>;

  export function invoke(
    cmd: "open_with_dialog",
    args: { path: string }
  ): Promise<void>;

  export function invoke(
    cmd: "get_system_proxy"
  ): Promise<{
    server: string;
    port: number;
    username: string;
    password: string;
  } | null>;

  export function invoke(
    cmd: "set_proxy_config",
    args: {
      mode: string;
      proxy_type?: string;
      server?: string;
      port?: string;
      username?: string;
      password?: string;
      secret?: string;
      comment?: string;
    }
  ): Promise<void>;

  export function invoke(cmd: "read_clipboard_image"): Promise<string>;

  export function invoke(
    cmd: "detect_language",
    args: { text: string }
  ): Promise<{ language: string; confidence: number }>;

  export function invoke(
    cmd: "detect_languages",
    args: { text: string; topK?: number }
  ): Promise<{ language: string; confidence: number }[]>;

  export function invoke(
    cmd: "should_translate_text",
    args: {
      text: string;
      targetLang: string;
      doNotTranslate?: string[];
      minConfidence?: number;
    }
  ): Promise<{
    shouldTranslate: boolean;
    detectedLanguage: string;
    confidence: number;
    reason: string;
  }>;
}