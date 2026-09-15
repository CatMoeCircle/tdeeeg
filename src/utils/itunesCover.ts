/** iTunes Search 封面：当音频无 album_cover_thumbnail 时的外部备选。 */

type ItunesSearchResponse = {
  results?: Array<{ artworkUrl100?: string }>;
};

const CACHE_PREFIX = 'itunes_cover:';
const MAX_RETRIES = 5;
const RETRY_BASE_DELAY_MS = 400;

/** 内存缓存：null 表示确认无封面，避免重复请求 */
const memoryCache = new Map<string, string | null>();
/** 同一 key 的进行中请求，防止并发重复打接口 */
const inflight = new Map<string, Promise<string | undefined>>();

function storageKey(termKey: string): string {
  return CACHE_PREFIX + termKey;
}

function readPersisted(termKey: string): string | null | undefined {
  try {
    const raw = localStorage.getItem(storageKey(termKey));
    if (raw === null) return undefined;
    if (raw === '') return null;
    return raw;
  } catch {
    return undefined;
  }
}

function writePersisted(termKey: string, value: string | null): void {
  try {
    localStorage.setItem(storageKey(termKey), value ?? '');
  } catch {
    // localStorage 满/隐私模式：忽略，仅依赖内存缓存
  }
}

/** artworkUrl100 默认是 100x100bb，提升到 600x600 */
function toArtwork600(url: string): string {
  return url.replace(/\/\d+x\d+bb\./i, '/600x600bb.');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 单次请求；网络错误或非 2xx 抛出以便重试，「无结果」返回 null 作为最终结果 */
async function requestOnce(term: string): Promise<string | null> {
  const resp = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=4`,
  );
  if (!resp.ok) throw new Error(`iTunes search HTTP ${resp.status}`);
  const data = (await resp.json()) as ItunesSearchResponse;
  const artwork = data?.results?.[0]?.artworkUrl100;
  if (!artwork || typeof artwork !== 'string') return null;
  return toArtwork600(artwork);
}

/**
 * 通过 iTunes Search API 获取封面 URL。
 * term 格式：`{artist} - {title}`；取第一条结果。
 * 请求失败最多重试 5 次；确认无结果则持久化为空，不再重试。
 * 无结果或最终失败时返回 undefined（保持无封面）。
 */
export async function fetchItunesCoverUrl(
  artist?: string,
  title?: string,
): Promise<string | undefined> {
  const a = (artist ?? '').trim();
  const t = (title ?? '').trim();
  if (!a && !t) return undefined;
  const term = a && t ? `${a} - ${t}` : a || t;
  const key = term.toLowerCase();

  if (memoryCache.has(key)) return memoryCache.get(key) ?? undefined;

  const persisted = readPersisted(key);
  if (persisted !== undefined) {
    memoryCache.set(key, persisted);
    return persisted ?? undefined;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const task = (async (): Promise<string | undefined> => {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const result = await requestOnce(term);
        memoryCache.set(key, result);
        writePersisted(key, result);
        return result ?? undefined;
      } catch (e) {
        lastError = e;
        if (attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
        }
      }
    }
    // 重试耗尽：不持久化失败，下次仍可再试
    console.warn('[itunesCover] fetch failed after retries', term, lastError);
    return undefined;
  })().finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, task);
  return task;
}

/** 按音频的 performer/title（或 file_name）查 iTunes 封面 */
export async function fetchItunesCoverForAudio(audio: {
  performer?: string;
  title?: string;
  file_name?: string;
}): Promise<string | undefined> {
  return fetchItunesCoverUrl(audio.performer, audio.title || audio.file_name);
}

/** 将 iTunes 封面 URL 拉成字节数组（供 SMTC 原生封面使用） */
export async function fetchUrlImageBuffer(url: string): Promise<number[] | undefined> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return undefined;
    return Array.from(new Uint8Array(await resp.arrayBuffer()));
  } catch {
    return undefined;
  }
}
