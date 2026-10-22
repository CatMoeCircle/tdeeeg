<template>
  <template v-for="(seg, i) in segments" :key="i">
    <a
      v-if="seg.href"
      :href="seg.href"
      class="linkify-text__link"
      @click.prevent.stop="openHref(seg.href)"
    >{{ seg.text }}</a>
    <template v-else>{{ seg.text }}</template>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import type { textEntity } from 'tdlib-types';
import { detectInlineEntities } from '../../utils/textEntityDetect';
import { resolveInternalLink } from '../../utils/openInternalLink';
import { confirmAndOpenExternalLink } from '../../utils/openExternalLink';

/**
 * 可点击链接的纯文本：用于资料页简介、群组介绍等非消息场景。
 *
 * 文案本身只是 formattedText 的 text，实体常被丢弃（第三方写入 / 只取 text），
 * 所以这里先用 detectInlineEntities 补全识别，再叠加 TDLib 给的实体，
 * 把链接 / 邮箱 / 电话 / @用户名 渲染成可点击片段；其余文字原样输出。
 *
 * 点击行为与消息内链接一致：
 *   - t.me / proxy.t.me / tg:// → resolveInternalLink 内部跳转
 *   - http(s) / mailto / tel → 外部确认框后交系统浏览器打开
 */
const props = defineProps<{
  /** 要渲染的文本 */
  text: string | number | { toString(): string };
  /** TDLib 提供的实体（可含 textUrl 隐藏链接、mentionName 等），可选 */
  entities?: textEntity[];
}>();

const router = useRouter();

type Segment = { text: string; href?: string };

/**
 * 补齐协议：TDLib 的 url 实体文本常是裸域名（`t.me/xxx`、`example.com`、`www.a.com`），
 * 没有协议就无法判断该内部跳转还是外部打开，必须先归一化成 http(s) 链接。
 */
function normalizeHref(raw: string): string {
  const href = raw.trim();
  if (!href) return '';
  // 已带协议（http/https/tg/mailto/tel/…）
  if (/^(?:https?|tg|mailto|tel|ftp):/i.test(href)) return href;
  // 裸域名 / www / t.me 之类的相对域名
  if (/^(?:[\w-]+\.)+[\w-]{2,}(?::\d+)?(?:[/?#]|$)/i.test(href)) return `https://${href}`;
  return href;
}

/** 实体 → 可打开的 href；不支持的实体返回 undefined（保持普通文字） */
function entityHref(entity: textEntity, slice: string): string | undefined {
  switch (entity.type._) {
    case 'textEntityTypeTextUrl':
      return entity.type.url ? normalizeHref(entity.type.url) : undefined;
    case 'textEntityTypeUrl':
      return normalizeHref(slice) || undefined;
    case 'textEntityTypeEmailAddress':
      return `mailto:${slice}`;
    case 'textEntityTypePhoneNumber':
      return `tel:${slice.replace(/\s+/g, '')}`;
    case 'textEntityTypeMention':
      return `https://t.me/${slice.replace(/^@/, '')}`;
    case 'textEntityTypeMentionName':
      return `tg://user?id=${entity.type.user_id}`;
    default:
      return undefined;
  }
}

const segments = computed<Segment[]>(() => {
  const text = String(props.text ?? '');
  if (!text) return [];

  const links = detectInlineEntities(text, props.entities ?? [])
    .map((e) => {
      const start = Math.max(0, Math.min(text.length, e.offset));
      const end = Math.max(0, Math.min(text.length, e.offset + e.length));
      return { start, end, href: end > start ? entityHref(e, text.slice(start, end)) : undefined };
    })
    .filter((l): l is { start: number; end: number; href: string } => !!l.href && l.end > l.start)
    .sort((a, b) => a.start - b.start);

  const out: Segment[] = [];
  let cursor = 0;
  for (const link of links) {
    // 区间重叠时以先出现的实体为准（detectInlineEntities 已按 offset 排序）
    if (link.start < cursor) continue;
    if (link.start > cursor) out.push({ text: text.slice(cursor, link.start) });
    out.push({ text: text.slice(link.start, link.end), href: link.href });
    cursor = link.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor) });
  return out;
});

async function openHref(raw: string) {
  const href = normalizeHref(raw);
  if (!href) return;
  if (href.startsWith('https://t.me/') || href.startsWith('https://proxy.t.me/') || href.startsWith('tg://')) {
    await resolveInternalLink(href, router);
    return;
  }
  try {
    await confirmAndOpenExternalLink(href);
  } catch {
    /* 用户取消，不跳转 */
  }
}
</script>

<style scoped>
.linkify-text__link {
  color: #3b82f6;
  cursor: pointer;
  overflow-wrap: break-word;
  text-decoration: none;
}

.linkify-text__link:hover {
  text-decoration: underline;
}

:global(.dark) .linkify-text__link {
  color: #60a5fa;
}
</style>
