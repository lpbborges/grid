//! Native playback through one in-process libmpv instance (Linux and Windows).
//!
//! `model` holds what every platform shares: the types the frontend receives,
//! track parsing, and the input validation that gates every load.

pub mod model;

#[cfg(test)]
mod tests {
    #[test]
    fn libmpv_links_and_initialises_headless() {
        let mpv = libmpv2::Mpv::with_initializer(|init| {
            init.set_option("vo", "null")?;
            init.set_option("ao", "null")?;
            Ok(())
        })
        .expect("libmpv initialises");
        let version: String = mpv.get_property("mpv-version").expect("mpv-version");
        assert!(
            version.starts_with("mpv "),
            "unexpected version string {version}"
        );
    }
}
