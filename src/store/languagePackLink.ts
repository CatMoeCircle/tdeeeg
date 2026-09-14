import { ref } from "vue";
import type { languagePackInfo } from "tdlib-types";
import { tdlibSend } from "../utils/tdlib";

/**
 * 「t.me/setlanguage/xxx 添加语言包」弹窗全局状态。
 * 消息中点击官方语言包链接时，解析出 language_pack_id 并 showLanguagePackDialog，
 * 由挂载在 App.vue 的 LanguagePackConfirm.vue 渲染确认框。
 */
export const pendingPack = ref<languagePackInfo | null>(null);
export const pendingPackId = ref<string>("");
export const visible = ref(false);
export const loading = ref(false);
export const loadError = ref<string | null>(null);

let onResolve: ((value: "add" | "cancel") => void) | null = null;

/**
 * 拉取语言包信息并弹出「是否添加本语言包」确认框。
 * @param packId t.me/setlanguage/<packId> 中的标识
 */
export function showLanguagePackDialog(packId: string): Promise<"add" | "cancel"> {
    return new Promise<"add" | "cancel">((resolve) => {
        pendingPackId.value = packId;
        pendingPack.value = null;
        loadError.value = null;
        loading.value = true;
        visible.value = true;
        onResolve = resolve;

        void tdlibSend({ _: "getLanguagePackInfo", language_pack_id: packId })
            .then((info) => {
                if (!visible.value || pendingPackId.value !== packId) return;
                pendingPack.value = info;
                loading.value = false;
            })
            .catch((e: any) => {
                if (!visible.value || pendingPackId.value !== packId) return;
                loadError.value = e?.message || String(e);
                loading.value = false;
            });
    });
}

/** 用户确认添加/切换语言包 */
export function confirmAddLanguagePack() {
    visible.value = false;
    onResolve?.("add");
    onResolve = null;
}

/** 取消 */
export function cancelAddLanguagePack() {
    visible.value = false;
    onResolve?.("cancel");
    onResolve = null;
    pendingPack.value = null;
    pendingPackId.value = "";
}
