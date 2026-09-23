//! The controller's shape on platforms without libmpv (macOS).
//!
//! Uninhabited: `NativePlayerState` never hands one out there, so every method
//! is unreachable by construction. It exists only so the native commands in
//! `lib.rs` compile unchanged; keep the signatures in step with
//! `controller::Controller` for the methods `lib.rs` calls.

use super::model::{Playback, PlayerEvent};
use tokio::sync::mpsc::UnboundedReceiver;

#[derive(Clone)]
pub enum Controller {}

impl Controller {
    pub async fn load(
        &self,
        _url: &str,
        _start_seconds: f64,
        _subtitle_files: &[String],
    ) -> Result<(Playback, UnboundedReceiver<PlayerEvent>), String> {
        match *self {}
    }

    pub fn set_tracks(&self, _aid: Option<i64>, _sid: Option<i64>) -> Result<(), String> {
        match *self {}
    }

    pub fn set_paused(&self, _paused: bool) -> Result<(), String> {
        match *self {}
    }

    pub fn seek(&self, _seconds: f64) -> Result<(), String> {
        match *self {}
    }

    pub fn set_volume(&self, _percent: f64) -> Result<(), String> {
        match *self {}
    }

    pub fn set_audio_track(&self, _id: Option<i64>) -> Result<(), String> {
        match *self {}
    }

    pub fn set_subtitle_track(&self, _id: Option<i64>) -> Result<(), String> {
        match *self {}
    }

    pub fn stop(&self) {
        match *self {}
    }
}
