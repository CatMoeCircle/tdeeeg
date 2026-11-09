<template>
    <Teleport to="body">
        <Transition name="elc-fade">
            <div v-if="visible"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="cancel">
                <div
                    class="w-90 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 与官方 ConfirmBox 一致：文案 + 地址 +（必要时）可疑字符说明，不设独立标题栏 -->
                    <div class="px-5 pt-4 pb-2">
                        <p class="text-sm text-gray-800 dark:text-gray-200">
                            {{ t('lng_open_this_link') }}
                        </p>

                        <!-- 地址：深色底框；链接可拖选，右侧图标单独负责复制 -->
                        <div
                            class="mt-3 flex items-start gap-2 rounded-lg border border-black/5 bg-gray-100/80 px-2.5 py-2 dark:border-white/10 dark:bg-black/25">
                            <p class="min-w-0 flex-1 text-sm text-gray-800 dark:text-gray-200 break-all select-text">
                                <span v-for="(part, i) in addressParts" :key="i" :class="part.emphasis === 'marked'
                                    ? 'font-semibold text-red-500 dark:text-red-400'
                                    : part.emphasis === 'bold'
                                        ? 'font-semibold'
                                        : ''">{{ part.text }}</span>
                            </p>
                            <button type="button" :title="t('lng_context_copy_link')"
                                class="shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-gray-500 hover:bg-black/5 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-200 transition-colors"
                                @click="copyAddress">
                                <CopyIcon class="w-4 h-4" />
                            </button>
                        </div>

                        <!-- 官方：lng_open_link_suspicious_chars，紧跟地址下方单独一行 -->
                        <p v-if="marked" class="mt-2 text-sm text-gray-800 dark:text-gray-200">
                            {{ t('lng_open_link_suspicious_chars') }}
                        </p>
                    </div>

                    <!-- 底部按钮：官方 lng_cancel / lng_open_link -->
                    <div class="px-4 pb-3 flex items-center justify-end gap-3">
                        <BaseButton type="button" @click="cancel" variant="ghost" size="sm">
                            {{ t('lng_cancel') }}
                        </BaseButton>
                        <BaseButton type="button" @click="confirm" variant="primary" size="sm">
                            {{ t('lng_open_link') }}
                        </BaseButton>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from "vue";
import { useI18n } from "vue-i18n";
import { Copy as CopyIcon } from "lucide-vue-next";
import { visible, pendingUrl, confirmOpenLink, cancelExternalLink } from "../../store/session/externalLink";
import BaseButton from "../ui/button/BaseButton.vue";
import { toast } from "../../utils/ui/toast";

const { t } = useI18n();

/** 与 Qt 的 QChar::script() 对齐：只区分同形字相关的几类，其余归 common / other */
type CharScript = "latin" | "cyrillic" | "greek" | "other" | "common" | "unknown";

function charScript(ch: string): CharScript {
    if (!/\p{L}/u.test(ch)) return "common";
    if (/\p{Script=Latin}/u.test(ch)) return "latin";
    if (/\p{Script=Cyrillic}/u.test(ch)) return "cyrillic";
    if (/\p{Script=Greek}/u.test(ch)) return "greek";
    return "other";
}

const isAsciiLetter = (ch: string) => /^[A-Za-z]$/.test(ch);
const isAsciiDigitOrHyphen = (ch: string) => /^[0-9-]$/.test(ch);
const isAscii = (text: string) => /^[\x00-\x7F]*$/.test(text);
const isPlainAsciiLabel = (label: string) =>
    Array.from(label).every((ch) => isAsciiLetter(ch) || isAsciiDigitOrHyphen(ch));

/** 官方 DomainLabelScript：没有字母 → common；混用多种字母系统 → unknown */
function domainLabelScript(label: string): CharScript {
    let result: CharScript = "common";
    for (const ch of label) {
        if (isAsciiDigitOrHyphen(ch)) continue;
        const script = charScript(ch);
        if (script === "common" || script === "unknown") return "unknown";
        if (result !== "common" && result !== script) return "unknown";
        result = script;
    }
    return result;
}

/** 官方 IsVisibleCodePoint：可打印、非组合符号、非空白（零宽/格式字符属于 Cf，不可见） */
function isVisibleCodePoint(ch: string): boolean {
    if (/\p{C}/u.test(ch) || /\p{M}/u.test(ch) || /\s/u.test(ch)) return false;
    return true;
}

interface TextRange {
    start: number;
    end: number;
}

/**
 * 移植官方 UrlClickHandler::SuspiciousRanges（tdesktop 7.3.5 / lib_ui c3f7343）。
 *
 * 官方只检查正则 `^((https?|s?ftp)://)?([^/#\:\?]+)([/#\:\?]|$)` 捕获的「域名段」，
 * 该段遇到 ASCII 的 / # : ? 就结束。所以像
 * https://foobar.ac.cn∕resources∕新OA使用教程@v50.zip 这种用 U+2215「∕」冒充斜杠的地址，
 * 整串都会被当成域名段来扫，路径里的同形斜杠、中文、@ 都会被标出；普通 ASCII 斜杠地址的
 * 路径/查询不参与判断。
 */
function suspiciousRanges(url: string): TextRange[] {
    const match = /^((?:https?|s?ftp):\/\/)?([^\/#:?]+)([\/#:?]|$)/i.exec(url);
    if (!match) return [];
    const domain = match[2];
    const domainStart = match[0].length - (match[3]?.length ?? 0) - domain.length;

    // TLD 是 ASCII 字母？（如 .com / .cn）
    const latinTld = /^(.*)\.[a-zA-Z]+$/.test(domain);
    if (!latinTld && isAscii(domain)) return [];

    const tld = domain.slice(domain.lastIndexOf(".") + 1);
    const script = latinTld ? "latin" : domainLabelScript(tld);
    const asciiOnly = script === "latin" || script === "common" || script === "unknown";
    const allowed = (ch: string) =>
        isAsciiDigitOrHyphen(ch) || (asciiOnly ? isAsciiLetter(ch) : charScript(ch) === script);

    const ranges: TextRange[] = [];
    let offset = 0;
    for (const label of domain.split(".")) {
        const labelStart = offset;
        offset += label.length + 1;
        // 非拉丁 TLD 时，纯 ASCII 标签不参与判断
        if (!asciiOnly && isPlainAsciiLabel(label)) continue;

        let index = 0;
        for (const ch of label) {
            if (!allowed(ch)) {
                const start = domainStart + labelStart + index;
                const end = start + ch.length;
                const last = ranges[ranges.length - 1];
                if (last && last.end === start) last.end = end;
                else ranges.push({ start, end });
            }
            index += ch.length;
        }
    }
    return ranges;
}

/** 官方 BoldDomainInUrl：取域名区间（www. 前缀不计入加粗范围） */
function domainRange(url: string): TextRange | null {
    if (/^(?:mailto|tel):/i.test(url)) return null;
    const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(url);
    const authorityStart = scheme ? scheme[0].length : 0;
    const rest = url.slice(authorityStart);
    const stop = rest.search(/[/?#]/);
    const authority = stop === -1 ? rest : rest.slice(0, stop);
    if (!authority) return null;
    // 去掉 userinfo 与端口
    const at = authority.lastIndexOf("@");
    const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
    if (hostPort.startsWith("[")) return null;
    const port = /:\d*$/.exec(hostPort);
    const host = port ? hostPort.slice(0, port.index) : hostPort;
    if (!host) return null;

    const www = host.startsWith("www.") ? 4 : 0;
    const start = authorityStart + (at >= 0 ? at + 1 : 0) + www;
    return { start, end: start + host.length - www };
}

interface AddressPart {
    text: string;
    emphasis: "none" | "bold" | "marked";
}

function buildParts(url: string, range: TextRange | null, emphasis: AddressPart["emphasis"]): AddressPart[] {
    if (!range) return [{ text: url, emphasis: "none" }];
    const parts: AddressPart[] = [];
    if (range.start > 0) parts.push({ text: url.slice(0, range.start), emphasis: "none" });
    parts.push({ text: url.slice(range.start, range.end), emphasis });
    if (range.end < url.length) parts.push({ text: url.slice(range.end), emphasis: "none" });
    return parts;
}

/**
 * 地址渲染分段，对应官方 HiddenUrlClickHandler::Open 里的三种情况：
 * 1. 有可疑字符且都可见 → 标红加粗这些字符（不再加粗域名）
 * 2. 没有可疑字符 → 只加粗域名
 * 3. 可疑字符里有不可见的（零宽/空白等）→ 改显示 percent-encoded 地址、不标注
 */
const analyzed = computed<{ marked: boolean; parts: AddressPart[] }>(() => {
    const raw = pendingUrl.value.trim();
    if (!raw) return { marked: false, parts: [] };

    const ranges = suspiciousRanges(raw);
    const allVisible = ranges.every((range) =>
        Array.from(raw.slice(range.start, range.end)).every(isVisibleCodePoint),
    );

    if (!allVisible) {
        let encoded = raw;
        try {
            encoded = encodeURI(raw);
        } catch {
            // 编码失败时保留原文
        }
        return { marked: false, parts: buildParts(encoded, domainRange(encoded), "bold") };
    }
    if (!ranges.length) {
        return { marked: false, parts: buildParts(raw, domainRange(raw), "bold") };
    }

    const parts: AddressPart[] = [];
    let position = 0;
    for (const range of ranges) {
        if (range.start > position) {
            parts.push({ text: raw.slice(position, range.start), emphasis: "none" });
        }
        parts.push({ text: raw.slice(range.start, range.end), emphasis: "marked" });
        position = range.end;
    }
    if (position < raw.length) {
        parts.push({ text: raw.slice(position), emphasis: "none" });
    }
    return { marked: true, parts };
});

const addressParts = computed(() => analyzed.value.parts);
const marked = computed(() => analyzed.value.marked);

function confirm() {
    confirmOpenLink();
}

function cancel() {
    cancelExternalLink();
}

/** 复制整条链接（深色底框右侧的图标按钮） */
async function copyAddress() {
    const url = pendingUrl.value.trim();
    if (!url) return;
    try {
        await navigator.clipboard.writeText(url);
        await toast.success({ content: t("context.copied"), placement: "top-right" });
    } catch (e) {
        console.error("Copy link failed:", e);
    }
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && visible.value) {
        cancel();
    }
}

onMounted(() => {
    window.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
    window.removeEventListener("keydown", onKeydown);
});
</script>

<style scoped>
.elc-fade-enter-active,
.elc-fade-leave-active {
    transition: opacity 0.18s ease;
}

.elc-fade-enter-from,
.elc-fade-leave-to {
    opacity: 0;
}
</style>
