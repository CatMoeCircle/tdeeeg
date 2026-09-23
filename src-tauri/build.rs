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

    // 语言识别：把 vendored TFLite 运行时同步到 src-tauri/bin，
    // 保证 bundle.resources=["./bin/*"] 打包时一定带上（CI 干净检出也能打）。
    stage_tflite_to_bin();

    if let Ok(entries) = std::fs::read_dir(bin_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map_or(false, |ext| ext == "dll") {
                if let Some(file_name) = path.file_name() {
                    let dest = dest_bin_dir.join(file_name);
                    let _ = std::fs::copy(&path, &dest);
                    println!("Copied {:?} to {:?}", path, dest);
                }
            }
        }
    }
}

/// 从 langdetect/vendor 拷贝 TFLite 动态库到 bin/（已存在且同大小则跳过）。
fn stage_tflite_to_bin() {
    const LIB: &str = "tensorflowlite_c.dll";
    let vendor = std::path::Path::new("langdetect").join("vendor").join(LIB);
    if !vendor.is_file() {
        // 非 Windows 或未附带 vendor 时跳过；运行期仍可走 TFLITE_LIBRARY_PATH
        println!("cargo:warning={} missing; language detect needs it at runtime", vendor.display());
        return;
    }
    let dest = std::path::Path::new("bin").join(LIB);
    if let Ok(meta) = dest.metadata() {
        if let Ok(src_meta) = vendor.metadata() {
            if meta.len() == src_meta.len() {
                return;
            }
        }
    }
    if let Err(e) = std::fs::copy(&vendor, &dest) {
        println!("cargo:warning=failed to stage {LIB} into bin/: {e}");
    } else {
        println!("cargo:warning=staged {LIB} into src-tauri/bin/");
    }
}
