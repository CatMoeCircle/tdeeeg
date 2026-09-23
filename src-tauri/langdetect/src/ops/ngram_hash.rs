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

use edgefirst_tflite_sys::{
    TfLiteOpaqueContext, TfLiteOpaqueNode, TfLiteOperator, TfLiteStatus,
};

use crate::error::{Error, Result};
use crate::ops::{
    add_operator, context_from_user_data, ffi, ffi_status, int_array, report_error, OpContext,
    KTFLITE_BUILTIN_CUSTOM, KTFLITE_OK,
};
use crate::text;

/// `kDefaultMaxSplits` from the reference implementation.
const DEFAULT_MAX_SPLITS: usize = 128;

/// Name the model's operator code declares.
const OP_NAME: &str = "NGramHash";
/// Version the model's operator code declares.
const OP_VERSION: i32 = 1;

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

unsafe extern "C" fn init(
    user_data: *mut c_void,
    context: *mut TfLiteOpaqueContext,
    buffer: *const c_char,
    length: usize,
) -> *mut c_void {
    let sys = unsafe { context_from_user_data(user_data) }.sys();
    let bytes = if buffer.is_null() || length == 0 {
        &[][..]
    } else {
        unsafe { slice::from_raw_parts(buffer as *const u8, length) }
    };
    match NgramHashParams::from_custom_options(bytes) {
        Ok(params) => Box::into_raw(Box::new(params)).cast::<c_void>(),
        Err(error) => {
            unsafe { report_error(sys, context, &error.to_string()) };
            ptr::null_mut()
        }
    }
}

unsafe extern "C" fn prepare(
    user_data: *mut c_void,
    context: *mut TfLiteOpaqueContext,
    node: *mut TfLiteOpaqueNode,
) -> TfLiteStatus {
    let sys = unsafe { context_from_user_data(user_data) }.sys();

    let get_user_data = ffi_status!(sys, context, TfLiteOpaqueNodeGetUserData);
    let params = unsafe { get_user_data(node) } as *const NgramHashParams;
    if params.is_null() {
        unsafe { report_error(sys, context, "NGramHash: op was not initialised") };
        return 1;
    }
    let params = unsafe { &*params };

    let get_output = ffi_status!(sys, context, TfLiteOpaqueNodeGetOutput);
    let output = unsafe { get_output(context, node, 0) };
    if output.is_null() {
        unsafe { report_error(sys, context, "NGramHash: missing output tensor") };
        return 1;
    }

    // [1, num_ngrams, max_splits] — the inner stride has to be the tensor's own
    // last dimension, because `Invoke` writes straight into this buffer.
    let dims = unsafe { int_array(&[1, params.ngram_count() as i32, params.max_splits as i32]) };
    if dims.is_null() {
        unsafe { report_error(sys, context, "NGramHash: cannot allocate output shape") };
        return 1;
    }

    let resize = ffi_status!(sys, context, TfLiteOpaqueContextResizeTensor);
    let status = unsafe { resize(context, output, dims) };
    if status != KTFLITE_OK {
        unsafe { report_error(sys, context, "NGramHash: cannot resize the output tensor") };
    }
    status
}

unsafe extern "C" fn invoke(
    user_data: *mut c_void,
    context: *mut TfLiteOpaqueContext,
    node: *mut TfLiteOpaqueNode,
) -> TfLiteStatus {
    let context_ref = unsafe { context_from_user_data(user_data) };
    let sys = context_ref.sys();

    let get_user_data = ffi_status!(sys, context, TfLiteOpaqueNodeGetUserData);
    let params = unsafe { get_user_data(node) } as *const NgramHashParams;
    if params.is_null() {
        unsafe { report_error(sys, context, "NGramHash: op was not initialised") };
        return 1;
    }
    let params = unsafe { &*params };

    let get_output = ffi_status!(sys, context, TfLiteOpaqueNodeGetOutput);
    let output = unsafe { get_output(context, node, 0) };
    if output.is_null() {
        unsafe { report_error(sys, context, "NGramHash: missing output tensor") };
        return 1;
    }

    // The text comes from the host through the operator's user data; see
    // `OpContext` for why it does not travel through the string input tensor.
    let Some(raw) = context_ref.take_text() else {
        unsafe {
            report_error(
                sys,
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

    let dim = ffi_status!(sys, context, TfLiteOpaqueTensorDim);
    let byte_size_of = ffi_status!(sys, context, TfLiteOpaqueTensorByteSize);
    let tensor_data = ffi_status!(sys, context, TfLiteOpaqueTensorData);

    let ngram_count = unsafe { dim(output, 1) }.max(0) as usize;
    let stride = unsafe { dim(output, 2) }.max(0) as usize;
    let byte_size = unsafe { byte_size_of(output) };
    let data = unsafe { tensor_data(output) } as *mut i32;
    if data.is_null() || stride == 0 || byte_size == 0 {
        unsafe { report_error(sys, context, "NGramHash: the output tensor is not usable") };
        return 1;
    }

    // Clear the padding slots: hash-derived ids are always >= 1, so a zero
    // reads as "no token here" to the downstream op.
    unsafe { ptr::write_bytes(data as *mut u8, 0, byte_size) };

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

unsafe extern "C" fn free_op(
    _user_data: *mut c_void,
    _context: *mut TfLiteOpaqueContext,
    data: *mut c_void,
) {
    if !data.is_null() {
        drop(unsafe { Box::from_raw(data as *mut NgramHashParams) });
    }
}

/// Creates the operator and wires its callbacks.
///
/// The returned operator must outlive the interpreter that uses it, and
/// `context` must outlive both.
pub fn create(context: &OpContext) -> Result<*mut TfLiteOperator> {
    let sys = context.sys();
    let create = ffi!(sys, TfLiteOperatorCreate);
    let operator = unsafe {
        create(
            KTFLITE_BUILTIN_CUSTOM,
            c"NGramHash".as_ptr(),
            OP_VERSION,
            context as *const OpContext as *mut c_void,
        )
    };
    if operator.is_null() {
        return Err(Error::Op(format!("{OP_NAME}: TfLiteOperatorCreate failed")));
    }

    let set_init = ffi!(sys, TfLiteOperatorSetInitWithData);
    let set_prepare = ffi!(sys, TfLiteOperatorSetPrepareWithData);
    let set_invoke = ffi!(sys, TfLiteOperatorSetInvokeWithData);
    let set_free = ffi!(sys, TfLiteOperatorSetFreeWithData);
    let statuses = unsafe {
        [
            set_init(operator, Some(init)),
            set_prepare(operator, Some(prepare)),
            set_invoke(operator, Some(invoke)),
            set_free(operator, Some(free_op)),
        ]
    };
    if statuses.iter().any(|status| *status != KTFLITE_OK) {
        return Err(Error::Op(format!("{OP_NAME}: cannot set the op callbacks")));
    }
    Ok(operator)
}

/// Creates the op and registers it on the interpreter options.
pub fn register(
    context: &OpContext,
    options: *mut edgefirst_tflite_sys::TfLiteInterpreterOptions,
) -> Result<*mut TfLiteOperator> {
    let operator = create(context)?;
    add_operator(context.sys(), options, operator)?;
    Ok(operator)
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
