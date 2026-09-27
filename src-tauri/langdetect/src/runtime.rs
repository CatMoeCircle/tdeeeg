//! A TFLite interpreter wired up with the model's custom ops.
//!
//! `edgefirst_tflite::Interpreter` cannot be used here: the model needs two
//! custom operators registered on the interpreter options, and the safe builder
//! has no hook for that. This module drives the same crate's TFLite function
//! table (`Library::as_sys`) directly — exactly what the builder does
//! internally — and adds the operators in between.

use std::ffi::c_void;
use std::path::PathBuf;
use std::ptr::NonNull;

use edgefirst_tflite::Library;
use edgefirst_tflite_sys::{
    tensorflowlite_c, TfLiteInterpreter, TfLiteInterpreterOptions, TfLiteModel, TfLiteTensor,
    TfLiteType_kTfLiteFloat32,
};

use crate::error::{Error, Result};
use crate::ops::{self, ffi, KTFLITE_OK};

/// TFLite shared-library file name on the current platform.
#[cfg(target_os = "windows")]
const LIBRARY_FILE_NAME: &str = "tensorflowlite_c.dll";
#[cfg(target_os = "macos")]
const LIBRARY_FILE_NAME: &str = "libtensorflowlite_c.dylib";
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
const LIBRARY_FILE_NAME: &str = "libtensorflowlite_c.so";

/// Environment variable that overrides library discovery.
const LIBRARY_PATH_ENV: &str = "TFLITE_LIBRARY_PATH";

/// Owns a loaded TFLite library, a model, an interpreter and the custom
/// operators registered on it.
pub struct Runner {
    /// Boxed so the library handle lives at a stable address for as long as the
    /// interpreter does. Never read again — it is what keeps the shared library
    /// mapped while `self.sys` is dereferenced.
    _library: Box<Library>,
    sys: *const tensorflowlite_c,
    /// `TfLiteModelCreate` documents its buffer as caller-owned: the model keeps
    /// reading through the pointer for its whole life, so the buffer has to
    /// outlive the interpreter. (Letting it drop lets the allocator unmap those
    /// pages, and every later weight read becomes an access violation.)
    _model_bytes: Vec<u8>,
    model: NonNull<TfLiteModel>,
    interpreter: NonNull<TfLiteInterpreter>,
    options: NonNull<TfLiteInterpreterOptions>,
    output_len: usize,
}

impl Runner {
    /// Loads `model_bytes` and builds an interpreter with the custom ops the
    /// MediaPipe LangID model requires.
    pub fn new(model_bytes: Vec<u8>) -> Result<Self> {
        let library = Box::new(load_library()?);
        // SAFETY: `library` is boxed, so its address is stable for as long as
        // the box lives — i.e. for the whole life of this `Runner`, including
        // the `Drop` that tears the interpreter down.
        let sys: *const tensorflowlite_c = library.as_sys() as *const tensorflowlite_c;
        let sys_ref = unsafe { &*sys };

        let create_model = ffi!(sys_ref, TfLiteModelCreate);
        let model = NonNull::new(unsafe {
            create_model(model_bytes.as_ptr() as *const c_void, model_bytes.len())
        })
        .ok_or_else(|| Error::Model("TfLiteModelCreate rejected the model bytes".into()))?;

        let mut setup = Setup::new(sys_ref, model)?;
        let (interpreter, output_len) = setup.run(1)?;
        let options = setup.options;
        setup.disarm();
        drop(setup);

        Ok(Self {
            _library: library,
            sys,
            _model_bytes: model_bytes,
            model,
            interpreter,
            options,
            output_len,
        })
    }

    /// Number of language scores the model produces.
    pub fn language_count(&self) -> usize {
        self.output_len
    }

    /// Runs language detection on `text` and returns the raw softmax scores.
    pub fn detect(&self, text: &str) -> Result<Vec<f32>> {
        let sys = unsafe { &*self.sys };
        ops::set_text(text);

        let invoke = ffi!(sys, TfLiteInterpreterInvoke);
        if unsafe { invoke(self.interpreter.as_ptr()) } != KTFLITE_OK {
            return Err(Error::Tflite("TfLiteInterpreterInvoke"));
        }

        let output = self.output_tensor()?;
        if unsafe { (*output).type_ } != TfLiteType_kTfLiteFloat32 {
            return Err(Error::Tensor(format!(
                "expected a float32 output tensor, found TfLiteType {}",
                unsafe { (*output).type_ }
            )));
        }

        let mut scores = vec![0f32; self.output_len];
        let copy_to_buffer = ffi!(sys, TfLiteTensorCopyToBuffer);
        let status = unsafe {
            copy_to_buffer(
                output,
                scores.as_mut_ptr() as *mut c_void,
                scores.len() * std::mem::size_of::<f32>(),
            )
        };
        if status != KTFLITE_OK {
            return Err(Error::Tflite("TfLiteTensorCopyToBuffer"));
        }
        Ok(scores)
    }

    fn output_tensor(&self) -> Result<*const TfLiteTensor> {
        let sys = unsafe { &*self.sys };
        let get_output = ffi!(sys, TfLiteInterpreterGetOutputTensor);
        let output = unsafe { get_output(self.interpreter.as_ptr(), 0) };
        if output.is_null() {
            return Err(Error::Tensor("the model has no output tensor".into()));
        }
        Ok(output)
    }
}

impl Drop for Runner {
    fn drop(&mut self) {
        // SAFETY: `sys` points into `self.library`, which is still alive here.
        unsafe {
            teardown(&*self.sys, Some(self.interpreter), self.model, Some(self.options));
        }
    }
}

impl std::fmt::Debug for Runner {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Runner")
            .field("languages", &self.output_len)
            .finish()
    }
}

/// Finds the TFLite shared library.
///
/// The order is: an explicit path in `TFLITE_LIBRARY_PATH`, then a copy sitting
/// next to the executable (where the build script stages one), then whatever
/// `edgefirst-tflite` can discover on the system.
fn load_library() -> Result<Library> {
    if let Some(path) = std::env::var_os(LIBRARY_PATH_ENV) {
        let path = PathBuf::from(path);
        return Library::from_path(&path).map_err(|e| {
            Error::Model(format!(
                "cannot load the TFLite library from {LIBRARY_PATH_ENV}={}: {e}",
                path.display()
            ))
        });
    }

    if let Some(candidate) = library_next_to_executable() {
        if candidate.is_file() {
            return Library::from_path(&candidate).map_err(|e| {
                Error::Model(format!(
                    "cannot load the TFLite library at {}: {e}",
                    candidate.display()
                ))
            });
        }
    }

    Library::new().map_err(|e| {
        Error::Model(format!(
            "no TFLite library found; put {LIBRARY_FILE_NAME} next to the executable \
             or point {LIBRARY_PATH_ENV} at it ({e})"
        ))
    })
}

fn library_next_to_executable() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    Some(exe.parent()?.join(LIBRARY_FILE_NAME))
}

/// Releases TFLite objects in the order their lifetimes require: the
/// interpreter borrows the model and the operators, so it must go first.
///
/// # Safety
///
/// Every pointer must come from the TFLite C API and not be used afterwards.
unsafe fn teardown(
    sys: &tensorflowlite_c,
    interpreter: Option<NonNull<TfLiteInterpreter>>,
    model: NonNull<TfLiteModel>,
    options: Option<NonNull<TfLiteInterpreterOptions>>,
) {
    unsafe {
        if let Some(interpreter) = interpreter {
            if let Ok(delete) = sys.TfLiteInterpreterDelete.as_ref() {
                delete(interpreter.as_ptr());
            }
        }
        if let Ok(delete) = sys.TfLiteModelDelete.as_ref() {
            delete(model.as_ptr());
        }
        if let Some(options) = options {
            if let Ok(delete) = sys.TfLiteInterpreterOptionsDelete.as_ref() {
                delete(options.as_ptr());
            }
        }
    }
}

/// Builds the interpreter options, custom operators and interpreter, tearing
/// everything down again if any step fails.
struct Setup<'a> {
    sys: &'a tensorflowlite_c,
    model: NonNull<TfLiteModel>,
    options: NonNull<TfLiteInterpreterOptions>,
    interpreter: Option<NonNull<TfLiteInterpreter>>,
    armed: bool,
}

impl<'a> Setup<'a> {
    fn new(sys: &'a tensorflowlite_c, model: NonNull<TfLiteModel>) -> Result<Self> {
        let create_options = ffi!(sys, TfLiteInterpreterOptionsCreate);
        let options = NonNull::new(unsafe { create_options() })
            .ok_or(Error::Tflite("TfLiteInterpreterOptionsCreate"))?;
        Ok(Self {
            sys,
            model,
            options,
            interpreter: None,
            armed: true,
        })
    }

    /// Leaves the objects created by this guard to the caller.
    fn disarm(&mut self) {
        self.armed = false;
    }

    fn run(&mut self, num_threads: i32) -> Result<(NonNull<TfLiteInterpreter>, usize)> {
        let sys = self.sys;

        if num_threads > 0 {
            let set_threads = ffi!(sys, TfLiteInterpreterOptionsSetNumThreads);
            unsafe { set_threads(self.options.as_ptr(), num_threads) };
        }

        ops::register_ops(sys, self.options.as_ptr())?;

        let create_interpreter = ffi!(sys, TfLiteInterpreterCreate);
        let interpreter =
            unsafe { create_interpreter(self.model.as_ptr(), self.options.as_ptr()) };
        let interpreter =
            NonNull::new(interpreter).ok_or(Error::Tflite("TfLiteInterpreterCreate"))?;
        self.interpreter = Some(interpreter);

        let allocate = ffi!(sys, TfLiteInterpreterAllocateTensors);
        if unsafe { allocate(interpreter.as_ptr()) } != KTFLITE_OK {
            return Err(Error::Tflite("TfLiteInterpreterAllocateTensors"));
        }

        let get_output = ffi!(sys, TfLiteInterpreterGetOutputTensor);
        let output = unsafe { get_output(interpreter.as_ptr(), 0) };
        if output.is_null() {
            return Err(Error::Tensor("the model has no output tensor".into()));
        }
        let output_len = unsafe { (*output).bytes } / std::mem::size_of::<f32>();
        if output_len == 0 {
            return Err(Error::Tensor(
                "the model's output tensor is empty; is this a language detection model?".into(),
            ));
        }

        Ok((interpreter, output_len))
    }
}

impl Drop for Setup<'_> {
    fn drop(&mut self) {
        if !self.armed {
            return;
        }
        // SAFETY: every pointer was produced by the TFLite C API through `sys`,
        // and ownership moves to the deletion calls exactly once.
        unsafe {
            teardown(self.sys, self.interpreter, self.model, Some(self.options));
        }
    }
}
