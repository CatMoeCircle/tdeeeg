//! The two custom ops the MediaPipe LangID model depends on.
//!
//! `language_detector.tflite` is a CLD3-style model: instead of learning from
//! raw characters it hashes character n-grams and looks up compressed
//! embeddings. MediaPipe ships that logic as TFLite *custom ops*
//! (`NGramHash` and `KmeansEmbeddingLookup`), which no standard TFLite build
//! provides. They are reimplemented here against the TFLite C API's
//! "external operator" interface (`TfLiteOperator`) and registered on the
//! interpreter's options.

pub mod kmeans;
pub mod ngram_hash;

use std::ffi::{c_void, CString};
use std::sync::Mutex;

use edgefirst_tflite_sys::{
    tensorflowlite_c, TfLiteInterpreterOptions, TfLiteIntArray, TfLiteOpaqueContext,
    TfLiteOperator,
};

use crate::error::Result;

/// `kTfLiteBuiltinCustom`: the builtin code every custom op is created with.
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

/// Like [`ffi!`], but for custom op callbacks, which cannot propagate a
/// `Result`: reports the missing symbol and returns a non-OK `TfLiteStatus`.
macro_rules! ffi_status {
    ($sys:expr, $context:expr, $name:ident) => {{
        match ($sys.$name).as_ref() {
            Ok(function) => *function,
            Err(_) => {
                #[allow(unused_unsafe)]
                unsafe {
                    crate::ops::report_error(
                        $sys,
                        $context,
                        concat!("missing TFLite symbol `", stringify!($name), "`"),
                    )
                };
                return 1;
            }
        }
    }};
}

pub(crate) use ffi_status;

/// State shared between the host and the custom ops.
///
/// A `TfLiteOperator` carries a `user_data` pointer, which is the only channel
/// the TFLite C API gives an operator: the ops receive a pointer to this struct
/// and use it to reach the function table and the text under inference.
///
/// The text travels this way because LiteRT does not export the string-tensor
/// accessors (`TfLiteOpaqueTensorWriteString` / `TfLiteOpaqueTensorGetString`)
/// that the classic TensorFlow Lite runtime has, and a `kTfLiteString` tensor
/// cannot be written through any other exported entry point. `NGramHash` is the
/// only consumer of the model's input, so handing it the text directly is
/// equivalent — the model's string input tensor simply stays unused.
#[derive(Debug)]
pub struct OpContext {
    sys: *const tensorflowlite_c,
    text: Mutex<Option<Vec<u8>>>,
}

impl OpContext {
    /// # Safety
    ///
    /// `sys` must stay valid for as long as the context is used, i.e. for as
    /// long as the interpreter that references these ops lives.
    pub(crate) unsafe fn new(sys: &tensorflowlite_c) -> Self {
        Self {
            sys: sys as *const tensorflowlite_c,
            text: Mutex::new(None),
        }
    }

    pub(crate) fn sys(&self) -> &tensorflowlite_c {
        // SAFETY: upheld by `OpContext::new`'s contract.
        unsafe { &*self.sys }
    }

    /// Publishes the text the next inference should hash.
    pub(crate) fn set_text(&self, text: &str) {
        let mut slot = self.text.lock().unwrap_or_else(|e| e.into_inner());
        *slot = Some(text.as_bytes().to_vec());
    }

    /// Consumes the pending text, so a second read in the same inference sees
    /// nothing rather than stale data.
    fn take_text(&self) -> Option<Vec<u8>> {
        self.text
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .take()
    }
}

// SAFETY: the struct is a plain function-table pointer plus a `Mutex`, and
// TFLite itself imposes no thread affinity on operators.
unsafe impl Send for OpContext {}
unsafe impl Sync for OpContext {}

/// Recovers the [`OpContext`] that was handed to `TfLiteOperatorCreate` as its
/// `user_data`.
///
/// # Safety
///
/// `user_data` must be the pointer passed when the operator was created, and it
/// must still be alive.
pub(crate) unsafe fn context_from_user_data<'a>(user_data: *mut c_void) -> &'a OpContext {
    unsafe { &*(user_data as *const OpContext) }
}

/// Reports a failure through TFLite so it surfaces in the interpreter's error
/// output instead of being silently swallowed.
pub(crate) unsafe fn report_error(
    sys: &tensorflowlite_c,
    context: *mut TfLiteOpaqueContext,
    message: &str,
) {
    if let Ok(report) = sys.TfLiteOpaqueContextReportError {
        let text = CString::new(message.replace('\0', " ")).unwrap_or_default();
        unsafe { report(context, c"%s".as_ptr(), text.as_ptr()) };
    }
}

/// Builds a `TfLiteIntArray` for the ones that ask TFLite to resize a tensor.
///
/// TFLite's `TfLiteIntArrayCreate` is not exported by every runtime (LiteRT
/// Next drops it), so the array is laid out here exactly as the C API does:
/// an `int` count header followed by that many `int` dimensions, allocated with
/// the C runtime's `malloc` because TFLite takes ownership and releases it with
/// `free`.
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

/// Registers an operator on the interpreter options.
pub(crate) fn add_operator(
    sys: &tensorflowlite_c,
    options: *mut TfLiteInterpreterOptions,
    operator: *mut TfLiteOperator,
) -> Result<()> {
    let add = ffi!(sys, TfLiteInterpreterOptionsAddOperator);
    // SAFETY: both pointers come from the TFLite C API and outlive this call.
    unsafe { add(options, operator) };
    Ok(())
}
