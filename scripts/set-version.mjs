#!/usr/bin/env node
// 把发布版本号写进所有清单：package.json / src-tauri/tauri.conf.json /
// src-tauri/Cargo.toml / src-tauri/Cargo.lock。
//
// 版本号唯一来源是 git tag（如 v0.2.6、v0.3.0-beta.1），CI 在构建前调用：
//   node scripts/set-version.mjs v0.2.6
// 本地也可以手动对齐当前 tag：
//   bun run version:set v0.2.6
// 这样应用内版本、NSIS 安装包名 tdeeeg_<version>_<arch>-setup.exe 和 updater 的
// latest.json 都跟 tag 一致，不用再手工改三份清单。

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const fail = (message) => {
  console.error("set-version: " + message);
  process.exit(1);
};

const read = (rel) => readFileSync(join(root, rel), "utf8");
const write = (rel, content) => writeFileSync(join(root, rel), content);

/** 更新 JSON 的 version，保持仓库现有的两空格缩进与结尾换行 */
const stampJson = (rel, version) => {
  const raw = read(rel);
  const current = JSON.parse(raw).version;
  if (current === version) return false;
  // 只替换顶层 version 字段，保留原文件排版（整份 JSON 重排会制造无关 diff）
  const needle = '"version": "' + current + '"';
  if (!raw.includes(needle)) fail(rel + " 缺少顶层 version 字段");
  write(rel, raw.replace(needle, '"version": "' + version + '"'));
  return true;
};

/** 只改 [package] 段的 version，依赖项的 version 不动 */
const stampCargoToml = (rel, version) => {
  const raw = read(rel);
  const lines = raw.split(/\r?\n/);
  let inPackage = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (line.startsWith("[")) {
      inPackage = line === "[package]";
      continue;
    }
    if (inPackage && /^version\s*=/.test(line)) {
      const next = 'version = "' + version + '"';
      if (lines[i] === next) return false;
      lines[i] = next;
      write(rel, lines.join(raw.includes("\r\n") ? "\r\n" : "\n"));
      return true;
    }
  }
  return false;
};

/** Cargo.lock 里本包（name = "tdeeeg"）的 version */
const stampCargoLock = (rel, version) => {
  const raw = read(rel);
  const next = raw.replace(
    /(\[\[package\]\]\r?\nname = "tdeeeg"\r?\nversion = ")[^"]*(")/,
    "$1" + version + "$2",
  );
  if (next === raw) return false;
  write(rel, next);
  return true;
};

const rawVersion = process.argv.slice(2).find((arg) => !arg.startsWith("-"));
if (!rawVersion) fail("缺少版本号，用法: node scripts/set-version.mjs v0.2.6");

const version = rawVersion.trim().replace(/^v/i, "");
if (!SEMVER.test(version)) {
  fail("不是合法 semver: " + rawVersion + "（tag 应形如 v0.2.6 或 v0.3.0-beta.1）");
}

const touched = [];
if (stampJson("package.json", version)) touched.push("package.json");
if (stampJson("src-tauri/tauri.conf.json", version)) touched.push("src-tauri/tauri.conf.json");
if (stampCargoToml("src-tauri/Cargo.toml", version)) touched.push("src-tauri/Cargo.toml");
if (stampCargoLock("src-tauri/Cargo.lock", version)) touched.push("src-tauri/Cargo.lock");

console.log(
  "set-version: " + version + (touched.length ? " -> " + touched.join(", ") : " -> 已是最新，无需修改"),
);
