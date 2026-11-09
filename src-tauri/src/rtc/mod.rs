//! Native RTC backend.
//!
//! The media pipeline is not built yet. What exists is the IPC round-trip the
//! frontend's `rtc/native.ts` exercises on every target, plus — behind the
//! `native-rtc` feature — a link against the LiveKit client crate so Spike D
//! can answer whether libwebrtc builds for all five native targets.

use serde::Serialize;

#[cfg(feature = "native-rtc")]
mod livekit_probe;

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Engine {
    /// No media stack linked at all.
    Stub,
    /// LiveKit client crate is linked in. Says nothing about whether audio
    /// actually flows — see `voice_ready` for that.
    LivekitNative,
}

const ENGINE: Engine = if cfg!(feature = "native-rtc") {
    Engine::LivekitNative
} else {
    Engine::Stub
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackendInfo {
    pub engine: Engine,
    pub platform: &'static str,
    pub arch: &'static str,
    /// True once the native pipeline can actually capture and play audio.
    pub voice_ready: bool,
    /// Spike-D detail: what the linked stack reports about itself.
    pub engine_detail: Option<String>,
}

/// Reports what the native side can currently do.
///
/// The frontend uses this to decide whether to show voice controls as live or
/// disabled, and it doubles as the smoke test that IPC works on a given target.
#[tauri::command]
pub fn rtc_backend_info() -> BackendInfo {
    BackendInfo {
        engine: ENGINE,
        platform: std::env::consts::OS,
        arch: std::env::consts::ARCH,
        // Linking libwebrtc is not the same as having a pipeline. Still false.
        voice_ready: false,

        #[cfg(feature = "native-rtc")]
        engine_detail: Some(livekit_probe::describe()),
        #[cfg(not(feature = "native-rtc"))]
        engine_detail: None,
    }
}
