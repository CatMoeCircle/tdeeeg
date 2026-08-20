<template>
    <Teleport to="body">
        <Transition name="tm-fade">
            <div v-if="visible"
                class="fixed inset-0 z-998 flex items-center justify-center bg-black/40 backdrop-blur-sm"
                @mousedown.self="close">
                <div
                    class="w-130 max-w-[92vw] max-h-[85vh] flex flex-col rounded-2xl bg-white dark:bg-gray-800 shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                    <!-- 标题 -->
                    <div
                        class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                        <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                            <LanguagesIcon class="w-4 h-4 text-blue-500" />
                            翻译
                        </h3>
                        <button type="button"
                            class="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                            @click="close">
                            <XIcon class="w-4 h-4" />
                        </button>
                    </div>

                    <!-- 正文 -->
                    <div class="px-4 py-3 space-y-3 overflow-y-auto custom-scrollbar">
                        <!-- 语言选择行：翻译为 → 目标语言（下拉选择） -->
                        <div class="flex flex-wrap items-center gap-2 text-sm">
                            <span class="text-gray-500 dark:text-gray-400 whitespace-nowrap">翻译为</span>
                            <t-select class="z-999" v-model="targetLang" :options="targetOptions" :borderless="true"
                                filterable size="small" style="width: 220px" placeholder="请选择目标语言" />
                        </div>

                        <!-- 原文 -->
                        <div>
                            <div class="text-xs text-gray-400 dark:text-gray-500 mb-1">原文</div>
                            <div
                                class="max-h-40 overflow-y-auto custom-scrollbar rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap wrap-break-word">
                                {{ plainText }}
                            </div>
                        </div>

                        <!-- 翻译结果 -->
                        <div>
                            <div class="text-xs text-gray-400 dark:text-gray-500 mb-1">翻译</div>
                            <div v-if="translating"
                                class="flex items-center gap-2 rounded-lg border border-gray-100 dark:border-gray-700 px-3 py-3 text-sm text-gray-400 dark:text-gray-500">
                                <LoaderIndicator size="18" color="#6b7280" />
                                翻译中…
                            </div>
                            <div v-else-if="error"
                                class="rounded-lg border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-500 dark:text-red-400">
                                {{ error }}
                            </div>
                            <div v-else-if="translatedText"
                                class="max-h-60 overflow-y-auto custom-scrollbar rounded-lg border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 whitespace-pre-wrap wrap-break-word">
                                {{ translatedText }}
                            </div>
                        </div>
                    </div>

                    <!-- 底部按钮 -->
                    <div
                        class="px-4 py-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-3">
                        <button type="button" @click="copyResult" :disabled="!translatedText"
                            class="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1">
                            <CopyIcon class="w-4 h-4" />
                            复制译文
                        </button>
                        <button type="button" @click="close"
                            class="px-4 py-1.5 rounded-lg text-sm bg-blue-500 text-white hover:bg-blue-600">
                            关闭
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { XIcon, CopyIcon, Languages as LanguagesIcon } from "lucide-vue-next";
import { MessagePlugin } from "tdesign-vue-next";
import type { formattedText } from "tdlib-types";
import {
    translateVisible, translateRequest, hideTranslateDialog,
} from "../../store/translate";
import { tdlibSend } from "../../utils/tdlib";
import LoaderIndicator from "../common/LoaderIndicator";
import {
    DEFAULT_TRANSLATE_TARGET,
    TRANSLATE_TARGET_LANGUAGES,
} from "../../utils/translateLanguages";

const visible = translateVisible;
const req = translateRequest;

/** 当前目标语言 */
const targetLang = ref<string>(DEFAULT_TRANSLATE_TARGET);
const translatedText = ref("");
const translating = ref(false);
const error = ref("");

/** 下拉选项：显示名 + 语言码 */
const targetOptions = computed(() =>
    TRANSLATE_TARGET_LANGUAGES.map((l) => ({ label: `${l.label} (${l.code})`, value: l.code })),
);

const plainText = computed(() => req.value?.plainText ?? "");

/** 翻译请求序号：目标语言快速切换时丢弃过期结果 */
let translateSeq = 0;

async function doTranslate() {
    const request = req.value;
    if (!request || !targetLang.value) return;
    const seq = ++translateSeq;
    translating.value = true;
    error.value = "";
    try {
        const res = await tdlibSend({
            _: "translateText",
            text: request.text,
            to_language_code: targetLang.value,
        }) as formattedText;
        if (seq !== translateSeq) return; // 已切换目标语言，丢弃过期结果
        translatedText.value = res?.text ?? "";
        if (!translatedText.value) error.value = "翻译结果为空";
    } catch (e: any) {
        if (seq !== translateSeq) return;
        error.value = e?.message || "翻译失败，请稍后重试";
    } finally {
        if (seq === translateSeq) translating.value = false;
    }
}

/** 打开弹窗时：重置状态、按默认目标语言翻译 */
let openSeq = 0;
watch(visible, (open) => {
    if (open && req.value) {
        const seq = ++openSeq;
        targetLang.value = DEFAULT_TRANSLATE_TARGET;
        translatedText.value = "";
        error.value = "";
        if (seq === openSeq && visible.value) doTranslate();
    }
});

/** 切换目标语言时重新翻译 */
watch(targetLang, () => {
    if (visible.value) doTranslate();
});

function copyResult() {
    if (!translatedText.value) return;
    try {
        navigator.clipboard.writeText(translatedText.value);
        MessagePlugin.success("译文已复制");
    } catch {
        MessagePlugin.error("复制失败");
    }
}

function close() {
    hideTranslateDialog();
}

function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && visible.value) close();
}

onMounted(() => window.addEventListener("keydown", onKeydown));
onUnmounted(() => window.removeEventListener("keydown", onKeydown));
</script>

<style scoped>
.tm-fade-enter-active,
.tm-fade-leave-active {
    transition: opacity 0.18s ease;
}

.tm-fade-enter-from,
.tm-fade-leave-to {
    opacity: 0;
}
</style>
