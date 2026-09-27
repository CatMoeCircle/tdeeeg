//! Reimplementation of MediaPipe's `NGramHash` custom op.
//!
//! The op turns an input string into character-n-gram vocab indices: it
//! lower-cases (optionally), tokenises, hashes each n-gram with MurmurHash 2.0
//! and reduces the hash modulo a per-n-gram vocabulary size.
//!
//! The reference implementation declares its output to be a *dynamic* tensor of
//! shape `[1, num_ngrams, num_tokens]` and resizes it inside `Invoke`. The
//! TFLite C API offers no way to mark a tensor dynamic, so this implementation
//! instead fixes the shape to `[1, num_ngrams, max_splits]` in `Prepare` and
//! zero-fills the unused slots. That is behaviour-preserving: tokenisation never
//! emits more than `max_splits` tokens, hash-derived ids are always `>= 1`, and
//! the consumer (`KmeansEmbeddingLookup`) stops at the first `0`.

use std::ffi::c_void;
use std::os::raw::c_char;
use std::ptr;
use std::slice;

use edgefirst_tflite_sys::{TfLiteContext, TfLiteNode, TfLiteStatus};

use crate::error::{Error, Result};
use crate::ops::{
    node_tensor, report_error, resize_tensor, take_text, tensor_dims, KTFLITE_OK,
};
use crate::text;

/// `kDefaultMaxSplits` from the reference implementation.
const DEFAULT_MAX_SPLITS: usize = 128;

/// Name the model's operator code declares.
const OP_NAME: &str = "NGramHash";

/// The op's configuration, serialised into the model as a FlexBuffer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NgramHashParams {
    seed: u64,
    ngram_lengths: Vec<i32>,
    vocab_sizes: Vec<i32>,
    max_splits: usize,
    lowercase_input: bool,
}

impl NgramHashParams {
    fn from_custom_options(bytes: &[u8]) -> Result<Self> {
        let root = flexbuffers::Reader::get_root(bytes)
            .map_err(|e| Error::Op(format!("{OP_NAME}: unreadable custom options: {e}")))?;
        let map = root
            .get_map()
            .map_err(|e| Error::Op(format!("{OP_NAME}: custom options are not a map: {e}")))?;

        let seed = map
            .index("seed")
            .map_err(|e| Error::Op(format!("{OP_NAME}: missing `seed`: {e}")))?
            .as_u64();
        let ngram_lengths = int_vector(&map, "ngram_lengths")?;
        let vocab_sizes = int_vector(&map, "vocab_sizes")?;

        let max_splits = map
            .index("max_splits")
            .ok()
            .map(|reader| reader.as_i64())
            .filter(|value| *value > 0)
            .map(|value| value as usize)
            .unwrap_or(DEFAULT_MAX_SPLITS);
        let lowercase_input = map
            .index("lowercase_input")
            .ok()
            .map(|reader| reader.as_bool())
            .unwrap_or(true);

        if ngram_lengths.is_empty() || ngram_lengths.len() != vocab_sizes.len() {
            return Err(Error::Op(format!(
                "{OP_NAME}: `ngram_lengths` ({}) and `vocab_sizes` ({}) must be non-empty and of equal length",
                ngram_lengths.len(),
                vocab_sizes.len()
            )));
        }
        if vocab_sizes.iter().any(|size| *size <= 0) {
            return Err(Error::Op(format!("{OP_NAME}: `vocab_sizes` must be positive")));
        }

        Ok(Self {
            seed,
            ngram_lengths,
            vocab_sizes,
            max_splits,
            lowercase_input,
        })
    }

    /// Number of n-gram lengths, i.e. output rows.
    fn ngram_count(&self) -> usize {
        self.ngram_lengths.len()
    }
}

/// Reads a FlexBuffer integer vector, which the model stores as a typed vector.
fn int_vector(map: &flexbuffers::MapReader<&[u8]>, key: &str) -> Result<Vec<i32>> {
    let reader = map
        .index(key)
        .map_err(|e| Error::Op(format!("{OP_NAME}: missing `{key}`: {e}")))?;
    let vector = reader
        .get_vector()
        .map_err(|e| Error::Op(format!("{OP_NAME}: `{key}` is not a vector: {e}")))?;
    Ok(vector.iter().map(|element| element.as_i64() as i32).collect())
}

/// Per-node state created by `init`, freed by `free_op`.
fn params(node: *mut TfLiteNode) -> Option<&'static NgramHashParams> {
    let node_ref = unsafe { node.as_ref() }?;
    unsafe { (node_ref.user_data as *const NgramHashParams).as_ref() }
}

pub(crate) unsafe extern "C" fn init(
    _context: *mut TfLiteContext,
    buffer: *const c_char,
    length: usize,
) -> *mut c_void {
    let bytes = if buffer.is_null() || length == 0 {
        &[][..]
    } else {
        unsafe { slice::from_raw_parts(buffer as *const u8, length) }
    };
    match NgramHashParams::from_custom_options(bytes) {
        Ok(params) => Box::into_raw(Box::new(params)).cast::<c_void>(),
        Err(_) => {
            // `prepare`/`invoke` treat a null `user_data` as "not initialised"
            // and report the failure where a context is available.
            ptr::null_mut()
        }
    }
}

pub(crate) unsafe extern "C" fn free_op(
    _context: *mut TfLiteContext,
    data: *mut c_void,
) {
    if !data.is_null() {
        drop(unsafe { Box::from_raw(data as *mut NgramHashParams) });
    }
}

pub(crate) unsafe extern "C" fn prepare(
    context: *mut TfLiteContext,
    node: *mut TfLiteNode,
) -> TfLiteStatus {
    let Some(params) = params(node) else {
        unsafe { report_error(context, "NGramHash: op was not initialised") };
        return 1;
    };

    let output = unsafe { node_tensor(context, node, 0, false) };
    if output.is_null() {
        unsafe { report_error(context, "NGramHash: missing output tensor") };
        return 1;
    }

    // [1, num_ngrams, max_splits] — the inner stride has to be the tensor's own
    // last dimension, because `invoke` writes straight into this buffer.
    let dims = [1, params.ngram_count() as i32, params.max_splits as i32];
    if !unsafe { resize_tensor(context, output, &dims) } {
        unsafe { report_error(context, "NGramHash: cannot resize the output tensor") };
        return 1;
    }
    KTFLITE_OK
}

pub(crate) unsafe extern "C" fn invoke(
    context: *mut TfLiteContext,
    node: *mut TfLiteNode,
) -> TfLiteStatus {
    let Some(params) = params(node) else {
        unsafe { report_error(context, "NGramHash: op was not initialised") };
        return 1;
    };

    let output = unsafe { node_tensor(context, node, 0, false) };
    let Some(output_ref) = (unsafe { output.as_ref() }) else {
        unsafe { report_error(context, "NGramHash: missing output tensor") };
        return 1;
    };

    // The text comes from the host through a thread-local; see
    // `ops::PENDING_TEXT` for why it does not travel through the string input
    // tensor.
    let Some(raw) = take_text() else {
        unsafe {
            report_error(
                context,
                "NGramHash: no input text was supplied for this inference",
            )
        };
        return 1;
    };

    let tokenized = if params.lowercase_input {
        text::lowercase_and_tokenize(&raw, params.max_splits)
    } else {
        text::tokenize(&raw, params.max_splits, true)
    };

    let dims = unsafe { tensor_dims(output) };
    let ngram_count = dims.get(1).copied().unwrap_or(0).max(0) as usize;
    let stride = dims.get(2).copied().unwrap_or(0).max(0) as usize;
    let data = output_ref.data.i32_;
    if data.is_null() || stride == 0 || output_ref.bytes == 0 {
        unsafe { report_error(context, "NGramHash: the output tensor is not usable") };
        return 1;
    }

    // Clear the padding slots: hash-derived ids are always >= 1, so a zero
    // reads as "no token here" to the downstream op.
    unsafe { ptr::write_bytes(data as *mut u8, 0, output_ref.bytes) };

    for (ngram_index, (&ngram_length, &vocab_size)) in params
        .ngram_lengths
        .iter()
        .zip(params.vocab_sizes.iter())
        .enumerate()
    {
        if ngram_index >= ngram_count {
            break;
        }
        let ngram_length = ngram_length.max(1) as usize;
        for start in 0..tokenized.tokens.len().min(stride) {
            // Near the end of the text an n-gram is truncated, matching the
            // reference implementation.
            let end = (start + ngram_length).min(tokenized.tokens.len());
            let num_bytes: usize = tokenized.tokens[start..end].iter().map(|t| t.1).sum();
            let offset = tokenized.tokens[start].0;
            let hash = text::murmur_hash64_with_seed(
                &tokenized.text[offset..offset + num_bytes],
                params.seed,
            );
            let id = (hash % vocab_size as u64) as i32 + 1;
            unsafe { ptr::write(data.add(ngram_index * stride + start), id) };
        }
    }

    KTFLITE_OK
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The custom options the real model carries, as extracted from its
    /// FlatBuffer.
    const OPTIONS: &[u8] = b"max_splits\0ngram_lengths\0\x04\x01\x02\x03\x04seed\0vocab_sizes\0\x00\x04\x00|\x15|\x15\xc82\xc82\x04;1\x1f\x1b\x00\x05\x00\x01\x00\x04\x00\x80\x00.\x00\x9f*\x1a\x00\x05,\x05-\x0c%\x01";

    #[test]
    fn parses_the_models_real_custom_options() {
        let params = NgramHashParams::from_custom_options(OPTIONS).expect("parse");
        assert_eq!(params.ngram_lengths, vec![1, 2, 3, 4]);
        assert_eq!(params.vocab_sizes, vec![5500, 5500, 13000, 13000]);
        assert!(params.seed > 0);
        assert!(params.max_splits > 0);
    }
}
