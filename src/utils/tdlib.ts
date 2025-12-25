import { invoke } from "@tauri-apps/api/core";
import type { $Function, $FunctionResultByName } from "tdlib-types";

/**
 * Sends a request to TDLib.
 * Wraps the request object in the structure expected by the Tauri command.
 */
export async function tdlibSend<T extends $Function>(
  request: T
): Promise<$FunctionResultByName[T["_"]]> {
  const response = await invoke("tdlib_send", { request });
  if (response._ === "error") {
    throw response;
  }
  return response;
}
