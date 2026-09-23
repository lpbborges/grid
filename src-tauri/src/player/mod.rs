//! Native playback through one in-process libmpv instance (Linux and Windows).
//!
//! `model` holds what every platform shares: the types the frontend receives,
//! track parsing, and the input validation that gates every load.

pub mod model;
