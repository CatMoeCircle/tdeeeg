//! Reimplementation of MediaPipe's `KmeansEmbeddingLookup` custom op.
//!
//! Inputs are the vocab indices produced by `NGramHash` (int32), the compressed
//! `c_matrix` encoding table (uint8) and the `b_matrix` codebook (float32).
//! Each token gathers one embedding block from the codebook; the blocks are
//! averaged over the tokens. The scan stops at the first index `0`, which is how
//! the upstream op expresses padding.

use std::ffi::c_void;
use std::os::raw::c_char;
use std::slice;

use edgefirst_tflite_sys::{TfLiteContext, TfLiteNode, TfLiteStatus};

use crate::ops::{node_tensor, report_error, resize_tensor, tensor_dims, KTFLITE_OK};

/// Input 0: vocab indices from `NGramHash`.
const INPUT_TOKENS: usize = 0;
/// Input 1: the per-token compressed encoding table (uint8).
const INPUT_ENCODING_TABLE: usize = 1;
/// Input 2: the embedding codebook (float32).
const INPUT_CODEBOOK: usize = 2;

/// Reports `message` and returns a non-OK status.
fn fail(context: *mut TfLiteContext, message: &str) -> TfLiteStatus {
    unsafe { report_error(context, message) };
    1
}

pub(crate) unsafe extern "C" fn init(
    _context: *mut TfLiteContext,
    _buffer: *const c_char,
    _length: usize,
) -> *mut c_void {
    // The model ships no custom options for this op, and the weights are read
    // straight from the input tensors on every invocation.
    std::ptr::null_mut()
}

pub(crate) unsafe extern "C" fn free_op(_context: *mut TfLiteContext, _data: *mut c_void) {}

pub(crate) unsafe extern "C" fn prepare(
    context: *mut TfLiteContext,
    node: *mut TfLiteNode,
) -> TfLiteStatus {
    let encoding_table = unsafe { node_tensor(context, node, INPUT_ENCODING_TABLE, true) };
    let codebook = unsafe { node_tensor(context, node, INPUT_CODEBOOK, true) };
    let output = unsafe { node_tensor(context, node, 0, false) };
    if encoding_table.is_null() || codebook.is_null() || output.is_null() {
        return fail(context, "KmeansEmbeddingLookup: missing input or output tensor");
    }

    let encoding_dims = unsafe { tensor_dims(encoding_table) };
    let codebook_dims = unsafe { tensor_dims(codebook) };
    if encoding_dims.len() != 2 || codebook_dims.len() != 2 {
        return fail(
            context,
            "KmeansEmbeddingLookup: the encoding table and the codebook must be rank 2",
        );
    }
    let embedding_size = encoding_dims[1] * codebook_dims[1];
    if embedding_size <= 0 {
        return fail(context, "KmeansEmbeddingLookup: the embedding size must be positive");
    }

    // The model already declares this output as [1, encoding * block]; only ask
    // for a resize when it actually differs.
    let expected = [1, embedding_size];
    if unsafe { tensor_dims(output) } != expected && !unsafe { resize_tensor(context, output, &expected) }
    {
        return fail(context, "KmeansEmbeddingLookup: cannot resize the output tensor");
    }
    KTFLITE_OK
}

pub(crate) unsafe extern "C" fn invoke(
    context: *mut TfLiteContext,
    node: *mut TfLiteNode,
) -> TfLiteStatus {
    let tokens_tensor = unsafe { node_tensor(context, node, INPUT_TOKENS, true) };
    let encoding_tensor = unsafe { node_tensor(context, node, INPUT_ENCODING_TABLE, true) };
    let codebook_tensor = unsafe { node_tensor(context, node, INPUT_CODEBOOK, true) };
    let output_tensor = unsafe { node_tensor(context, node, 0, false) };
    if tokens_tensor.is_null()
        || encoding_tensor.is_null()
        || codebook_tensor.is_null()
        || output_tensor.is_null()
    {
        return fail(context, "KmeansEmbeddingLookup: missing input or output tensor");
    }

    let token_dims = unsafe { tensor_dims(tokens_tensor) };
    let encoding_dims = unsafe { tensor_dims(encoding_tensor) };
    let codebook_dims = unsafe { tensor_dims(codebook_tensor) };
    if token_dims.len() != 2 || encoding_dims.len() != 2 || codebook_dims.len() != 2 {
        return fail(context, "KmeansEmbeddingLookup: all tensors must be rank 2");
    }
    if token_dims[0] != 1 {
        return fail(context, "KmeansEmbeddingLookup: the batch size must be 1");
    }

    let num_tokens = token_dims[1].max(0) as usize;
    let encoding_size = encoding_dims[1].max(0) as usize;
    let block_size = codebook_dims[1].max(0) as usize;
    let embedding_size = encoding_size * block_size;

    let (Some(tokens_ref), Some(encoding_ref), Some(codebook_ref), Some(output_ref)) = (
        unsafe { tokens_tensor.as_ref() },
        unsafe { encoding_tensor.as_ref() },
        unsafe { codebook_tensor.as_ref() },
        unsafe { output_tensor.as_ref() },
    ) else {
        return fail(context, "KmeansEmbeddingLookup: the tensors are not allocated");
    };
    let (tokens, encoding, codebook, output) = (
        tokens_ref.data.i32_,
        encoding_ref.data.uint8,
        codebook_ref.data.f,
        output_ref.data.f,
    );
    if tokens.is_null() || encoding.is_null() || codebook.is_null() || output.is_null() || embedding_size == 0
    {
        return fail(context, "KmeansEmbeddingLookup: the tensors are not allocated");
    }

    let encoding_len = encoding_ref.bytes;
    let codebook_len = codebook_ref.bytes / std::mem::size_of::<f32>();
    let output_len = output_ref.bytes / std::mem::size_of::<f32>();

    let tokens = unsafe { slice::from_raw_parts(tokens, num_tokens) };
    let encoding = unsafe { slice::from_raw_parts(encoding, encoding_len) };
    let codebook = unsafe { slice::from_raw_parts(codebook, codebook_len) };

    let mut embedding = vec![0.0f32; embedding_size];
    let mut num_embeddings = 0usize;
    for &token in tokens {
        if token == 0 {
            break;
        }
        let token = token as usize;
        if (token + 1) * encoding_size > encoding.len() {
            return fail(context, "KmeansEmbeddingLookup: token index out of range");
        }
        num_embeddings += 1;

        for encoding_dim in 0..encoding_size {
            let codebook_index = encoding[token * encoding_size + encoding_dim] as usize;
            let block_start = codebook_index * block_size;
            if block_start + block_size > codebook.len() {
                return fail(context, "KmeansEmbeddingLookup: codebook index out of range");
            }
            let destination = encoding_dim * block_size;
            for offset in 0..block_size {
                embedding[destination + offset] += codebook[block_start + offset];
            }
        }
    }

    let divisor = num_embeddings.max(1) as f32;
    let out = unsafe { slice::from_raw_parts_mut(output, output_len.min(embedding_size)) };
    for (slot, value) in out.iter_mut().zip(embedding.iter()) {
        *slot = *value / divisor;
    }

    KTFLITE_OK
}
