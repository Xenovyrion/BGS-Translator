use std::ffi::{CStr, CString};
use std::os::raw::{c_char, c_int};
use std::path::Path;

pub mod commands;

// ── FFI declarations ──────────────────────────────────────────────────────────

#[repr(C)]
struct NuspellDictOpaque {
    _data: [u8; 0],
    _marker: core::marker::PhantomData<(*mut u8, core::marker::PhantomPinned)>,
}

extern "C" {
    fn nuspell_load(aff_path: *const c_char) -> *mut NuspellDictOpaque;
    fn nuspell_free(dict: *mut NuspellDictOpaque);
    fn nuspell_spell(dict: *const NuspellDictOpaque, word: *const c_char) -> c_int;
    fn nuspell_suggest(
        dict: *const NuspellDictOpaque,
        word: *const c_char,
        count_out: *mut c_int,
    ) -> *mut *mut c_char;
    fn nuspell_free_suggestions(suggestions: *mut *mut c_char, count: c_int);
}

// ── Safe Rust wrapper ─────────────────────────────────────────────────────────

pub struct Spellchecker {
    ptr: *mut NuspellDictOpaque,
}

// SAFETY: Nuspell dictionaries are immutable after loading; all mutation is
// protected by the Mutex in SpellState (commands.rs).
unsafe impl Send for Spellchecker {}
unsafe impl Sync for Spellchecker {}

impl Spellchecker {
    pub fn load(aff_path: &Path) -> Result<Self, String> {
        let path_str = aff_path
            .to_str()
            .ok_or_else(|| "Dictionary path contains invalid UTF-8".to_string())?;
        let c_path =
            CString::new(path_str).map_err(|e| format!("Path contains null byte: {e}"))?;

        let ptr = unsafe { nuspell_load(c_path.as_ptr()) };
        if ptr.is_null() {
            Err(format!(
                "Failed to load dictionary: {}",
                aff_path.display()
            ))
        } else {
            Ok(Self { ptr })
        }
    }

    pub fn spell(&self, word: &str) -> bool {
        let Ok(c_word) = CString::new(word) else {
            return true; // treat unencodable words as correct
        };
        unsafe { nuspell_spell(self.ptr, c_word.as_ptr()) != 0 }
    }

    pub fn suggest(&self, word: &str) -> Vec<String> {
        let Ok(c_word) = CString::new(word) else {
            return vec![];
        };
        let mut count: c_int = 0;
        let raw = unsafe { nuspell_suggest(self.ptr, c_word.as_ptr(), &mut count) };
        if raw.is_null() || count == 0 {
            return vec![];
        }
        let mut out = Vec::with_capacity(count as usize);
        for i in 0..count as usize {
            let s = unsafe { CStr::from_ptr(*raw.add(i)) };
            out.push(s.to_string_lossy().into_owned());
        }
        unsafe { nuspell_free_suggestions(raw, count) };
        out
    }
}

impl Drop for Spellchecker {
    fn drop(&mut self) {
        unsafe { nuspell_free(self.ptr) };
    }
}
