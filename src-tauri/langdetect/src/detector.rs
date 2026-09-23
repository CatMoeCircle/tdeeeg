//! High-level language detection on top of [`Runner`].

use std::path::Path;

use crate::error::{Error, Result};
use crate::runtime::Runner;

/// A candidate language and its probability.
#[derive(Debug, Clone, PartialEq)]
pub struct Detection {
    /// BCP-47 style language code as published by the model's `labels.txt`.
    pub language: String,
    /// Softmax score in `[0, 1]`.
    pub score: f32,
}

/// A loaded language detector: the model, its interpreter and its labels.
pub struct Detector {
    runner: Runner,
    labels: Vec<String>,
}

impl Detector {
    /// Loads the model from disk.
    pub fn from_model_path(path: impl AsRef<Path>) -> Result<Self> {
        let bytes = std::fs::read(path)?;
        Self::from_model_bytes(bytes)
    }

    /// Loads the model from an in-memory `.tflite` buffer, which is kept alive
    /// for as long as the detector lives.
    pub fn from_model_bytes(bytes: Vec<u8>) -> Result<Self> {
        let labels = labels_from_model(&bytes)?;
        let runner = Runner::new(bytes)?;

        if labels.len() != runner.language_count() {
            return Err(Error::Model(format!(
                "the model emits {} scores but its labels.txt lists {} languages",
                runner.language_count(),
                labels.len()
            )));
        }
        Ok(Self { runner, labels })
    }

    /// All languages, sorted by descending score.
    pub fn detect(&self, text: &str) -> Result<Vec<Detection>> {
        let scores = self.runner.detect(text)?;
        let mut detections: Vec<Detection> = self
            .labels
            .iter()
            .zip(scores)
            .map(|(language, score)| Detection {
                language: language.clone(),
                score,
            })
            .collect();
        detections.sort_by(|a, b| b.score.total_cmp(&a.score));
        Ok(detections)
    }

    /// The single most likely language.
    pub fn detect_top(&self, text: &str) -> Result<Detection> {
        self.detect(text)?
            .into_iter()
            .next()
            .ok_or_else(|| Error::Model("the model produced no scores".into()))
    }

    /// Number of languages the model can distinguish.
    pub fn language_count(&self) -> usize {
        self.labels.len()
    }
}

impl std::fmt::Debug for Detector {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Detector")
            .field("languages", &self.labels.len())
            .finish()
    }
}

/// Reads the language list the model carries in its appended ZIP archive.
fn labels_from_model(bytes: &[u8]) -> Result<Vec<String>> {
    let labels = edgefirst_tflite::archive::labels(bytes).map_err(|e| {
        Error::Model(format!(
            "the model has no readable `labels.txt` in its embedded archive: {e}"
        ))
    })?;
    if labels.is_empty() {
        return Err(Error::Model("the model's `labels.txt` is empty".into()));
    }
    Ok(labels)
}
