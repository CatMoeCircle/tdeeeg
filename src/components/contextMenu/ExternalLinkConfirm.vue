<template>
    <Teleport to="body">
        <Transition name="elc-fade">
            <div v-if="visible"
                class="fixed inset-0 z-9998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="cancel">
                <div
                    class="w-90 max-w-[90vw] rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 标题 -->
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200">
                            {{ t('link.openExternalTitle') }}
                        </h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="cancel">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 内容：显示点击时的原始地址（保留 IDN 原文，不显示 punycode），混用字母系统时高亮可疑字符 -->
                    <div class="px-4 py-4">
                        <div class="flex items-start gap-3">
                            <div
                                class="w-10 h-10 shrink-0 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 dark:text-gray-300">
                                <GlobeIcon class="w-5 h-5" />
                            </div>
                            <div class="min-w-0">
                                <p class="text-sm text-gray-500 dark:text-gray-400">
                                    {{ t('link.openExternalMessage') }}
                                </p>
                                <!-- 显示点击时看到的原始地址（IDN 保留原文，不显示 punycode），混用字母系统时高亮可疑字符 -->
                                <p class="text-sm font-semibold text-gray-800 dark:text-gray-200 break-all mt-0.5">
                                    <span v-for="(part, i) in addressParts" :key="i" :class="part.suspicious
                                        ? 'text-red-500 underline decoration-red-400 decoration-wavy dark:text-red-400'
                                        : ''">{{ part.text }}</span>
                                </p>
                                <!-- 与官方一致：地址混用了不同字母系统时，在高亮字符下方给出说明 -->
                                <p v-if="hasSuspiciousChars"
                                    class="mt-2 flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                                    <AlertTriangleIcon class="w-3.5 h-3.5 shrink-0 mt-px" />
                                    <span class="leading-relaxed">{{ t('lng_open_link_suspicious_chars') }}</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- 底部按钮 -->
                    <div
                        class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                        <BaseButton type="button" @click="cancel" variant="ghost" size="sm">
                            {{ t('link.openExternalCancel') }}
                        </BaseButton>
                        <BaseButton type="button" @click="confirm" variant="primary" size="sm">
                            {{ t('link.openExternalConfirm') }}
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
import { XIcon, GlobeIcon, AlertTriangle as AlertTriangleIcon } from "lucide-vue-next";
import { visible, pendingUrl, confirmOpenLink, cancelExternalLink } from "../../store/session/externalLink";
import BaseButton from "../ui/button/BaseButton.vue";

const { t } = useI18n();

/** 地址里出现的文字系统，仅关心与拉丁字母容易混淆的几类 */
type LetterScript = "latin" | "cyrillic" | "greek" | "other";

/** 单个字符属于哪种文字系统（非字母返回 null：数字、点、连字符、端口等不参与判断） */
function letterScript(ch: string): LetterScript | null {
    if (!/\p{L}/u.test(ch)) return null;
    if (/\p{Script=Latin}/u.test(ch)) return "latin";
    if (/\p{Script=Cyrillic}/u.test(ch)) return "cyrillic";
    if (/\p{Script=Greek}/u.test(ch)) return "greek";
    return "other";
}

/**
 * 单个字符是否属于「可疑字符」：
 * - ASCII 一律正常（字母、数字、标点都是地址的其余部分）
 * - 非 ASCII 字母：只有与地址字母系统一致才正常（纯 IDN 不误报）
 * - 其余非 ASCII 字符都算可疑（别的字母表、以及 ∕ 这类同形标点）
 */
function isSuspiciousChar(ch: string, base: LetterScript): boolean {
    if (/^[\x00-\x7F]$/.test(ch)) return false;
    const script = letterScript(ch);
    return !script || script !== base;
}

/**
 * 找到原始地址中 host 的区间。
 * 不能用 new URL().host：它会把 IDN 转成 punycode（pаypal.com → xn--pypal-4ve.com），
 * 那样就看不到、也标不出消息里实际显示的可疑字符了。
 */
function findHostRange(raw: string): { start: number; end: number } | null {
    const url = raw.trim();
    if (!url) return null;
    // mailto: / tel: 没有 host
    if (/^(?:mailto|tel):/i.test(url)) return null;

    const scheme = /^[a-z][a-z0-9+.-]*:\/\//i.exec(url);
    const authorityStart = scheme ? scheme[0].length : 0;
    const rest = url.slice(authorityStart);
    const stop = rest.search(/[/?#]/);
    const authority = stop === -1 ? rest : rest.slice(0, stop);
    if (!authority) return null;

    // 去掉 userinfo（user:pass@host）
    const at = authority.lastIndexOf("@");
    const hostPort = at >= 0 ? authority.slice(at + 1) : authority;
    // IPv6 字面量不做文字系统判断
    if (hostPort.startsWith("[")) return null;
    // 去掉端口
    const port = /:\d*$/.exec(hostPort);
    const host = port ? hostPort.slice(0, port.index) : hostPort;
    if (!host) return null;

    const start = authorityStart + (at >= 0 ? at + 1 : 0);
    return { start, end: start + host.length };
}

interface AddressPart {
    text: string;
    suspicious: boolean;
}

/**
 * 地址「应该」用哪种字母系统：以 TLD 为准。
 * - `.com` / `.cn` 这类 ASCII 后缀 → 拉丁
 * - `.рф` / `.中国` 这类非 ASCII 后缀 → 该后缀的文字系统（合法 IDN 不误报）
 */
function expectedScript(url: string): LetterScript | null {
    const range = findHostRange(url);
    if (!range) return null;
    const host = url.slice(range.start, range.end);
    const tld = host.slice(host.lastIndexOf(".") + 1);
    if (/^[a-z]+$/i.test(tld)) return "latin";
    for (const ch of Array.from(tld)) {
        const script = letterScript(ch);
        if (script) return script;
    }
    // IP / 无后缀：按拉丁处理
    return "latin";
}

/**
 * 原始地址按「可疑 / 正常」切段，模板逐段渲染并标红可疑字符。
 * 与官方一致：整条地址（域名、路径、查询、锚点）都检查，ASCII 字母、数字、标点都算「地址的其余部分」，
 * 不属于该地址字母系统的非 ASCII 字母才是可疑字符
 * （如同形字 pаypal.com 里的西里尔 а、路径 /resources/新OA使用教程 里的中文）。
 */
const addressParts = computed<AddressPart[]>(() => {
    const url = pendingUrl.value.trim();
    if (!url) return [];

    const base = expectedScript(url);
    if (!base) return [{ text: url, suspicious: false }];

    const parts: AddressPart[] = [];
    const push = (text: string, suspicious: boolean) => {
        if (!text) return;
        const last = parts[parts.length - 1];
        if (last && last.suspicious === suspicious) last.text += text;
        else parts.push({ text, suspicious });
    };

    // 整条地址都检查（含 ? / # 之后的查询与锚点）
    for (const ch of url) {
        push(ch, isSuspiciousChar(ch, base));
    }
    return parts;
});

const hasSuspiciousChars = computed(() => addressParts.value.some((part) => part.suspicious));

function confirm() {
    confirmOpenLink();
}

function cancel() {
    cancelExternalLink();
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
