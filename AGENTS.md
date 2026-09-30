# AGENTS.md

Guidance for AI coding agents working on **tdeeeg** (tdgram) — a Telegram desktop client.

## Project overview

| Layer | Technology |
|------|------------|
| Desktop | Tauri 2 (Rust) |
| UI | Vue 3 + TypeScript + Vite + Tailwind CSS 4 |
| Design system | TDesign (`tdesign-vue-next`) |
| State | Pinia |
| i18n | `vue-i18n` |
| Protocol | TDLib via Rust FFI |

The project is under active development and largely AI-assisted. Prefer small, verifiable changes over large speculative refactors.

## Commands

Package manager: **bun** (npm/pnpm also work).

```bash
# Install
bun install

# Dev app (needs TDLib + .env, see below)
bun run tauri dev

# Frontend typecheck + build (no Rust)
bunx vue-tsc --noEmit
bunx vite build
bun run build

# Rust compile check
cd src-tauri && cargo check

# Production packaging
bun run tauri:compile
bun run tauri:build:all   # default + offline WebView2 packages
```

**Verification workflow for code changes:**

1. Frontend-only: `bunx vue-tsc --noEmit`
2. Rust-side: `cd src-tauri && cargo check`
3. If behavior needs runtime proof: `bun run tauri dev`

When **reviewing or checking code** (read-only analysis, PR review, “does this look correct”), **do not run build/package commands** — no `bun run build`, `vite build`, `tauri build`, `tauri:compile`, or `tauri:build:all`. Use typecheck / `cargo check` / reading code / chrome-devtools instead. Full builds are for packaging, not for code inspection.

## Debugging the app

When runtime UI debugging is needed, prefer the configured **chrome-devtools** tools (page inspect, console, network, screenshot, evaluate script, click/fill) over ad-hoc shell workarounds.

- Use it for frontend behavior, layout, console errors, network requests from the webview, and interaction flows.
- Still run `vue-tsc` / `cargo check` when the change touches TS/Rust types or FFI — chrome-devtools alone is not enough.
- For Tauri-specific native side (TDLib FFI, plugins), inspect Rust logs and capabilities; chrome-devtools only covers the webview/UI layer.

## Prerequisites

- **TDLib** dynamic library in `src-tauri/bin/`:
  - Windows: `tdjson.dll`
  - macOS: `libtdjson.dylib`
  - Linux: `libtdjson.so`
  - Recommended version: `1.8.66`
- **`src-tauri/.env`** (never commit secrets):

```env
TG_API_ID=...
TG_API_HASH=...
```

API credentials come from [my.telegram.org](https://my.telegram.org/). If `.env` or TDLib is missing, do not invent credentials or replace TDLib with a mock unless the user asks.

## Layout

```
src/
  assets/        # CSS, sticker animations
  components/    # UI (chat/, layout/, settings/, downloads/, …)
  composables/
  directives/
  locales/       # en.json, zh-CN.json, zh-TW.json
  router/
  store/         # Pinia stores
  types/
  utils/
  views/         # Route pages
src-tauri/
  src/           # lib.rs, main.rs, tdlib.rs, chat_store.rs, download_store.rs, media_stream.rs
  bin/           # TDLib dylibs
  capabilities/  # Tauri capabilities
scripts/         # One-off / maintenance scripts (esp. i18n patches)
```

Prefer the existing layer: put logic in `composables/` or `store/`, UI in `components/`, TDLib / OS integration in `src-tauri/src/`.

## Conventions

### TypeScript / Vue

- Strict TS; avoid `any` unless unavoidable at a TDLib boundary.
- Vite auto-imports TDesign components and APIs — generated types live in `src/auto-imports.d.ts` and `src/components.d.ts`. Do not hand-edit those files.
- Custom Vite quirks that must stay:
  - `.tgs` is included via `assetsInclude`
  - `tlottie` is excluded from dep pre-bundling
  - Dev server port is fixed at `1420`

### i18n

- User-facing strings go through `vue-i18n`, not hardcoded UI copy.
- Locales: `src/locales/en.json`, `zh-CN.json`, `zh-TW.json`. Keep keys in sync across locales.
- Do not change the generic `zh` alias to `zh-CN` mapping without checking imports.
- `scripts/` contains many one-off i18n audit/patch helpers. Prefer a focused edit to locale JSON + code over a new throwaway script unless the change is bulk-migration scale.

### TDLib / Tauri

- All Telegram calls go through the existing Rust FFI wrapper (`src-tauri/src/tdlib.rs` and related modules). Do not open raw TDLib from JS.
- Chat/download persistence and media streaming live on the Rust side — keep that boundary when adding features.
- Respect `src-tauri/capabilities/` when adding plugins or filesystem/network usage.

### UI

- TDesign + Tailwind; follow patterns already used in `src/components/chat/` and `src/components/layout/`.
- Avoid introducing a second UI kit or styling system.

## Hard rules

- Never commit real `TG_API_ID` / `TG_API_HASH`, session data, or private chat payloads.
- When checking/reviewing code, do **not** use build commands (`vite build`, `bun run build`, `tauri build`, packaging scripts). Prefer `vue-tsc --noEmit`, `cargo check`, and code reading.
- Do not rewrite the whole app or “modernize” the stack mid-task.
- Do not invent Telegram features not grounded in TDLib or existing code paths.
- Prefer fixing the root cause over adding compatibility shims.
- Match existing code style in the file you edit; do not reformat unrelated code.
- Windows is the primary verified platform; macOS/Linux may lack build support — note gaps instead of faking them.

## When stuck

1. Search the codebase for an analogous flow (e.g. message send → `src-tauri/src/tdlib.rs` + chat UI).
2. Typecheck / `cargo check` the change.
3. If TDLib APIs are unclear, document the uncertainty rather than guessing FFI signatures.
