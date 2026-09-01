# tdgram

> ⚠️ **本项目功能尚未完善，处于积极开发阶段。** 多数核心功能已实现但可能存在不稳定或缺失的部分，欢迎试用并提交 Issue。

基于 [Tauri 2](https://v2.tauri.app/) + [Vue 3](https://vuejs.org/) + [TDLib](https://core.telegram.org/tdlib) 构建的 Telegram 桌面客户端，由 AI Agent 工具辅助完成全部开发工作。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Tauri 2 (Rust) |
| 前端框架 | Vue 3 + TypeScript + Vite |
| Telegram 协议 | TDLib (通过 Rust FFI) |

## 推荐 IDE

- [VS Code](https://code.visualstudio.com/) + [Vue - Official](https://marketplace.visualstudio.com/items?itemName=Vue.volar) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## 开发环境准备

### 1. TDLib

需要将编译好的 TDLib 动态库放入 `src-tauri/bin` 目录：

| 平台 | 文件 |
|------|------|
| Windows | `tdjson.dll` |
| macOS | `libtdjson.dylib` |
| Linux | `libtdjson.so` |

当前推荐 TDLib 版本 1.8.66

### 2. 环境变量

在项目 `src-tauri` 目录创建 `.env` 文件，填入你的 Telegram API 凭据：

```env
TG_API_ID=123456
TG_API_HASH=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

可在 [my.telegram.org](https://my.telegram.org/) 申请获取。

### 3. 安装依赖

支持 npm、pnpm 或 bun (推荐)：

```bash
bun install
```

## 构建与调试

### 开发模式

```bash
bun run tauri dev
```

### 构建生产包

```bash
bun run tauri build
```

### 仅前端构建检查 (不编译 Rust)

```bash
# TypeScript 类型检查
bunx vue-tsc --noEmit

# Vite 构建
bunx vite build
```

### Rust 编译检查

```bash
cd src-tauri && cargo check
```

---

## 当前完成的功能进度

### 核心聊天
- [x] 登录流程 (手机号 + 验证码 + 两步验证密码)
- [x] 聊天列表 (分组、排序、搜索、归档)
- [x] 消息发送与接收 (文本、图片、视频、文件、音频、贴纸)
- [x] 消息右键菜单 (回复、转发、复制、删除、置顶)
- [x] 消息实体渲染(加粗、斜体、链接、代码块、引用、自定义 Emoji)
- [x] 表情管理器 (贴纸,emoji,gif)
- [x] 相册消息
- [x] 富文本消息 (`messageRichMessage`)
- [x] 转发选择器
- [x] 消息多选操作
- [x] 消息翻译
- [ ] 全部翻译按钮
- [ ] 消息回应
- [ ] 语音/视频通话
- [ ] 消息编辑
- [ ] 草稿消息同步
- [ ] 消息搜索
- [ ] 更多消息类型支持 (投票、位置分享等)

### 媒体与文件
- [x] 全局媒体查看器 (图片/视频/相册浏览)
- [x] 视频边下边播 (流式传输)
- [x] 自动下载设置 (按对话类型、文件大小控制)
- [x] 下载管理器 (Rust 持久化，实时进度)
- [x] GIF/贴纸动画 (TGS Lottie + WebP/WebM)
- [ ] 故事
- [ ] 故事播放器


### 社交与互动
- [x] 个人资料页 (并未完善)
- [x] 联系人列表
- [x] 频道/群组/话题模式(List)
- [ ] 话题模式(Tabs)
- [ ] 群组/频道管理操作 (创建、编辑、成员管理)
- [ ] 礼物展示
- [ ] 礼物购买与赠送
- [ ] Telegram Premium 功能展示
- [ ] 全局搜索框
- [ ] Premium 状态修改

### 设置
- [x] 个人资料编辑
- [x] 隐私设置编辑
- [x] 自动下载设置
- [x] 存储位置修改
- [x] 代理设置
- [x] 登录设备查看
- [x] 自定义 API ID/API HASH
- [ ] 通知设置
- [ ] 分组文件夹管理
- [ ] 多账号支持
- [ ] 主题自定义
- [ ] 国际化多语言支持语言

---

## 项目结构

```
src/
├── assets/              # 静态资源 (CSS、贴纸动画)
├── components/          # UI 组件
│   ├── audio/           # 音乐播放器
│   ├── chat/            # 聊天相关 (ChatDetail、消息内容、头像)
│   ├── common/          # 通用组件
│   ├── contextMenu/     # 右键菜单系统
│   ├── downloads/       # 下载管理器
│   ├── layout/          # 布局组件
│   └── settings/        # 设置小组件
├── composables/         # Vue 组合式函数
├── directives/          # 自定义指令 (平滑滚轮、右键菜单)
├── locales/             # 国际化翻译文件
├── router/              # 路由配置
├── store/               # Pinia 状态管理
├── types/               # TypeScript 类型定义
├── utils/               # 工具函数
└── views/               # 路由页面 (auth/home/settings/user)
src-tauri/
├── src/
│   ├── lib.rs           # Tauri 插件初始化
│   ├── main.rs          # 应用入口
│   ├── tdlib.rs         # TDLib FFI 封装
│   ├── chat_store.rs    # 聊天数据缓存 (Rust 端)
│   ├── download_store.rs# 下载持久化
│   └── media_stream.rs  # 视频流式传输
└── bin/                 # TDLib 动态库
```

---

## 开发说明

本项目全程使用 AI Agent 辅助开发，主要工具：

- **GitHub Copilot**
- **Codex**
- **Claude Cli**

开发流程：
1. 明确功能需求与技术方案
2. AI 辅助生成代码
3. `vue-tsc --noEmit` 类型检查
4. `cargo check` Rust 编译检查
5. `bun run tauri dev` 运行验证

---

## License

NU General Public License v3.0