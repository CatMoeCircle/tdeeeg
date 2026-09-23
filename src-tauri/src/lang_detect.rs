//! 本地语言识别：MediaPipe LangID TFLite 模型（vendored `langdetect`）。
//!
//! 前端通过 `detect_language` / `detect_languages` 取语言代码与置信度。

use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use langdetect::Detector;
use serde::Serialize;

/// 模型内嵌字节（源文件：`public/language_detector.tflite`）。
const MODEL_BYTES: &[u8] = include_bytes!("../../public/language_detector.tflite");

const TFLITE_LIB_NAMES: &[&str] = &[
    "tensorflowlite_c.dll",
    "libtensorflowlite_c.so",
    "libtensorflowlite_c.dylib",
];

/// 单条识别结果：语言代码 + 置信度。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageDetection {
    /// BCP-47 风格语言码（模型 `labels.txt`），如 `en` / `zh` / `fr`
    pub language: String,
    /// Softmax 置信度，`[0, 1]`
    pub confidence: f32,
}

/// `Detector` 含 TFLite 裸指针，本身不是 `Send`。识别经全局互斥串行访问，
/// 这里只声明可在线程间移动所有权。
struct SendDetector(Detector);

unsafe impl Send for SendDetector {}

static DETECTOR: OnceLock<Mutex<Option<SendDetector>>> = OnceLock::new();

fn detector() -> Result<std::sync::MutexGuard<'static, Option<SendDetector>>, String> {
    let cell = DETECTOR.get_or_init(|| Mutex::new(None));
    let mut guard = cell.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        prepare_tflite_library();
        let model = load_model_bytes()?;
        let det = Detector::from_model_bytes(model).map_err(|e| e.to_string())?;
        *guard = Some(SendDetector(det));
    }
    Ok(guard)
}

/// 运行时定位 TFLite 动态库并写入 `TFLITE_LIBRARY_PATH`（未设置时）。
fn prepare_tflite_library() {
    if std::env::var_os("TFLITE_LIBRARY_PATH").is_some() {
        return;
    }
    for name in TFLITE_LIB_NAMES {
        for dir in runtime_search_dirs() {
            let candidate = dir.join(name);
            if candidate.is_file() {
                std::env::set_var("TFLITE_LIBRARY_PATH", &candidate);
                return;
            }
        }
    }
}

fn runtime_search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            dirs.push(dir.to_path_buf());
            dirs.push(dir.join("bin"));
            dirs.push(dir.join("Resources"));
        }
    }
    if let Ok(resource) = std::env::var("TURI_RESOURCE_DIR") {
        let dir = PathBuf::from(resource);
        dirs.push(dir.clone());
        dirs.push(dir.join("bin"));
    }
    dirs
}

/// 优先读磁盘上的模型（便于不重编替换），否则用编译期内嵌字节。
fn load_model_bytes() -> Result<Vec<u8>, String> {
    const FILE: &str = "language_detector.tflite";
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            candidates.push(dir.join(FILE));
            candidates.push(dir.join("bin").join(FILE));
            candidates.push(dir.join("Resources").join(FILE));
        }
    }
    if let Ok(resource) = std::env::var("TURI_RESOURCE_DIR") {
        let dir = PathBuf::from(resource);
        candidates.push(dir.join(FILE));
        candidates.push(dir.join("bin").join(FILE));
    }
    // 开发态：仓库 public/ 目录（相对 src-tauri 可执行文件的常见布局）
    candidates.push(PathBuf::from("../../public").join(FILE));
    candidates.push(PathBuf::from("public").join(FILE));

    for path in candidates {
        if path.is_file() {
            return std::fs::read(&path).map_err(|e| format!("读取模型失败 {}: {e}", path.display()));
        }
    }
    Ok(MODEL_BYTES.to_vec())
}

fn detect_raw(text: &str, top_k: usize) -> Result<Vec<LanguageDetection>, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("文本为空".into());
    }
    let guard = detector()?;
    let det = guard.as_ref().ok_or("识别器未初始化")?;
    let all = det.0.detect(trimmed).map_err(|e| e.to_string())?;
    let limit = if top_k == 0 {
        all.len()
    } else {
        top_k.min(all.len())
    };
    Ok(all
        .into_iter()
        .take(limit)
        .map(|d| LanguageDetection {
            language: d.language,
            confidence: d.score,
        })
        .collect())
}

/// 识别文本语言，返回最可能的语言代码与置信度。
#[tauri::command]
pub async fn detect_language(text: String) -> Result<LanguageDetection, String> {
    tauri::async_runtime::spawn_blocking(move || {
        detect_raw(&text, 1)?
            .into_iter()
            .next()
            .ok_or_else(|| "模型没有给出结果".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// 识别文本语言，按置信度降序返回前 `top_k` 个候选（缺省 3；0 表示全部）。
#[tauri::command]
pub async fn detect_languages(
    text: String,
    top_k: Option<usize>,
) -> Result<Vec<LanguageDetection>, String> {
    tauri::async_runtime::spawn_blocking(move || detect_raw(&text, top_k.unwrap_or(3)))
        .await
        .map_err(|e| e.to_string())?
}

// ==================== 翻译过滤：消息排除 + 目标语言不译 ====================

/// 翻译门控结果（供前端「全部翻译 / 自动翻译」跳过消息）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShouldTranslateDecision {
    /// 是否应翻译该文本
    pub should_translate: bool,
    /// 识别到的源语言码（未识别时为空串）
    pub detected_language: String,
    /// 识别置信度，`[0, 1]`；未识别为 0
    pub confidence: f32,
    /// `ok` | `empty` | `same_as_target` | `excluded` | `undetected`
    pub reason: String,
}

/// 取语言码主标签：`zh-CN` / `zh-Hans` / `zh_cn` → `zh`
fn base_lang(code: &str) -> &str {
    code.trim()
        .split(['-', '_'])
        .next()
        .unwrap_or(code.trim())
}

/// 语言码是否表示同一语种（精确或主标签相同）。
/// 例：`zh` ≡ `zh-CN` ≡ `zh-Hans`；`zh-CN` 与 `zh-TW` 主标签相同也视为同族。
fn lang_matches(a: &str, b: &str) -> bool {
    let a = a.trim();
    let b = b.trim();
    if a.is_empty() || b.is_empty() {
        return false;
    }
    let al = a.to_ascii_lowercase();
    let bl = b.to_ascii_lowercase();
    if al == bl {
        return true;
    }
    base_lang(&al) == base_lang(&bl)
}

fn decide_should_translate(
    text: &str,
    target_lang: &str,
    do_not_translate: &[String],
    min_confidence: Option<f32>,
) -> Result<ShouldTranslateDecision, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Ok(ShouldTranslateDecision {
            should_translate: false,
            detected_language: String::new(),
            confidence: 0.0,
            reason: "empty".into(),
        });
    }

    let min_conf = min_confidence.unwrap_or(0.50);
    let top = detect_raw(trimmed, 1)?.into_iter().next();

    let Some(detected) = top else {
        return Ok(ShouldTranslateDecision {
            should_translate: !do_not_translate.iter().any(|c| lang_matches(c, "und")),
            detected_language: String::new(),
            confidence: 0.0,
            reason: "undetected".into(),
        });
    };

    let lang = detected.language.clone();
    let conf = detected.confidence;

    // 低置信度：视为无法识别。排除列表含 und 时跳过，否则仍尝试翻译
    if conf < min_conf {
        let skip = do_not_translate.iter().any(|c| lang_matches(c, "und") || lang_matches(c, &lang));
        return Ok(ShouldTranslateDecision {
            should_translate: !skip,
            detected_language: lang,
            confidence: conf,
            reason: if skip { "excluded".into() } else { "undetected".into() },
        });
    }

    // 消息排除：源语言命中 do_not_translate
    if do_not_translate.iter().any(|c| lang_matches(c, &lang)) {
        return Ok(ShouldTranslateDecision {
            should_translate: false,
            detected_language: lang,
            confidence: conf,
            reason: "excluded".into(),
        });
    }

    // 不翻译目标语言：原文已是目标语言
    if lang_matches(&lang, target_lang) {
        return Ok(ShouldTranslateDecision {
            should_translate: false,
            detected_language: lang,
            confidence: conf,
            reason: "same_as_target".into(),
        });
    }

    Ok(ShouldTranslateDecision {
        should_translate: true,
        detected_language: lang,
        confidence: conf,
        reason: "ok".into(),
    })
}

/// 判断文本是否需要翻译（语言检测驱动的消息排除 + 目标语言本身不译）。
///
/// - `do_not_translate`：源语言排除列表（命中则不译）
/// - `target_lang`：目标语言；原文已是该语言时不译
/// - `min_confidence`：低于该置信度视为无法识别（默认 0.5）
#[tauri::command]
pub async fn should_translate_text(
    text: String,
    target_lang: String,
    do_not_translate: Vec<String>,
    min_confidence: Option<f32>,
) -> Result<ShouldTranslateDecision, String> {
    tauri::async_runtime::spawn_blocking(move || {
        decide_should_translate(&text, &target_lang, &do_not_translate, min_confidence)
    })
    .await
    .map_err(|e| e.to_string())?
}
