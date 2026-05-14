fn main() {
    tauri_build::build();
    build_nuspell_wrapper();
}

fn build_nuspell_wrapper() {
    let mut build = cc::Build::new();
    build.cpp(true).std("c++17");
    build.file("src/spellcheck/wrapper.cpp");

    #[cfg(target_os = "windows")]
    {
        let lib = vcpkg::Config::new()
            .emit_includes(true)
            .probe("nuspell")
            .expect(
                "nuspell not found via vcpkg.\n\
                 Please run: vcpkg install nuspell:x64-windows-static-md\n\
                 and set VCPKG_ROOT to your vcpkg installation.",
            );
        for path in &lib.include_paths {
            build.include(path);
        }
        // Link C++ runtime (MSVC links it automatically via vcpkg)
    }

    #[cfg(not(target_os = "windows"))]
    {
        let lib = pkg_config::probe_library("nuspell").expect(
            "nuspell not found via pkg-config.\n\
             Install with: sudo apt install libnuspell-dev  (Debian/Ubuntu)\n\
             or:           brew install nuspell              (macOS)",
        );
        for path in &lib.include_paths {
            build.include(path);
        }
        // Link standard C++ library on non-Windows platforms
        #[cfg(target_os = "macos")]
        println!("cargo:rustc-link-lib=c++");
        #[cfg(not(target_os = "macos"))]
        println!("cargo:rustc-link-lib=stdc++");
    }

    build.compile("nuspell_wrapper");
    println!("cargo:rerun-if-changed=src/spellcheck/wrapper.cpp");
    println!("cargo:rerun-if-changed=src/spellcheck/wrapper.h");
}
