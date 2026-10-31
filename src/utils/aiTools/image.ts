/**
 * 图像工具实现：本地图片路径 → JPEG（长边 ≤ 720、质量 80%）→ 临时文件 → 作为**独立图片消息**交给模型。
 *
 * 只在当前模型支持图像输入时下发（见 utils/aiChat 的 enabledTools 与 aiModelSeesImages）。
 *
 * base64 不进工具结果（tool 消息只能装文本，塞进历史等于每轮重发几十万字符）：
 * 转换后的 JPEG 由 Rust 写到**数据目录**（设置里的存储位置）下的 ai_images/（不用系统 Temp，
 * 便携版不该往 C 盘塞缓存），路径登记到 pendingImages，由 utils/aiChat 在下一轮请求前
 * 插一条 user 图片消息（attachments）—— Rust 侧读盘转多模态，与用户手动附图同一条通路。
 *
 * **只要是动图都只取首帧**：
 * - webm / mp4 类的视频容器：`<video>` 停在开头取第一帧（项目里没有 ffmpeg，只有浏览器能解码）；
 * - gif / webp / apng 这类图片动图：ImageDecoder 明确解 `frameIndex: 0`，
 *   不用 `<img>`（元素里的动图会自己往前播，drawImage 拿到的不一定是第一帧）；
 * - 静态图片也走同一条首帧管线，缩放 / 质量规则只维护一份。
 *
 * 注意：convertFileSrc 的 asset URL 画到 canvas 会污染画布（toDataURL 抛 SecurityError），
 * 必须 readFile → Blob URL（同 utils/wallpaper.ts）。
 */
import { invoke } from "@tauri-apps/api/core";
import { readFile } from "@tauri-apps/plugin-fs";
import { registerImplementation } from "./call.ts";
import { singleResult } from "./limits.ts";
import type { ToolReply } from "./types.ts";

/** 长边上限：超过就等比缩到 720（与工具描述一致） */
const MAX_EDGE = 720;
/** JPEG 质量：0.8 */
const JPEG_QUALITY = 0.8;
/** 解码超时：工具跑在 agent 循环里，卡死比报错更糟 */
const DECODE_TIMEOUT_MS = 15000;

/**
 * 待附加给模型的图片：转换后的 JPEG 路径（数据目录下的 ai_images/）。
 * 工具结果里只回路径（不含图像数据），真正的图像由 utils/aiChat 在下一轮请求前
 * 作为独立的 user 图片消息插进历史。
 *
 * 收集器挂在**这一轮的 ToolContext** 上（ctx.pendingImages），不是模块级数组：
 * 聊天 A 和 B 同时在跑时，模块级数组会让 A 读到 B 的图。这里只保留一个
 * 兜底收集器给「没有走 runAiTurn」的调用方（如独立自检脚本）。
 */
const fallbackPendingImages: string[] = [];

/** 取走兜底收集器里的图片（走 runAiTurn 的调用方用 ctx 自带的数组，不需要这个） */
export function takePendingImages(): string[] {
  return fallbackPendingImages.splice(0, fallbackPendingImages.length);
}

/** 图片扩展名 → 媒体类型（webm 走视频取帧，tgs 明确不支持） */
const IMAGE_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
};

/** 视频容器扩展名 → 媒体类型（Telegram 动图常见 mp4 / webm，只取首帧；容器得是浏览器能解的） */
const VIDEO_MIME: Record<string, string> = {
  webm: "video/webm",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
};

const UNSUPPORTED_EXT = "tgs";

function extOf(path: string): string {
  return path.split(/[\\/]/).pop()?.split(".").pop()?.toLowerCase() ?? "";
}

/** 已解码的帧与原始尺寸 */
interface Frame {
  source: CanvasImageSource;
  width: number;
  height: number;
  /** 解码结果占用的资源（ImageDecoder 的 VideoFrame）要手动释放 */
  release?: () => void;
}

/** WebCodecs 的 ImageDecoder（当前 lib.dom 还没带这个类型）：只声明用得到的部分 */
interface ImageDecoderInitLike {
  data: Uint8Array;
  type: string;
}
interface DecodedFrameLike {
  displayWidth: number;
  displayHeight: number;
  close(): void;
}
interface ImageDecoderLike {
  tracks: { ready: Promise<void> };
  decode(options: { frameIndex: number }): Promise<{ image: DecodedFrameLike }>;
  close(): void;
}
type ImageDecoderCtor = new (init: ImageDecoderInitLike) => ImageDecoderLike;

/** 取 ImageDecoder 构造器；环境没有 WebCodecs（或不是安全上下文）时为 null */
function imageDecoderCtor(): ImageDecoderCtor | null {
  const ctor = (globalThis as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder;
  return typeof ctor === "function" ? ctor : null;
}

/**
 * 动图（gif / webp / apng…）只取首帧：用 ImageDecoder 明确解 `frameIndex: 0`。
 * 不能用 `<img>` —— 元素里的动图会自己往前播，drawImage 拿到的不一定是第一帧。
 * 环境没有 WebCodecs 时返回 null，由调用方回退到 `<img>`。
 */
async function decodeFirstFrameImage(bytes: Uint8Array, mime: string): Promise<Frame | null> {
  const Decoder = imageDecoderCtor();
  if (!Decoder) return null;
  let decoder: ImageDecoderLike | null = null;
  try {
    decoder = new Decoder({ data: bytes, type: mime });
    await decoder.tracks.ready;
    const { image } = await decoder.decode({ frameIndex: 0 });
    if (!image.displayWidth || !image.displayHeight) {
      image.close();
      decoder.close();
      return null;
    }
    // 解码器跟着帧一起释放：绘制完（toJpeg 之后）才关，别把还要用的 VideoFrame 提前收走
    const owner = decoder;
    return {
      // VideoFrame 是合法的 CanvasImageSource（drawImage 直接可用），只是 lib.dom 里没这个类型
      source: image as unknown as CanvasImageSource,
      width: image.displayWidth,
      height: image.displayHeight,
      release: () => {
        image.close();
        owner.close();
      },
    };
  } catch {
    decoder?.close();
    return null;
  }
}

/**
 * 图片解码：静态图与动图统一只取首帧 —— 先走 ImageDecoder（gif / webp 动图明确取第 0 帧），
 * 环境不支持或解码失败才退回 Image 元素。
 */
async function decodeImage(bytes: Uint8Array, mime: string, url: string): Promise<Frame> {
  const first = await decodeFirstFrameImage(bytes, mime);
  if (first) return first;
  return new Promise<Frame>((resolve, reject) => {
    const img = new Image();
    const fail = (message: string) => {
      window.clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      reject(new Error(message));
    };
    const timer = window.setTimeout(() => fail("图片解码超时"), DECODE_TIMEOUT_MS);
    img.onload = () => {
      window.clearTimeout(timer);
      if (!img.naturalWidth || !img.naturalHeight) {
        fail("图片尺寸为空，文件可能已损坏");
        return;
      }
      // 兜底路径拿不到「第 0 帧」的保证：动图可能已经播了几帧，但不至于失败
      resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => fail("图片解码失败：文件可能损坏，或该图片格式不受支持");
    img.src = url;
  });
}

/** webm 动图首帧：loadeddata 后 seek 一点点再画，避免拿到空白帧 */
function decodeVideoFirstFrame(url: string): Promise<Frame> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    let settled = false;
    let timer = 0;
    let seekTimer = 0;

    const cleanup = () => {
      window.clearTimeout(timer);
      window.clearTimeout(seekTimer);
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
    };
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      video.removeAttribute("src");
      video.load();
      reject(new Error(message));
    };
    /** 帧还没解出来（videoWidth = 0）就不算完成，等 seeked 或超时兜底 */
    const done = () => {
      if (settled || !video.videoWidth || !video.videoHeight) return;
      settled = true;
      cleanup();
      resolve({ source: video, width: video.videoWidth, height: video.videoHeight });
    };

    timer = window.setTimeout(() => fail("动图首帧解码超时"), DECODE_TIMEOUT_MS);
    video.onloadeddata = () => {
      // 首帧已可画；部分容器要 seek 之后才出数据，这里 seek 到极小时间点，并留一个兜底定时器
      seekTimer = window.setTimeout(done, 300);
      try {
        video.currentTime = Math.min(0.04, (video.duration || 0.04) / 2);
      } catch {
        done();
      }
    };
    video.onseeked = done;
    video.onerror = () => fail("动图解码失败：webm 首帧取不到，文件可能损坏");
    video.src = url;
  });
}

/** 等比缩放到长边 ≤ MAX_EDGE，铺白底后编码成质量 80 的 JPEG（只要字节，别在这里转 base64） */
async function encodeJpeg(frame: Frame): Promise<{ bytes: Uint8Array; width: number; height: number }> {
  const scale = Math.min(1, MAX_EDGE / Math.max(frame.width, frame.height));
  const width = Math.max(1, Math.round(frame.width * scale));
  const height = Math.max(1, Math.round(frame.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("创建画布失败，无法转换图片");
  // JPEG 没有透明通道：先铺白底，透明 PNG / 带 alpha 的动图不会变成黑底
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  try {
    ctx.drawImage(frame.source, 0, 0, width, height);
  } catch {
    throw new Error("图片绘制失败：帧数据不可用");
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("图片编码失败");
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

registerImplementation("read_image", async (args, ctx): Promise<ToolReply> => {
  const path = typeof args.path === "string" ? args.path.trim() : "";
  if (!path) throw new Error("参数 path 不能为空");
  const ext = extOf(path);
  if (ext === UNSUPPORTED_EXT) {
    throw new Error("tgs 动画贴纸不支持：只支持静态图片与 webm / mp4 动图（动图一律只取首帧）");
  }
  const isVideo = ext in VIDEO_MIME;
  const mime = isVideo ? VIDEO_MIME[ext] : IMAGE_MIME[ext];
  if (!mime) {
    throw new Error(
      `不支持的图片格式：${ext || "未知扩展名"}（支持 jpg / jpeg / png / webp / gif / bmp / webm / mp4 / m4v / mov）`,
    );
  }

  const bytes = await readFile(path);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  let frame: Frame | null = null;
  try {
    frame = isVideo ? await decodeVideoFirstFrame(url) : await decodeImage(bytes, mime, url);
    const jpeg = await encodeJpeg(frame);
    // 落盘到数据目录（跟随设置里的存储位置），路径就是下一条「图片消息」的附件（base64 不进工具结果）
    const imagePath = await invoke<string>("ai_save_tool_image", { bytes: Array.from(jpeg.bytes) });
    // 挂到**这一轮**的收集器上（不再用模块级 pendingImages：多聊天并发会串图）
    ctx.pendingImages.push(imagePath);
    // 原图尺寸一并给模型：它只看得到 720 长边内的画面，需要判断「是不是大图」时用得上
    return singleResult("read_image", {
      source: path,
      /** 转换后的本地 JPEG；图像本身会作为独立图片消息附上，不要拿这个路径再调一次 read_image */
      image: imagePath,
      mime: "image/jpeg",
      width: jpeg.width,
      height: jpeg.height,
      source_width: frame.width,
      source_height: frame.height,
    });
  } finally {
    frame?.release?.();
    URL.revokeObjectURL(url);
  }
});
