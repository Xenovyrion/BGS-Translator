pub mod commands;

// ── Native FFI (only compiled when nuspell was found by build.rs) ─────────────

#[cfg(nuspell_available)]
mod ffi {
    use std::os::raw::{c_char, c_int};

    #[repr(C)]
    pub struct NuspellDictOpaque {
        _data: [u8; 0],
        _marker: core::marker::PhantomData<(*mut u8, core::marker::PhantomPinned)>,
    }

    extern "C" {
        pub fn nuspell_load(aff_path: *const c_char) -> *mut NuspellDictOpaque;
        pub fn nuspell_free(dict: *mut NuspellDictOpaque);
        pub fn nuspell_spell(dict: *const NuspellDictOpaque, word: *const c_char) -> c_int;
        pub fn nuspell_suggest(
            dict: *const NuspellDictOpaque,
            word: *const c_char,
            count_out: *mut c_int,
        ) -> *mut *mut c_char;
        pub fn nuspell_free_suggestions(suggestions: *mut *mut c_char, count: c_int);
    }
}

// ── Safe Spellchecker wrapper (only when nuspell is available) ────────────────

#[cfg(nuspell_available)]
pub struct Spellchecker {
    ptr: *mut ffi::NuspellDictOpaque,
}

#[cfg(nuspell_available)]
unsafe impl Send for Spellchecker {}

#[cfg(nuspell_available)]
unsafe impl Sync for Spellchecker {}

#[cfg(nuspell_available)]
impl Spellchecker {
    pub fn load(aff_path: &std::path::Path) -> Result<Self, String> {
        use std::ffi::CString;
        let path_str = aff_path
            .to_str()
            .ok_or_else(|| "Dictionary path contains invalid UTF-8".to_string())?;
        let c_path = CString::new(path_str).map_err(|e| e.to_string())?;
        let ptr = unsafe { ffi::nuspell_load(c_path.as_ptr()) };
        if ptr.is_null() {
            Err(format!("Failed to load dictionary: {}", aff_path.display()))
        } else {
            Ok(Self { ptr })
        }
    }

    pub fn spell(&self, word: &str) -> bool {
        use std::ffi::CString;
        let Ok(c) = CString::new(word) else { return true };
        unsafe { ffi::nuspell_spell(self.ptr, c.as_ptr()) != 0 }
    }

    pub fn suggest(&self, word: &str) -> Vec<String> {
        use std::ffi::{CStr, CString};
        use std::os::raw::c_int;
        let Ok(c) = CString::new(word) else { return vec![] };
        let mut count: c_int = 0;
        let raw = unsafe { ffi::nuspell_suggest(self.ptr, c.as_ptr(), &mut count) };
        if raw.is_null() || count == 0 {
            return vec![];
        }
        let mut out = Vec::with_capacity(count as usize);
        for i in 0..count as usize {
            let s = unsafe { CStr::from_ptr(*raw.add(i)) };
            out.push(s.to_string_lossy().into_owned());
        }
        unsafe { ffi::nuspell_free_suggestions(raw, count) };
        out
    }
}

#[cfg(nuspell_available)]
impl Drop for Spellchecker {
    fn drop(&mut self) {
        unsafe { ffi::nuspell_free(self.ptr) };
    }
}
