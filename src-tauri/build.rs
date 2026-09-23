fn main() {
    link_libmpv();
    tauri_build::build()
}

/// libmpv2-sys emits `rustc-link-lib=mpv`. On Linux the system (development)
/// or bundled (release, see scripts/setup-libmpv.mjs --bundle) copy is found
/// through the default search path; on Windows `npm run setup:libmpv` puts
/// `mpv.lib` and `libmpv-2.dll` in `lib/windows/`.
fn link_libmpv() {
    let manifest_dir = std::path::PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();

    if target_os == "linux" {
        let bundled = manifest_dir.join("lib").join("linux");
        if bundled.join("libmpv.so").exists() {
            println!("cargo:rustc-link-search=native={}", bundled.display());
        }
        // Release packages install libmpv to /usr/lib/grid (deb/rpm) or next to
        // the AppImage's other libraries. The system path is still searched
        // after these, which is what local development relies on.
        println!("cargo:rustc-link-arg-bins=-Wl,-rpath,$ORIGIN/../lib/grid");
        println!("cargo:rustc-link-arg-bins=-Wl,-rpath,$ORIGIN/../lib");
        println!("cargo:rerun-if-changed=lib/linux");
    }

    if target_os == "windows" {
        let dir = manifest_dir.join("lib").join("windows");
        if !dir.join("mpv.lib").exists() {
            panic!(
                "libmpv is missing: run `npm run setup:libmpv` first ({} has no mpv.lib)",
                dir.display()
            );
        }
        println!("cargo:rustc-link-search=native={}", dir.display());
        // The loader looks next to the executable: copy the DLL beside every
        // binary cargo produces (the app and the test harnesses in deps/).
        let out_dir = std::path::PathBuf::from(std::env::var("OUT_DIR").unwrap());
        if let Some(profile_dir) = out_dir.ancestors().nth(3) {
            for target in [profile_dir.to_path_buf(), profile_dir.join("deps")] {
                let _ = std::fs::create_dir_all(&target);
                std::fs::copy(dir.join("libmpv-2.dll"), target.join("libmpv-2.dll"))
                    .expect("copy libmpv-2.dll next to the binaries");
            }
        }
        println!("cargo:rerun-if-changed=lib/windows");
    }
}
