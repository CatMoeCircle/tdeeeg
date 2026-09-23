//! Language detection with a MediaPipe LangID TFLite model, driven through
//! [`edgefirst_tflite`].
//!
//! ```no_run
//! use langdetect::Detector;
//!
//! let detector = Detector::from_model_path("language_detector.tflite")?;
//! let top = detector.detect_top("Ceci est un texte en français.")?;
//! println!("{} {:.3}", top.language, top.score);
//! # Ok::<(), langdetect::Error>(())
//! ```

pub mod detector;
pub mod error;
pub mod ops;
pub mod runtime;
pub mod text;
pub mod unicode;

mod unicode_tables;

pub use detector::{Detection, Detector};
pub use error::{Error, Result};
pub use runtime::Runner;
