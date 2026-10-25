/**
 * 分组标签总开关：TDLib option `chat_folder_tags_enabled`。
 * 打开后会员才能在对话卡片底部看到分组标签（颜色在分组设置里选）。
 */
import { ref } from 'vue';
import { tdlibSend } from '../utils/tdlib';
import { onTdlibUpdate } from './tdlibBus';

export const folderTagsEnabled = ref(false);

let initialized = false;

/** 读取初值并订阅 updateOption（幂等，多处调用只生效一次） */
export async function initFolderTags(): Promise<void> {
    if (initialized) return;
    initialized = true;

    onTdlibUpdate('option', (u) => {
        if (u._ !== 'updateOption') return;
        const update = u as { name?: string; value?: { _?: string; value?: boolean } };
        if (update.name !== 'chat_folder_tags_enabled') return;
        if (update.value?._ === 'optionValueBoolean') folderTagsEnabled.value = !!update.value.value;
    });

    try {
        const res = await tdlibSend({ _: 'getOption', name: 'chat_folder_tags_enabled' } as any) as any;
        if (res?._ === 'optionValueBoolean') folderTagsEnabled.value = !!res.value;
    } catch {
        // option 未就绪时保持关闭
    }
}

/** 切换开关；事件本身也会回写，这里先落本地值让 UI 立即响应 */
export async function setFolderTagsEnabled(value: boolean): Promise<void> {
    await tdlibSend({ _: 'toggleChatFolderTags', are_tags_enabled: value } as any);
    folderTagsEnabled.value = value;
}
