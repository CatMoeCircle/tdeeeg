<template>
    <ModalDialog :model-value="modelValue" :title="t('lng_forum_create_topic')" @update:model-value="close">
        <div class="space-y-3">
            <div>
                <label class="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                    {{ t('lng_forum_topic_title') }}
                </label>
                <BaseInput ref="inputRef" v-model="name" type="text" :maxlength="NAME_MAX"
                    :placeholder="t('lng_forum_topic_title')" @keydown.enter.prevent="submit" />
                <div class="mt-0.5 flex justify-end">
                    <span class="text-[11px] leading-none tabular-nums text-gray-400">{{ name.length }}/{{ NAME_MAX }}</span>
                </div>
            </div>
            <p v-if="error" class="text-xs text-red-500 dark:text-red-400">{{ error }}</p>
        </div>
        <template #footer>
            <BaseButton variant="ghost" size="sm" @click="close">{{ t('lng_cancel') }}</BaseButton>
            <BaseButton variant="primary" size="sm" :disabled="!canSubmit" @click="submit">
                {{ t('lng_forum_create_topic') }}
            </BaseButton>
        </template>
    </ModalDialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { forumTopicInfo } from 'tdlib-types';
import ModalDialog from '../../ui/modal/ModalDialog.vue';
import BaseInput from '../../ui/input/BaseInput.vue';
import BaseButton from '../../ui/button/BaseButton.vue';
import { tdlibSend } from '../../../utils/session/tdlib';

const props = defineProps<{
    modelValue: boolean;
    chatId: number;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    created: [info: forumTopicInfo];
}>();

const { t } = useI18n();

/** createForumTopic 名称长度上限：1-128 字符 */
const NAME_MAX = 128;

const inputRef = ref<InstanceType<typeof BaseInput> | null>(null);
const name = ref('');
const error = ref('');
const submitting = ref(false);

const canSubmit = computed(() => !submitting.value && name.value.trim().length > 0);

watch(() => props.modelValue, async (open) => {
    if (!open) return;
    name.value = '';
    error.value = '';
    submitting.value = false;
    await nextTick();
    (inputRef.value?.$el as HTMLInputElement | undefined)?.focus();
});

function close() {
    if (submitting.value) return;
    emit('update:modelValue', false);
}

async function submit() {
    if (!canSubmit.value) return;
    submitting.value = true;
    error.value = '';
    try {
        const info = await tdlibSend({
            _: 'createForumTopic',
            chat_id: props.chatId,
            name: name.value.trim(),
        }) as forumTopicInfo;
        emit('update:modelValue', false);
        emit('created', info);
    } catch (e: any) {
        // 失败文案用 TDLib 官方词条，不往内置语言包新增 key
        error.value = e?.message || t('lng_attach_failed');
    } finally {
        submitting.value = false;
    }
}
</script>
