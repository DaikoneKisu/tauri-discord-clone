//! Spike D: force a real link against the LiveKit client and libwebrtc.
//!
//! Depending on a crate is not enough to prove it links — the linker happily
//! drops a static library nothing references. This module touches enough of
//! the API to pull libwebrtc symbols into the binary, which is what the spike
//! is actually testing. It is throwaway; the real backend replaces it.

use livekit::options::TrackPublishOptions;
use livekit::webrtc::native::audio_resampler::AudioResampler;
use livekit::RoomOptions;

/// Builds a few native objects and reports what was constructed.
///
/// `AudioResampler` is deliberately chosen: it lives on the other side of the
/// C++ FFI, so constructing one proves libwebrtc itself is linked and
/// loadable, not merely that the Rust wrapper compiled.
pub fn describe() -> String {
    let options = RoomOptions::default();
    let publish = TrackPublishOptions::default();

    // Constructing this allocates through the C++ layer.
    let mut resampler = AudioResampler::default();
    let resampled = resampler.remix_and_resample(&[0i16; 480], 480, 1, 48_000, 1, 16_000);

    format!(
        "livekit linked — adaptive_stream={} dynacast={} source={:?} resampler_out={} samples",
        options.adaptive_stream,
        options.dynacast,
        publish.source,
        resampled.len(),
    )
}
