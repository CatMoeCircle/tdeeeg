fn main() {
    dotenv::dotenv().ok();

    let api_id = std::env::var("TG_API_ID").expect("缺少 TG_API_ID，请在 .env 中配置");
    let api_hash = std::env::var("TG_API_HASH").expect("缺少 TG_API_HASH，请在 .env 中配置");

    println!("cargo:rustc-env=TG_API_ID={}", api_id);
    println!("cargo:rustc-env=TG_API_HASH={}", api_hash);

    tauri_build::build();

    let bin_dir = "bin";
    let out_dir = std::env::var("OUT_DIR").unwrap();

    let target_dir = std::path::Path::new(&out_dir).ancestors().nth(3).unwrap();
    let dest_bin_dir = target_dir.join("bin");
    let _ = std::fs::create_dir_all(&dest_bin_dir);

    // 语言识别：把 TFLite 运行时同步到 src-tauri/bin，
    // 保证 bundle.resources=["./bin/*"] 打包时一定带上（CI 干净检出也能打）。
    stage_tflite_to_bin(std::path::Path::new(&out_dir));

    if let Ok(entries) = std::fs::read_dir(bin_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let is_lib = path.extension().map_or(false, |ext| {
                ext == "dll" || ext == "so" || ext == "dylib"
            });
            if is_lib {
                if let Some(file_name) = path.file_name() {
                    let dest = dest_bin_dir.join(file_name);
                    let _ = std::fs::copy(&path, &dest);
                    println!("Copied {:?} to {:?}", path, dest);
                }
            }
        }
    }
}

/// 当前平台的 TFLite C API 动态库文件名。
fn tflite_lib_name() -> &'static str {
    match std::env::var("CARGO_CFG_TARGET_OS").as_deref() {
        Ok("windows") => "tensorflowlite_c.dll",
        Ok("macos") => "libtensorflowlite_c.dylib",
        _ => "libtensorflowlite_c.so",
    }
}

/// 把 TFLite 动态库拷进 `src-tauri/bin/`，供 `bundle.resources` 打包。
///
/// 来源按优先级：
/// 1. `langdetect/vendor/<lib>` — Windows 离线缓存 / 手动放置
/// 2. `target/langdetect-tflite/<lib>` — langdetect 构建脚本的下载缓存（Linux/macOS）
/// 3. `target/<profile>/<lib>` — langdetect 构建脚本已铺到二进制旁的副本
fn stage_tflite_to_bin(out_dir: &std::path::Path) {
    let lib = tflite_lib_name();
    let mut sources = vec![std::path::PathBuf::from("langdetect/vendor").join(lib)];

    // out = target/<profile>/build/<pkg>-<hash>/out
    if let Some(profile_dir) = out_dir.ancestors().nth(3) {
        sources.push(profile_dir.join(lib));
        if let Some(target_dir) = out_dir.ancestors().nth(4) {
            sources.push(target_dir.join("langdetect-tflite").join(lib));
        }
    }

    let Some(source) = sources.iter().find(|p| p.is_file()) else {
        println!(
            "cargo:warning=TFLite runtime {lib} not found in vendor/ or build cache; \
             language detect needs it at runtime (set TFLITE_LIBRARY_PATH or rebuild)"
        );
        return;
    };

    let dest = std::path::Path::new("bin").join(lib);
    if let Ok(meta) = dest.metadata() {
        if let Ok(src_meta) = source.metadata() {
            if meta.len() == src_meta.len() {
                return;
            }
        }
    }
    if let Err(e) = std::fs::copy(source, &dest) {
        println!("cargo:warning=failed to stage {lib} into bin/: {e}");
    } else {
        println!(
            "cargo:warning=staged {lib} into src-tauri/bin/ from {}",
            source.display()
        );
    }
}
