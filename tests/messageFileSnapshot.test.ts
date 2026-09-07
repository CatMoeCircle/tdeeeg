/**
 * 回归测试：媒体「下载完成后，消息内嵌 File 被就地更新；复制消息原始 JSON 时
 * 不再 hit 下载完成前的旧快照」。
 *
 * 对应修复：src/utils/messageFileSnapshot.ts 按 file.id 在 MessageContent 中就地更新 File，
 * 并接入 ChatDetail/index.vue 的 handleUpdate 'updateFile' 分支。
 *
 * 运行：bun test tests/messageFileSnapshot.test.ts （建议加 bun test 全局）
 * 说明：本测试在 tsconfig include(src/**) 之外，不参与 vue-tsc / build。
 * 工具源码只包含 import type，bun 运行时自动剥离，可在无 Tauri/Vue 环境跑纯逻辑。
 */
import { test, expect } from "bun:test";
import { applyTerminalFileToMessages, isTerminalFileUpdate } from "../src/utils/messageFileSnapshot";

function staleFile(id: number) {
    return {
        _: "file", id, size: 1000, expected_size: 1000,
        local: { path: "", can_be_downloaded: true, is_downloading_active: false, is_downloading_completed: false, download_offset: 0, downloaded_prefix_size: 0, downloaded_size: 0 },
        remote: { id: `r${id}`, unique_id: `u${id}`, is_uploading_active: false, is_uploading_completed: true, uploaded_size: 1000 },
    };
}
function completedFile(id: number, path: string) {
    return {
        _: "file", id, size: 1000, expected_size: 1000,
        local: { path, can_be_downloaded: true, is_downloading_active: false, is_downloading_completed: true, download_offset: 1000, downloaded_prefix_size: 0, downloaded_size: 1000 },
        remote: { id: `r${id}`, unique_id: `u${id}`, is_uploading_active: false, is_uploading_completed: true, uploaded_size: 1000 },
    };
}
function makeMessages() {
    const photoMsg = {
        id: 1, chat_id: 10,
        content: {
            _: "messagePhoto",
            photo: { _: "photo", has_stickers: false, sizes: [
                { _: "photoSize", type: "m", photo: staleFile(101), width: 320, height: 240 },
                { _: "photoSize", type: "x", photo: staleFile(102), width: 640, height: 480 },
            ]},
            caption: { text: "hi", entities: [] },
        },
    };
    const docMsg = {
        id: 2, chat_id: 10,
        content: {
            _: "messageDocument",
            document: { _: "document", file_name: "a.pdf", mime_type: "application/pdf",
                document: staleFile(201),
                thumbnail: { _: "thumbnail", width: 100, height: 100, format: { _: "thumbnailFormatJpeg" }, file: staleFile(202) } },
            caption: { text: "", entities: [] },
        },
    };
    return [photoMsg, docMsg] as any;
}

test("isTerminalFileUpdate 只接受“本地下载完成且带路径”", () => {
    expect(isTerminalFileUpdate(completedFile(1, "/tmp/a.jpg"))).toBe(true);
    const inflight = completedFile(1, "/tmp/a.jpg");
    inflight.local.is_downloading_completed = false;
    expect(isTerminalFileUpdate(inflight)).toBe(false);
});

test("按 file.id 就地更新匹配的消息内嵌 File 快照", () => {
    const msgs = makeMessages();
    const msgsArr = [msgs[0], msgs[1]] as any;
    applyTerminalFileToMessages(msgsArr, completedFile(102, "C:\\media\\img_x.jpg"));

    const large = msgsArr[0].content.photo.sizes[1].photo;
    const small = msgsArr[0].content.photo.sizes[0].photo;
    const docMain = msgsArr[1].content.document.document;
    expect(large.local.is_downloading_completed).toBe(true);
    expect(large.local.path).toBe("C:\\media\\img_x.jpg");
    expect(small.local.is_downloading_completed).toBe(false);
    expect(docMain.local.is_downloading_completed).toBe(false);
});

test("复制消息原始 JSON 会反映下载完成后的本地路径/完成标志（不再旧快照）", () => {
    const msgs = makeMessages();
    const msgsArr = [msgs[0], msgs[1]] as any;
    applyTerminalFileToMessages(msgsArr, completedFile(102, "C:\\media\\img_x.jpg"));
    const json = JSON.stringify(msgsArr[0], null, 2);
    expect(json).toContain("C:\\\\media\\\\img_x.jpg");
    expect(json).toContain('"is_downloading_completed": true');
});

test("进行中的纯进度 tick 被终态门控跳过（无写回）", () => {
    const msgs = makeMessages();
    const msgsArr = [msgs[0], msgs[1]] as any;
    const inflight = completedFile(102, "C:\\media\\img_x.jpg");
    inflight.local.is_downloading_completed = false;
    applyTerminalFileToMessages(msgsArr, inflight);
    expect(msgsArr[0].content.photo.sizes[1].photo.local.is_downloading_completed).toBe(false);
});

test("重复应用同一终态幂等且安全", () => {
    const msgs = makeMessages();
    const msgsArr = [msgs[0], msgs[1]] as any;
    applyTerminalFileToMessages(msgsArr, completedFile(102, "C:\\media\\img_x.jpg"));
    expect(() => applyTerminalFileToMessages(msgsArr, completedFile(102, "C:\\media\\img_x.jpg"))).not.toThrow();
    expect(msgsArr.length).toBe(2);
});
