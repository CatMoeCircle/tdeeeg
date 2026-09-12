/**
 * 运行时崩溃/白屏诊断。
 *
 * 目标：在「页面突然清空、控制台无报错」时留下可定位线索。
 * 不依赖 Vue，即使应用未挂载或已卸载也能工作。
 */

const LOG_KEY = "tdgram-crash-log";
const MAX_ENTRIES = 40;

type CrashLogEntry = {
  t: number;
  type: string;
  message: string;
  extra?: Record<string, unknown>;
};

function appendLog(entry: Omit<CrashLogEntry, "t">) {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const list: CrashLogEntry[] = raw ? JSON.parse(raw) : [];
    list.push({ t: Date.now(), ...entry });
    while (list.length > MAX_ENTRIES) list.shift();
    localStorage.setItem(LOG_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

/** 读取最近的崩溃日志（开发者选项/排查用） */
export function readCrashLog(): CrashLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** 清空崩溃日志 */
export function clearCrashLog() {
  try {
    localStorage.removeItem(LOG_KEY);
  } catch {
    // ignore
  }
}

function showOverlay(title: string, detail: string) {
  if (document.getElementById("tdgram-crash-overlay")) return;
  const box = document.createElement("div");
  box.id = "tdgram-crash-overlay";
  box.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483647",
    "background:rgba(15,15,18,0.92)",
    "color:#f5f5f5",
    "font:13px/1.5 ui-monospace,Consolas,monospace",
    "padding:24px",
    "overflow:auto",
    "white-space:pre-wrap",
    "word-break:break-word",
  ].join(";");
  const h = document.createElement("div");
  h.style.cssText = "font-size:15px;font-weight:600;margin-bottom:12px;color:#ff8f8f";
  h.textContent = title;
  const p = document.createElement("div");
  p.style.cssText = "opacity:0.9;user-select:text";
  p.textContent = detail;
  const hint = document.createElement("div");
  hint.style.cssText = "margin-top:16px;opacity:0.6;font-size:12px";
  hint.textContent =
    "该浮层来自 crashGuard，说明前端运行时已捕获到致命问题。详情已写入 localStorage['tdgram-crash-log']。";
  box.append(h, p, hint);
  document.body.appendChild(box);
}

/**
 * 安装全局错误捕获 + 文档被清空检测。
 * 应在应用入口尽早调用（import 阶段即可）。
 */
export function installCrashGuard(options?: { watchBlankMs?: number }) {
  const watchBlankMs = options?.watchBlankMs ?? 2000;

  window.addEventListener("error", (e) => {
    const msg = e.message || "unknown error";
    const stack = e.error?.stack ? String(e.error.stack) : undefined;
    appendLog({ type: "error", message: msg, extra: { stack, file: e.filename, line: e.lineno } });
    console.error("[crashGuard] window.onerror:", msg, e.error);
  });

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    // 浏览器媒体竞态：play() 尚未完成就被 pause()，属预期行为，不当崩溃上报
    if (
      reason instanceof DOMException &&
      (reason.name === "AbortError" || reason.name === "NotAllowedError")
    ) {
      return;
    }
    if (reason instanceof Error && reason.name === "AbortError") {
      return;
    }
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : JSON.stringify(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    appendLog({ type: "unhandledrejection", message: msg, extra: { stack } });
    console.error("[crashGuard] unhandledrejection:", reason);
  });

  window.addEventListener("pagehide", () => {
    appendLog({
      type: "pagehide",
      message: document.visibilityState,
      extra: { href: location.href, appChildren: document.getElementById("app")?.childElementCount ?? -1 },
    });
  });

  // 文档/根节点被异常清空检测（Vue 卸载或整页被替换）
  let lastAppChildren = -1;
  setInterval(() => {
    const root = document.getElementById("app");
    const children = root?.childElementCount ?? -1;
    const bodyChildren = document.body?.childElementCount ?? -1;
    // 挂载后曾经有过内容，突然变成 0 → 高度可疑
    if (lastAppChildren > 0 && children === 0) {
      const msg = `#app 内容被清空（此前 ${lastAppChildren} 个子节点，body=${bodyChildren}）`;
      appendLog({
        type: "blank-dom",
        message: msg,
        extra: {
          href: location.href,
          bodyHtmlLength: document.body?.innerHTML?.length ?? -1,
          title: document.title,
        },
      });
      console.error("[crashGuard]", msg);
      showOverlay("检测到界面被清空", msg + "\nlocation: " + location.href);
    }
    if (children > 0) lastAppChildren = children;
  }, watchBlankMs);
}

/**
 * bootstrap 失败时的兜底 UI：不依赖 Vue，确保窗口不是纯空白。
 */
export function showBootstrapFailure(step: string, err: unknown) {
  const detail =
    err instanceof Error
      ? `${err.message}\n${err.stack ?? ""}`
      : typeof err === "string"
        ? err
        : JSON.stringify(err);
  appendLog({ type: "bootstrap-fail", message: `${step}: ${detail}` });
  console.error(`[bootstrap] 失败于 ${step}:`, err);
  showOverlay(`应用启动失败（${step}）`, detail);
}
