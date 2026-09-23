//! Error type shared by the detector, the runtime wrapper and the custom ops.

use std::fmt;

/// Alias used throughout the crate.
pub type Result<T> = std::result::Result<T, Error>;

/// Everything that can go wrong while loading the model or running inference.
#[derive(Debug)]
pub enum Error {
    /// A symbol was missing from the loaded TFLite shared library.
    MissingSymbol(&'static str),
    /// A TFLite C API call returned a non-OK status.
    Tflite(&'static str),
    /// Loading or reading the model file failed.
    Model(String),
    /// The model's tensors are not what this tool expects.
    Tensor(String),
    /// A custom op failed.
    Op(String),
    /// Filesystem access failed.
    Io(std::io::Error),
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingSymbol(symbol) => {
                write!(f, "the loaded TFLite library does not export `{symbol}`")
            }
            Self::Tflite(call) => write!(f, "`{call}` returned a non-OK status"),
            Self::Model(message) => write!(f, "model error: {message}"),
            Self::Tensor(message) => write!(f, "tensor error: {message}"),
            Self::Op(message) => write!(f, "custom op error: {message}"),
            Self::Io(source) => write!(f, "io error: {source}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(source) => Some(source),
            _ => None,
        }
    }
}

impl From<std::io::Error> for Error {
    fn from(source: std::io::Error) -> Self {
        Self::Io(source)
    }
}

impl From<edgefirst_tflite::Error> for Error {
    fn from(source: edgefirst_tflite::Error) -> Self {
        Self::Model(source.to_string())
    }
}
