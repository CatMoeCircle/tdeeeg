//! The two custom ops the MediaPipe LangID model depends on.
//!
//! `language_detector.tflite` is a CLD3-style model: instead of learning from
//! raw characters it hashes character n-grams and looks up compressed
//! embeddings. MediaPipe ships that logic as TFLite *custom ops*
//! (`NGramHash` and `KmeansEmbeddingLookup`), which no standard TFLite build
//! provides. They are reimplemented here against the *classic* custom-op API
//! (`TfLiteRegistration` + `TfLiteInterpreterOptionsAddCustomOp`) and access
//! tensors through the `TfLiteContext` / `TfLiteNode` / `TfLiteTensor` structs.
//!
//! The classic API is used deliberately: the newer "opaque" operator API is not
//! exported by every prebuilt TFLite library (EdgeFirstAI's Linux/macOS builds
//! lack `TfLiteOpaqueContextResizeTensor` and friends), while every build
//! checked so far ships the classic surface.

pub mod kmeans;
pub mod ngram_hash;

use std::cell::RefCell;
use std::ffi::{c_void, CString};
use std::os::raw::c_char;

use edgefirst_tflite_sys::{
    TfLiteContext, TfLiteInterpreterOptions, TfLiteIntArray, TfLiteNode, TfLiteRegistration,
    TfLiteStatus, TfLiteTensor,
};

use crate::error::{Error, Result};

/// `kTfLiteBuiltinCustom`: the builtin code every custom op is registered with.
pub const KTFLITE_BUILTIN_CUSTOM: u32 = 32;

/// `kTfLiteOk`.
pub const KTFLITE_OK: u32 = 0;

/// Unwraps one entry of the runtime-resolved TFLite function table.
///
/// The table stores every symbol as a `Result` so that a missing symbol is
/// reported at load time; `as_ref` lets us copy the function pointer out
/// without moving it.
macro_rules! ffi {
    ($sys:expr, $name:ident) => {
        *($sys.$name)
            .as_ref()
            .map_err(|_| $crate::error::Error::MissingSymbol(stringify!($name)))?
    };
}

pub(crate) use ffi;

thread_local! {
    /// Text awaiting the next `NGramHash` invocation.
    ///
    /// A `TfLiteRegistration` has no per-op user data, and LiteRT does not
    /// export the string-tensor write API (`TfLiteOpaqueTensorWriteString` /
    /// `TfLiteTensorCopyFromString`) that the classic runtime has — so the
    /// model's `kTfLiteString` input tensor is left empty and the text travels
    /// here instead. Inference runs ops on the calling thread, so a
    /// thread-local keeps concurrent detector uses independent. `NGramHash` is
    /// the only consumer of the model's input, so this is equivalent.
    static PENDING_TEXT: RefCell<Option<Vec<u8>>> = const { RefCell::new(None) };
}

/// Publishes the text the next inference on this thread should hash.
pub(crate) fn set_text(text: &str) {
    PENDING_TEXT.with(|slot| *slot.borrow_mut() = Some(text.as_bytes().to_vec()));
}

/// Consumes the pending text, so a second read within the same inference sees
/// nothing rather than stale data.
pub(crate) fn take_text() -> Option<Vec<u8>> {
    PENDING_TEXT.with(RefCell::take)
}

/// Reports a failure through TFLite so it surfaces in the interpreter's error
/// output instead of being silently swallowed.
pub(crate) unsafe fn report_error(context: *mut TfLiteContext, message: &str) {
    let Some(context_ref) = (unsafe { context.as_ref() }) else {
        return;
    };
    let Some(report) = context_ref.ReportError else {
        return;
    };
    let text = CString::new(message.replace('\0', " ")).unwrap_or_default();
    unsafe { report(context, c"%s".as_ptr(), text.as_ptr()) };
}

/// Returns the input (or output) tensor `index` of `node`.
pub(crate) unsafe fn node_tensor(
    context: *mut TfLiteContext,
    node: *mut TfLiteNode,
    index: usize,
    input: bool,
) -> *mut TfLiteTensor {
    let (Some(context_ref), Some(node_ref)) = ((unsafe { context.as_ref() }), (unsafe { node.as_ref() }))
    else {
        return std::ptr::null_mut();
    };
    let array = if input { node_ref.inputs } else { node_ref.outputs };
    let Some(array_ref) = (unsafe { array.as_ref() }) else {
        return std::ptr::null_mut();
    };
    if index >= array_ref.size as usize {
        return std::ptr::null_mut();
    }
    let tensor_index = unsafe { *array_ref.data.as_ptr().add(index) };
    if tensor_index < 0 || tensor_index as usize >= context_ref.tensors_size || context_ref.tensors.is_null() {
        return std::ptr::null_mut();
    }
    unsafe { context_ref.tensors.add(tensor_index as usize) }
}

/// Reads a tensor's dimensions as a `Vec<i32>`.
pub(crate) unsafe fn tensor_dims(tensor: *const TfLiteTensor) -> Vec<i32> {
    let Some(tensor_ref) = (unsafe { tensor.as_ref() }) else {
        return Vec::new();
    };
    let Some(dims) = (unsafe { tensor_ref.dims.as_ref() }) else {
        return Vec::new();
    };
    let n = dims.size.max(0) as usize;
    (0..n)
        .map(|i| unsafe { *dims.data.as_ptr().add(i) })
        .collect()
}

/// Builds a `TfLiteIntArray` for `TfLiteContext::ResizeTensor`.
///
/// TFLite's `TfLiteIntArrayCreate` is not exported by every runtime (LiteRT
/// drops it), so the array is laid out here exactly as the C API does: an `int`
/// count header followed by that many `int` dimensions, allocated with the C
/// runtime's `malloc` because `ResizeTensor` takes ownership and releases it
/// with `free`.
pub(crate) unsafe fn int_array(values: &[i32]) -> *mut TfLiteIntArray {
    let bytes = std::mem::size_of::<i32>() + std::mem::size_of_val(values);
    let array = unsafe { libc::malloc(bytes) } as *mut TfLiteIntArray;
    if array.is_null() {
        return array;
    }
    unsafe {
        (*array).size = values.len() as i32;
        let data = std::ptr::addr_of_mut!((*array).data).cast::<i32>();
        for (index, value) in values.iter().enumerate() {
            std::ptr::write(data.add(index), *value);
        }
    }
    array
}

/// Asks the interpreter to adopt `dims` as the new shape of `tensor`.
pub(crate) unsafe fn resize_tensor(
    context: *mut TfLiteContext,
    tensor: *mut TfLiteTensor,
    dims: &[i32],
) -> bool {
    let Some(context_ref) = (unsafe { context.as_ref() }) else {
        return false;
    };
    let Some(resize) = context_ref.ResizeTensor else {
        return false;
    };
    let array = unsafe { int_array(dims) };
    if array.is_null() {
        return false;
    }
    let status = unsafe { resize(context, tensor, array) };
    status == KTFLITE_OK
}

/// Registration identity shared by every custom op instance.
struct OpIdentity {
    /// Leaked so the C string stays valid for the registration's lifetime.
    name: CString,
    registration: TfLiteRegistration,
}

/// Registers a custom op on the interpreter options.
///
/// `TfLiteInterpreterOptionsAddCustomOp` is part of the experimental C API and
/// is not in `edgefirst-tflite-sys`'s eager symbol table, so it is resolved on
/// demand from the loaded library. The options object retains a pointer to the
/// registration, which is why it is leaked once and reused: the registrations
/// are stateless (per-node state lives in the `init` callback's return value).
fn register_custom_op(
    sys: &edgefirst_tflite_sys::tensorflowlite_c,
    options: *mut TfLiteInterpreterOptions,
    name: &str,
    init: unsafe extern "C" fn(*mut TfLiteContext, *const c_char, usize) -> *mut c_void,
    free: unsafe extern "C" fn(*mut TfLiteContext, *mut c_void),
    prepare: unsafe extern "C" fn(*mut TfLiteContext, *mut TfLiteNode) -> TfLiteStatus,
    invoke: unsafe extern "C" fn(*mut TfLiteContext, *mut TfLiteNode) -> TfLiteStatus,
) -> Result<()> {
    type AddCustomOpFn = unsafe extern "C" fn(
        *mut TfLiteInterpreterOptions,
        *const c_char,
        *const TfLiteRegistration,
        i32,
        i32,
    );

    // SAFETY: the library is the one the interpreter is being built from, and
    // the symbol exists in every TFLite build checked so far.
    let add_custom_op: libloading::Symbol<'_, AddCustomOpFn> = unsafe {
        sys.library()
            .get(b"TfLiteInterpreterOptionsAddCustomOp\0")
    }
    .map_err(|_| Error::MissingSymbol("TfLiteInterpreterOptionsAddCustomOp"))?;

    // SAFETY: leaked on purpose — the options object keeps the pointer.
    let identity: &'static mut OpIdentity = Box::leak(Box::new(OpIdentity {
        name: CString::new(name).map_err(|_| Error::Op(format!("{name}: invalid op name")))?,
        registration: TfLiteRegistration {
            init: Some(init),
            free: Some(free),
            prepare: Some(prepare),
            invoke: Some(invoke),
            profiling_string: None,
            builtin_code: KTFLITE_BUILTIN_CUSTOM as i32,
            custom_name: std::ptr::null(),
            version: 1,
            registration_external: std::ptr::null_mut(),
            async_kernel: None,
            inplace_operator: 0,
        },
    }));
    identity.registration.custom_name = identity.name.as_ptr();

    // SAFETY: `identity` outlives the interpreter, as required.
    unsafe {
        add_custom_op(options, identity.name.as_ptr(), &identity.registration, 1, 1);
    }
    Ok(())
}

/// Registers both custom ops the model needs on `options`.
pub fn register_ops(
    sys: &edgefirst_tflite_sys::tensorflowlite_c,
    options: *mut TfLiteInterpreterOptions,
) -> Result<()> {
    register_custom_op(
        sys,
        options,
        "NGramHash",
        ngram_hash::init,
        ngram_hash::free_op,
        ngram_hash::prepare,
        ngram_hash::invoke,
    )?;
    register_custom_op(
        sys,
        options,
        "KmeansEmbeddingLookup",
        kmeans::init,
        kmeans::free_op,
        kmeans::prepare,
        kmeans::invoke,
    )?;
    Ok(())
}
