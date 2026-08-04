import type { $Function, $FunctionResultByName } from "tdlib-types";
import "@tauri-apps/api/core";

declare module "@tauri-apps/api/core" {
  export function invoke<T extends $Function>(
    cmd: "tdlib_send",
    args: { request: T }
  ): Promise<$FunctionResultByName[T["_"]]>;

  export function invoke(
    cmd: "set_tdlib_parameters",
    args: { api_id: number; api_hash: string; use_test_dc: boolean }
  ): Promise<void>;

  export function invoke(
    cmd: "open_with_dialog",
    args: { path: string }
  ): Promise<void>;
}