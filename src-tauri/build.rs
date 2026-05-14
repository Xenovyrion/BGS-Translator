fn main() {
    tauri_build::build();
    // Declare the custom cfg so the compiler doesn't warn about unknown keys
    println!("cargo::rustc-check-cfg=cfg(nuspell_available)");
    // Re-run build.rs whenever these env vars change so cargo picks up vcpkg
    println!("cargo:rerun-if-env-changed=VCPKG_ROOT");
    println!("cargo:rerun-if-env-changed=VCPKGRS_TRIPLET");
    println!("cargo:rerun-if-env-changed=VCPKGRS_DYNAMIC");
    build_nuspell_wrapper();
}

/// Try to find nuspell include paths.
/// Returns Some(paths) on success, None when the library is not installed.
#[cfg(target_os = "windows")]
fn find_nuspell_includes() -> Option<Vec<std::path::PathBuf>> {
    vcpkg::Config::new()
        .emit_includes(true)
        .probe("nuspell")
        .ok()
        .map(|lib| lib.include_paths)
}

#[cfg(not(target_os = "windows"))]
fn find_nuspell_includes() -> Option<Vec<std::path::PathBuf>> {
    pkg_config::probe_library("nuspell")
        .ok()
        .map(|lib| lib.include_paths)
}

fn build_nuspell_wrapper() {
    match find_nuspell_includes() {
        Some(include_paths) => {
            let mut build = cc::Build::new();
            build.cpp(true).std("c++17");
            for path in &include_paths {
                build.include(path);
            }
            build.file("src/spellcheck/wrapper.cpp").compile("nuspell_wrapper");

            // Signal to the Rust code that the native library is present
            println!("cargo:rustc-cfg=nuspell_available");
            println!("cargo:rerun-if-changed=src/spellcheck/wrapper.cpp");
            println!("cargo:rerun-if-changed=src/spellcheck/wrapper.h");

            #[cfg(target_os = "macos")]
            println!("cargo:rustc-link-lib=c++");
            #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
            println!("cargo:rustc-link-lib=stdc++");
        }
        None => {
            println!("cargo:warning=nuspell not found — spell check will be disabled at runtime");
            println!("cargo:warning=  Windows : vcpkg install nuspell:x64-windows-static-md  (+ set VCPKG_ROOT)");
            println!("cargo:warning=  Linux   : sudo apt install libnuspell-dev");
            println!("cargo:warning=  macOS   : brew install nuspell");
        }
    }
}
