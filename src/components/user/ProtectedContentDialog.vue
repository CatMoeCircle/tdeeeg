<template>
    <Teleport to="body">
        <Transition name="pc-fade">
            <div v-if="modelValue" class="fixed inset-0 z-200 flex items-center justify-center p-4"
                @mousedown.self="onClose">
                <div class="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>
                <div
                    class="relative w-full max-w-md max-h-[min(640px,88vh)] flex flex-col rounded-2xl bg-white dark:bg-[#1f2937] shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <!-- 顶部：标题 / 关闭 -->
                    <div class="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
                        <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 flex-1">
                            {{ enable ? t('lng_enable_sharing') : t('lng_disable_sharing_title') }}
                        </h3>
                        <button type="button" :aria-label="t('lng_close')"
                            class="w-8 h-8 flex items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            @click="onClose">
                            <XIcon class="w-4.5 h-4.5" />
                        </button>
                    </div>

                    <div class="flex-1 overflow-y-auto custom-scrollbar">
                        <!-- 动画横幅 -->
                        <div
                            class="bg-gray-100 dark:bg-gray-800/80 px-6 py-6 flex items-center justify-center border-b border-gray-200 dark:border-gray-700">
                            <div class="w-28 h-28 flex items-center justify-center overflow-hidden">
                                <TgsPlayer v-if="tgsData" :data="tgsData" :loop="true" :autoplay="true" :size="112" />
                            </div>
                        </div>

                        <div v-if="!enable" class="px-5 py-4 space-y-4">
                            <div v-for="row in rows" :key="row.title" class="flex items-start gap-4">
                                <component :is="row.icon" class="w-6 h-6 mt-0.5 shrink-0 text-gray-800 dark:text-gray-200" />
                                <div class="min-w-0">
                                    <p class="text-[15px] font-medium text-gray-900 dark:text-gray-100">{{ t(row.title) }}</p>
                                    <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{{ t(row.about) }}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 底部确认按钮 -->
                    <div class="px-5 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0">
                        <button type="button"
                            class="w-full py-2.5 rounded-full bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
                            :disabled="saving || chatId === undefined" @click="onConfirm">
                            {{ enable ? t('lng_enable_sharing') : t('lng_disable_sharing_button') }}
                        </button>
                    </div>
                </div>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { CameraOff, Ban, Save, X as XIcon } from 'lucide-vue-next';
import { useI18n } from 'vue-i18n';
import { toast } from '../../utils/toast';
import { tdlibSend } from '../../utils/tdlib';
import TgsPlayer from '../common/TgsPlayer.vue';

/** enable=true 表示「启用分享」（has_protected_content=false），false 表示「禁用分享」 */
const props = defineProps<{ modelValue: boolean; chatId?: number; enable: boolean }>();
const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    (e: 'changed', hasProtectedContent: boolean): void;
}>();

const { t } = useI18n();

// ponytail: 手掌 TGS 暂用现有动画占位，后续替换为正式素材
const TGS_URL = new URL('../../assets/animations/TwoFactorSetupIntro.tgs', import.meta.url).href;

const tgsData = ref<Uint8Array | null>(null);
const saving = ref(false);

const rows = [
    { icon: CameraOff, title: 'lng_disable_sharing_no_screenshots', about: 'lng_disable_sharing_no_screenshots_about' },
    { icon: Ban, title: 'lng_disable_sharing_no_forwarding', about: 'lng_disable_sharing_no_forwarding_about' },
    { icon: Save, title: 'lng_disable_sharing_no_saving', about: 'lng_disable_sharing_no_saving_about' },
];

async function loadTgs() {
    if (tgsData.value) return;
    try {
        const resp = await fetch(TGS_URL);
        tgsData.value = new Uint8Array(await resp.arrayBuffer());
    } catch (e) {
        console.error('ProtectedContentDialog: failed to load tgs:', e);
    }
}

function onClose() {
    emit('update:modelValue', false);
}

async function onConfirm() {
    if (saving.value || props.chatId === undefined) return;
    saving.value = true;
    const hasProtectedContent = !props.enable;
    try {
        await tdlibSend({
            _: 'toggleChatHasProtectedContent',
            chat_id: props.chatId,
            has_protected_content: hasProtectedContent,
        });
        toast.success(t(props.enable ? 'lng_enable_sharing_toast' : 'lng_disable_sharing_toast'));
        emit('changed', hasProtectedContent);
        onClose();
    } catch (e: any) {
        toast.error(e?.message || t('privacy.operationFailed'));
    } finally {
        saving.value = false;
    }
}

watch(
    () => props.modelValue,
    (visible) => {
        if (visible) void loadTgs();
    },
    { immediate: true },
);
</script>

<style scoped>
.pc-fade-enter-active,
.pc-fade-leave-active {
    transition: opacity 0.15s ease;
}

.pc-fade-enter-from,
.pc-fade-leave-to {
    opacity: 0;
}
</style>
