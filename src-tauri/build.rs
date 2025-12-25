fn main() {
    dotenv::dotenv().ok();
    if let Ok(api_id) = std::env::var("TG_API_ID") {
        println!("cargo:rustc-env=TG_API_ID={}", api_id);
    }
    if let Ok(api_hash) = std::env::var("TG_API_HASH") {
        println!("cargo:rustc-env=TG_API_HASH={}", api_hash);
    }

    tauri_build::build();

    let bin_dir = "bin";
    let out_dir = std::env::var("OUT_DIR").unwrap();

    let target_dir = std::path::Path::new(&out_dir).ancestors().nth(3).unwrap();
    let dest_bin_dir = target_dir.join("bin");
    let _ = std::fs::create_dir_all(&dest_bin_dir);

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
