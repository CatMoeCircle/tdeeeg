//! Copies the vendored TFLite runtime next to the built executable.
//!
//! `Runner` looks for `tensorflowlite_c.dll` beside the executable, so staging
//! it there at build time makes `cargo run` and a copied `target/<profile>`
//! directory both work without any environment setup.

use std::path::{Path, PathBuf};

const LIBRARY: &str = "tensorflowlite_c.dll";

fn main() {
    println!("cargo:rerun-if-changed=vendor/{LIBRARY}");

    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "windows" {
        return;
    }

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let source = manifest_dir.join("vendor").join(LIBRARY);
    if !source.is_file() {
        println!(
            "cargo:warning=vendor/{LIBRARY} is missing; the tool will need {LIBRARY} \
             to be provided at run time"
        );
        return;
    }

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR"));
    // target/<profile>/build/<pkg>-<hash>/out
    let Some(profile_dir) = out_dir.ancestors().nth(3) else {
        return;
    };

    for destination in destinations(profile_dir) {
        if let Err(error) = copy_if_changed(&source, &destination) {
            println!(
                "cargo:warning=could not stage {LIBRARY} at {}: {error}",
                destination.display()
            );
        }
    }
}

/// The executable lives in `target/<profile>/` for binaries, and one level
/// deeper for example/test targets, so cover both.
fn destinations(profile_dir: &Path) -> Vec<PathBuf> {
    vec![
        profile_dir.join(LIBRARY),
        profile_dir.join("examples").join(LIBRARY),
        profile_dir.join("deps").join(LIBRARY),
    ]
}

fn copy_if_changed(source: &Path, destination: &Path) -> std::io::Result<()> {
    let source_len = source.metadata()?.len();
    if let Ok(existing) = destination.metadata() {
        if existing.len() == source_len && existing.modified().ok() >= source.metadata().ok().and_then(|m| m.modified().ok()) {
            return Ok(());
        }
    }
    if let Some(parent) = destination.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::copy(source, destination)?;
    Ok(())
}
