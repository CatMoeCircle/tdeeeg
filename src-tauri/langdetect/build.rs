// Stages the prebuilt TFLite runtime (the C API shared library) for the target
// platform.
//
// Sources:
//
// * Windows x86_64 — a local cached library only (no network at build time).
//   Place `vendor/tensorflowlite_c.dll` in this crate. A known-good source is
//   the `ai-edge-litert` PyPI wheel's `libLiteRt.dll` (full classic TFLite C
//   API). The EdgeFirstAI `tflite-v2.19.0` Windows zip is a 64 KB stub with no
//   export table and must not be used.
// * Linux x86_64 / aarch64, macOS arm64 — downloaded at build time from the
//   EdgeFirstAI `tflite-rs` release tarballs. These export the classic C API in
//   full.
//
// Neither download source has a macOS x86_64 build; that target must provide
// its own library (see below).
//
// Overrides, all optional:
//
// * `vendor/<library file name>` in this crate — used verbatim instead of
//   downloading (offline builds, self-compiled runtime; required on Windows).
// * `TFLITE_VERSION` — EdgeFirstAI release version (default 2.19.0).
//
// The library is verified after staging (every symbol this crate calls must be
// present) and then copied next to the built binaries, where `Runner` looks
// for it first.

use std::path::{Path, PathBuf};
use std::{env, fs};

/// Symbols this crate calls through the TFLite C API. An artifact missing any
/// of them is rejected at build time with a clear message.
const REQUIRED_SYMBOLS: &[&str] = &[
    "TfLiteModelCreate",
    "TfLiteModelDelete",
    "TfLiteInterpreterOptionsCreate",
    "TfLiteInterpreterOptionsDelete",
    "TfLiteInterpreterOptionsSetNumThreads",
    "TfLiteInterpreterOptionsAddCustomOp",
    "TfLiteInterpreterCreate",
    "TfLiteInterpreterDelete",
    "TfLiteInterpreterAllocateTensors",
    "TfLiteInterpreterInvoke",
    "TfLiteInterpreterGetOutputTensor",
    "TfLiteTensorCopyToBuffer",
];

fn main() {
    println!("cargo:rerun-if-changed=vendor");
    println!("cargo:rerun-if-env-changed=TFLITE_VERSION");

    let os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap_or_default();
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));

    // Cache under target/ (not OUT_DIR) so `cargo build` / `clippy` / `test`
    // share one download instead of each fetching their own copy.
    // out = target/<profile>/build/<pkg>-<hash>/out
    let cache_root = out_dir
        .ancestors()
        .nth(4)
        .map(|target| target.join("langdetect-tflite"))
        .unwrap_or_else(|| out_dir.clone());

    let library_name = plan_filename(&os);
    let seeded = manifest_dir.join("vendor").join(library_name);

    // Windows: cached vendor library only — never download at build time.
    if os == "windows" {
        if !seeded.is_file() {
            panic!(
                "Windows builds need a local TFLite runtime at {} (no build-time \
                 download). Copy `libLiteRt.dll` from the `ai-edge-litert` PyPI \
                 wheel to that path (it exports the full classic TFLite C API), \
                 or set TFLITE_LIBRARY_PATH at run time to a compatible library.",
                seeded.display()
            );
        }
        let cached = cache_root.join(library_name);
        fs::create_dir_all(&cache_root).expect("create cache dir");
        stage_from_vendor(&seeded, &cached, library_name);
        verify_symbols(&cached);
        stage_next_to_binaries(&out_dir, &cached);
        return;
    }

    // Other platforms: download at build time unless vendor/ already has one.
    let Some(plan) = Plan::for_target(&os, &arch) else {
        println!(
            "cargo:warning=no prebuilt TFLite runtime for {os}-{arch}; \
             place one at vendor/{library_name} or set TFLITE_LIBRARY_PATH at run time"
        );
        return;
    };

    let cached = cache_root.join(&plan.library_name);
    let stamp = cache_root.join(format!("tflite-source-{}.stamp", plan.id()));
    fs::create_dir_all(&cache_root).expect("create cache dir");

    if seeded.is_file() {
        stage_from_vendor(&seeded, &cached, &plan.library_name);
        write_stamp(&stamp, &format!("vendor:{}", seeded.display()));
    } else if !(cached.is_file() && stamp_is_current(&stamp, plan.source_url())) {
        let download_dir = cache_root.join("download");
        fs::create_dir_all(&download_dir).expect("create download dir");
        println!("cargo:warning=downloading TFLite runtime from {}", plan.source_url());

        let archive = download_dir.join(&plan.archive_name);
        download(plan.source_url(), &archive);

        let library = plan.extract(&archive);
        verify_symbols(&library);
        if fs::rename(&library, &cached).is_err() {
            // rename can fail across devices
            fs::copy(&library, &cached).unwrap_or_else(|e| {
                panic!("cannot cache {}: {e}", library.display());
            });
            let _ = fs::remove_file(&library);
        }
        write_stamp(&stamp, plan.source_url());
    }

    verify_symbols(&cached);
    stage_next_to_binaries(&out_dir, &cached);
}

/// Copies a `vendor/` library into the shared cache.
fn stage_from_vendor(seeded: &Path, cached: &Path, library_name: &str) {
    fs::copy(seeded, cached).unwrap_or_else(|e| {
        panic!(
            "cannot stage vendor/{library_name} from {}: {e}",
            seeded.display()
        );
    });
}

/// Which artifact to fetch for a target, and how to unpack it.
struct Plan {
    /// Library file name on the target platform.
    library_name: String,
    /// Archive file name as it appears in the source.
    archive_name: String,
    /// Download URL of the archive.
    url: String,
}

impl Plan {
    fn for_target(os: &str, arch: &str) -> Option<Self> {
        match (os, arch) {
            ("linux", "x86_64" | "aarch64") => {
                let version = env::var("TFLITE_VERSION").unwrap_or_else(|_| "2.19.0".into());
                let artifact = format!("libtensorflowlite_c-{arch}-linux.tar.gz");
                Some(Self {
                    library_name: "libtensorflowlite_c.so".into(),
                    archive_name: artifact.clone(),
                    url: format!(
                        "https://github.com/EdgeFirstAI/tflite-rs/releases/download/tflite-v{version}/{artifact}"
                    ),
                })
            }
            ("macos", "aarch64") => {
                let version = env::var("TFLITE_VERSION").unwrap_or_else(|_| "2.19.0".into());
                Some(Self {
                    library_name: "libtensorflowlite_c.dylib".into(),
                    archive_name: "libtensorflowlite_c-macos-arm64.tar.gz".into(),
                    url: format!(
                        "https://github.com/EdgeFirstAI/tflite-rs/releases/download/tflite-v{version}/libtensorflowlite_c-macos-arm64.tar.gz"
                    ),
                })
            }
            _ => None,
        }
    }

    fn id(&self) -> String {
        self.archive_name
            .trim_end_matches(".tar.gz")
            .trim_end_matches(".whl")
            .to_string()
    }

    fn source_url(&self) -> &str {
        &self.url
    }

    /// Unpacks the archive and returns the path of the library file inside it.
    fn extract(&self, archive: &Path) -> PathBuf {
        let dir = archive.parent().expect("archive dir").join("extracted");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).expect("create extract dir");

        let file = fs::File::open(archive).expect("open tar.gz");
        let gz = flate2::read::GzDecoder::new(file);
        let mut tar = tar::Archive::new(gz);
        tar.unpack(&dir).expect("extract tar.gz");

        find_member(&dir, &self.library_name).expect("library present in archive")
    }
}

/// Library file name for a target, used for vendor/ lookup and the
/// unsupported-target message.
fn plan_filename(os: &str) -> &'static str {
    match os {
        "windows" => "tensorflowlite_c.dll",
        "macos" => "libtensorflowlite_c.dylib",
        _ => "libtensorflowlite_c.so",
    }
}

/// Recursively finds `name` below `dir`.
fn find_member(dir: &Path, name: &str) -> Option<PathBuf> {
    for entry in fs::read_dir(dir).ok()? {
        let entry = entry.ok()?;
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_member(&path, name) {
                return Some(found);
            }
        } else if path.file_name().and_then(|n| n.to_str()) == Some(name) {
            return Some(path);
        }
    }
    None
}

/// Rejects artifacts that do not export every symbol this crate calls.
///
/// Symbol names always appear as plaintext in a shared library's export table
/// (PE export names, ELF `.dynstr`, Mach-O string table), so a byte scan is
/// format-agnostic and cheap.
fn verify_symbols(library: &Path) {
    let bytes = fs::read(library).expect("read library");
    let missing: Vec<&str> = REQUIRED_SYMBOLS
        .iter()
        .copied()
        .filter(|symbol| !bytes.windows(symbol.len()).any(|w| w == symbol.as_bytes()))
        .collect();
    assert!(
        missing.is_empty(),
        "{} does not export the TFLite C API symbols this crate needs: {missing:?}. \
         The upstream artifact may have changed; install a compatible build into \
         vendor/ and rebuild.",
        library.display()
    );
}

/// Copies the library next to every binary of the profile being built, where
/// `Runner` looks first.
fn stage_next_to_binaries(out_dir: &Path, library: &Path) {
    // target/<profile>/build/<pkg>-<hash>/out
    let Some(profile_dir) = out_dir.ancestors().nth(3) else {
        return;
    };
    let name = library.file_name().expect("library file name");
    for dir in [profile_dir.to_path_buf(), profile_dir.join("deps"), profile_dir.join("examples")] {
        let destination = dir.join(name);
        let same_size = fs::metadata(&destination).ok().map(|m| m.len())
            == fs::metadata(library).ok().map(|m| m.len());
        if destination.is_file() && same_size {
            continue;
        }
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).expect("create staging dir");
        }
        fs::copy(library, &destination).expect("stage library next to binaries");
    }
}

fn stamp_is_current(stamp: &Path, expected: &str) -> bool {
    fs::read_to_string(stamp).map(|s| s.trim() == expected).unwrap_or(false)
}

fn write_stamp(stamp: &Path, content: &str) {
    fs::write(stamp, content).expect("write stamp");
}

fn download(url: &str, destination: &Path) {
    for attempt in 1..=3 {
        match ureq::get(url).call() {
            Ok(response) => {
                let mut reader = response.into_body().into_reader();
                let mut file = fs::File::create(destination).expect("create download file");
                std::io::copy(&mut reader, &mut file).expect("write download file");
                return;
            }
            Err(error) if attempt < 3 => {
                println!("cargo:warning=retrying {url} ({error})");
                std::thread::sleep(std::time::Duration::from_secs(2 * attempt));
            }
            Err(error) => panic!("cannot download {url}: {error}"),
        }
    }
    unreachable!()
}
