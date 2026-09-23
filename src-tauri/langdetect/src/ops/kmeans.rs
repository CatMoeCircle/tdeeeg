//! Reimplementation of MediaPipe's `KmeansEmbeddingLookup` custom op.
//!
//! Inputs are the vocab indices produced by `NGramHash` (int32), the compressed
//! `c_matrix` encoding table (uint8) and the `b_matrix` codebook (float32).
//! Each token gathers one embedding block from the codebook; the blocks are
//! averaged over the tokens. The scan stops at the first index `0`, which is how
//! the upstream op expresses padding.

use std::ffi::c_void;
use std::slice;

use edgefirst_tflite_sys::{
    tensorflowlite_c, TfLiteOpaqueContext, TfLiteOpaqueNode, TfLiteOpaqueTensor, TfLiteOperator,
    TfLiteStatus,
};

use crate::error::{Error, Result};
use crate::ops::{
    add_operator, context_from_user_data, ffi, ffi_status, int_array, report_error, OpContext,
    KTFLITE_BUILTIN_CUSTOM, KTFLITE_OK,
};

const OP_NAME: &str = "KmeansEmbeddingLookup";
const OP_VERSION: i32 = 1;

/// Input 0: vocab indices from `NGramHash`.
const INPUT_TOKENS: i32 = 0;
/// Input 1: the per-token compressed encoding table (uint8).
const INPUT_ENCODING_TABLE: i32 = 1;
/// Input 2: the embedding codebook (float32).
const INPUT_CODEBOOK: i32 = 2;

/// Reports `message` and returns a non-OK status.
fn fail(sys: &tensorflowlite_c, context: *mut TfLiteOpaqueContext, message: &str) -> TfLiteStatus {
    unsafe { report_error(sys, context, message) };
    1
}

/// Reads a tensor's dimensions, or `None` if the tensor is unusable.
unsafe fn tensor_dims(
    sys: &tensorflowlite_c,
    tensor: *const TfLiteOpaqueTensor,
) -> Option<Vec<i32>> {
    let num_dims = (sys.TfLiteOpaqueTensorNumDims).as_ref().ok()?;
    let dim = (sys.TfLiteOpaqueTensorDim).as_ref().ok()?;
    let count = unsafe { num_dims(tensor) };
    if count <= 0 {
        return Some(Vec::new());
    }
    Some((0..count).map(|index| unsafe { dim(tensor, index) }).collect())
}

unsafe extern "C" fn prepare(
    user_data: *mut c_void,
    context: *mut TfLiteOpaqueContext,
    node: *mut TfLiteOpaqueNode,
) -> TfLiteStatus {
    let sys = unsafe { context_from_user_data(user_data) }.sys();

    let get_input = ffi_status!(sys, context, TfLiteOpaqueNodeGetInput);
    let get_output = ffi_status!(sys, context, TfLiteOpaqueNodeGetOutput);
    let encoding_table = unsafe { get_input(context, node, INPUT_ENCODING_TABLE) };
    let codebook = unsafe { get_input(context, node, INPUT_CODEBOOK) };
    let output = unsafe { get_output(context, node, 0) };
    if encoding_table.is_null() || codebook.is_null() || output.is_null() {
        return fail(sys, context, "KmeansEmbeddingLookup: missing input or output tensor");
    }

    let (Some(encoding_dims), Some(codebook_dims)) = (
        unsafe { tensor_dims(sys, encoding_table) },
        unsafe { tensor_dims(sys, codebook) },
    ) else {
        return fail(sys, context, "KmeansEmbeddingLookup: cannot read tensor dimensions");
    };
    if encoding_dims.len() != 2 || codebook_dims.len() != 2 {
        return fail(
            sys,
            context,
            "KmeansEmbeddingLookup: the encoding table and the codebook must be rank 2",
        );
    }
    let embedding_size = encoding_dims[1] * codebook_dims[1];
    if embedding_size <= 0 {
        return fail(sys, context, "KmeansEmbeddingLookup: the embedding size must be positive");
    }

    // The model already declares this output as [1, encoding * block]; only ask
    // for a resize when it actually differs.
    let expected = [1, embedding_size];
    let current = unsafe { tensor_dims(sys, output) };
    if current.as_deref() != Some(expected.as_slice()) {
        let dims = unsafe { int_array(&expected) };
        if dims.is_null() {
            return fail(sys, context, "KmeansEmbeddingLookup: cannot allocate the output shape");
        }
        let resize = ffi_status!(sys, context, TfLiteOpaqueContextResizeTensor);
        let status = unsafe { resize(context, output, dims) };
        if status != KTFLITE_OK {
            return fail(sys, context, "KmeansEmbeddingLookup: cannot resize the output tensor");
        }
    }
    KTFLITE_OK
}

unsafe extern "C" fn invoke(
    user_data: *mut c_void,
    context: *mut TfLiteOpaqueContext,
    node: *mut TfLiteOpaqueNode,
) -> TfLiteStatus {
    let sys = unsafe { context_from_user_data(user_data) }.sys();

    let get_input = ffi_status!(sys, context, TfLiteOpaqueNodeGetInput);
    let get_output = ffi_status!(sys, context, TfLiteOpaqueNodeGetOutput);
    let tokens_tensor = unsafe { get_input(context, node, INPUT_TOKENS) };
    let encoding_tensor = unsafe { get_input(context, node, INPUT_ENCODING_TABLE) };
    let codebook_tensor = unsafe { get_input(context, node, INPUT_CODEBOOK) };
    let output_tensor = unsafe { get_output(context, node, 0) };
    if tokens_tensor.is_null()
        || encoding_tensor.is_null()
        || codebook_tensor.is_null()
        || output_tensor.is_null()
    {
        return fail(sys, context, "KmeansEmbeddingLookup: missing input or output tensor");
    }

    let (Some(token_dims), Some(encoding_dims), Some(codebook_dims)) = (
        unsafe { tensor_dims(sys, tokens_tensor) },
        unsafe { tensor_dims(sys, encoding_tensor) },
        unsafe { tensor_dims(sys, codebook_tensor) },
    ) else {
        return fail(sys, context, "KmeansEmbeddingLookup: cannot read tensor dimensions");
    };
    if token_dims.len() != 2 || encoding_dims.len() != 2 || codebook_dims.len() != 2 {
        return fail(sys, context, "KmeansEmbeddingLookup: all tensors must be rank 2");
    }
    if token_dims[0] != 1 {
        return fail(sys, context, "KmeansEmbeddingLookup: the batch size must be 1");
    }

    let num_tokens = token_dims[1].max(0) as usize;
    let encoding_size = encoding_dims[1].max(0) as usize;
    let block_size = codebook_dims[1].max(0) as usize;
    let embedding_size = encoding_size * block_size;

    let tensor_data = ffi_status!(sys, context, TfLiteOpaqueTensorData);
    let byte_size = ffi_status!(sys, context, TfLiteOpaqueTensorByteSize);
    let tokens = unsafe { tensor_data(tokens_tensor) } as *const i32;
    let encoding = unsafe { tensor_data(encoding_tensor) } as *const u8;
    let codebook = unsafe { tensor_data(codebook_tensor) } as *const f32;
    let output = unsafe { tensor_data(output_tensor) } as *mut f32;
    if tokens.is_null()
        || encoding.is_null()
        || codebook.is_null()
        || output.is_null()
        || embedding_size == 0
    {
        return fail(sys, context, "KmeansEmbeddingLookup: the tensors are not allocated");
    }

    let encoding_len = unsafe { byte_size(encoding_tensor) };
    let codebook_len = unsafe { byte_size(codebook_tensor) } / std::mem::size_of::<f32>();
    let output_len = unsafe { byte_size(output_tensor) } / std::mem::size_of::<f32>();

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
            return fail(sys, context, "KmeansEmbeddingLookup: token index out of range");
        }
        num_embeddings += 1;

        for encoding_dim in 0..encoding_size {
            let codebook_index = encoding[token * encoding_size + encoding_dim] as usize;
            let block_start = codebook_index * block_size;
            if block_start + block_size > codebook.len() {
                return fail(sys, context, "KmeansEmbeddingLookup: codebook index out of range");
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
            c"KmeansEmbeddingLookup".as_ptr(),
            OP_VERSION,
            context as *const OpContext as *mut c_void,
        )
    };
    if operator.is_null() {
        return Err(Error::Op(format!("{OP_NAME}: TfLiteOperatorCreate failed")));
    }

    let set_prepare = ffi!(sys, TfLiteOperatorSetPrepareWithData);
    let set_invoke = ffi!(sys, TfLiteOperatorSetInvokeWithData);
    let statuses = unsafe {
        [
            set_prepare(operator, Some(prepare)),
            set_invoke(operator, Some(invoke)),
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
