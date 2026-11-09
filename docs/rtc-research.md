# WebRTC strategy

Research conducted 2026-11-07. This is the reasoning behind `src/rtc/`.

## The question

A Discord clone needs voice, camera video and screen sharing on web, Windows,
macOS, Linux, Android and iOS. Tauri gives us one UI across all six — but not
one WebRTC implementation. Which stack do we build on, and where does the
JS/Rust boundary go?

## Finding 1 — the webview's WebRTC cannot cover our targets

| Platform | Webview | `RTCPeerConnection` | `getUserMedia` | `getDisplayMedia` |
|---|---|---|---|---|
| Web | browser | ✅ | ✅ | ✅ |
| Windows | WebView2 (Chromium) | ✅ | ✅ | ✅ |
| macOS | WKWebView | ✅ | ✅ (needs Info.plist + entitlement) | ❌ |
| iOS | WKWebView | ✅ | ✅ | ❌ |
| Android | System WebView | ✅ | ⚠️ permission bugs in wry | ❌ |
| **Linux** | **WebKitGTK** | **❌** | ⚠️ | ❌ |

Two independent blockers:

- **Linux.** WebKitGTK ships WebRTC behind `ENABLE_WEB_RTC`, which follows
  `ENABLE_EXPERIMENTAL_FEATURES` and is therefore off in Ubuntu's
  `libwebkit2gtk-4.1` packages for 24.04 and 26.04. Turning on the
  `enable-webrtc` and `enable-media-stream` settings gets you `getUserMedia`,
  but `RTCPeerConnection` stays `undefined`. Only a self-compiled WebKitGTK
  works, and only under X11.
- **Screen sharing.** WKWebView has no `getDisplayMedia` at all, so macOS and
  iOS require native capture regardless of what we do elsewhere.

Android is viable but not free: wry has an open bug where `onPermissionRequest`
resolves incorrectly and `getUserMedia` hangs, and capture fails with
`NotReadableError` unless `MODIFY_AUDIO_SETTINGS` is in the manifest.

**Conclusion:** with Linux and screen sharing in scope, the media pipeline must
live in Rust. There is no webview-only path.

## Finding 2 — put the boundary at the domain, not at the browser API

The obvious reading of "WebRTC in Rust with a JS shim" is to reimplement
`RTCPeerConnection` in the page and back it with Rust.
[`tauri-plugin-webrtc`](https://github.com/crabnebula-dev/tauri-plugin-webrtc)
does exactly this, and does it well: a standards-compliant
`RTCPeerConnection`/`RTCDataChannel` shim over
[`qrtc`](https://github.com/crabnebula-dev/qrtc), a pure-Rust engine built on
`str0m`, with Opus, AEC3, noise suppression and AGC in Rust, and hybrid
post-quantum DTLS. It is the right tool for its stated problem — filling
WebKitGTK's gap for an app that already speaks browser WebRTC.

It is the wrong layer for us:

- Stacking `livekit-client` on a shim gives JS → shim → IPC → Rust → engine,
  reimplementing a large W3C surface purely as an adapter.
- It still relies on the webview for capture (`getUserMedia`) and on WebCodecs
  for video — precisely what is missing on Linux.
- VP9, AV1 and receive-side simulcast are not implemented yet.

Our boundary is `RtcClient` in `src/rtc/types.ts`: eight domain methods and
four events. A new backend implements those, not a browser specification.

## Finding 3 — LiveKit

An SFU is not optional. A P2P mesh degrades past roughly four participants, and
Discord-style voice channels are persistent rooms.

[LiveKit](https://github.com/livekit/livekit) (Apache-2.0) is a Go SFU built on
Pion, self-hostable as a single binary, and it is the only stack with a
first-class **Rust client** across all our platforms:
[`livekit/rust-sdks`](https://github.com/livekit/rust-sdks) wraps libwebrtc with
prebuilt binaries for Windows, macOS, Linux, iOS and Android, including hardware
codecs (VideoToolbox on Apple, NVENC/AMF on Linux) and an exposed
`AudioProcessingModule` for echo cancellation, noise suppression and AGC.

That last point matters more than it sounds: AEC, jitter buffering and
congestion control are years of work to get right, and they are the difference
between "audio arrives" and "audio is usable with speakers on".

Prior art: [Sivryn](https://github.com/RTBGG/Sivryn), a self-hosted Discord
alternative written in Rust, uses LiveKit for exactly this.

Known build costs, to be confirmed by Spike D: `webrtc-sys` needs **clang 21+**
on Linux (Ubuntu's default 18 is too old) plus `libglib2.0-dev`, `libclang-dev`
and `libjpeg-turbo8-dev`; macOS needs the `-ObjC` linker flag.

## The open problem — getting remote video into the webview

With media in Rust, nothing reaches the page as a `MediaStream`.

**For voice this costs nothing.** Rust captures from the microphone and plays to
the output device; the UI only paints who is speaking. No media crosses IPC.

**For video it does.** Three transports, none of which wins everywhere:

| | Mechanism | Works on | Cost |
|---|---|---|---|
| **C1** | raw I420/BGRA over `ipc::Channel` → WebGL canvas | all six | IPC bandwidth; caps per-tile resolution |
| **C2** | encoded frames → WebCodecs `VideoDecoder` → canvas | WebView2, Android WebView, Safari 26+ | unavailable on iOS < 26, partial on WebKitGTK |
| **C3** | fMP4 over a custom protocol → MSE `<video>` | all six (hardware decode) | ~200–500 ms latency |

WebCodecs **cannot** be the primary path: it only reached Safari in 26.0, and
WebKitGTK's implementation is still landing. Tauri 2 rewrote its IPC layer with
raw binary payloads (`ipc::Response`, `Channel`) specifically for this kind of
streaming, which makes C1 more practical than it would have been on v1.

Working hypothesis, to be measured: **C1 for small camera tiles, C3 for screen
shares**, with C2 as an opt-in upgrade where it exists. Screen capture itself
comes from [`scap`](https://github.com/CapSoftware/scap) (ScreenCaptureKit on
macOS, Windows.Graphics.Capture on Windows, PipeWire on Linux).

## Next: four spikes

| | Spike | Validates | Success criterion |
|---|---|---|---|
| **A** | LiveKit end-to-end on web | signalling, room model, the whole web target | two Chrome tabs in one room, audio + video both ways |
| **B** | Rust native client | the real risk: libwebrtc + cpal + APM | the Windows binary joins Spike A's room and is audible, with no echo on open speakers |
| **C** | video transport to the webview | the open problem above | latency/CPU/RAM table for C1–C3 at 1×720p30 and 4×360p30 |
| ~~**D**~~ | ~~build matrix with `livekit` linked~~ | ~~whether mobile is practical at all~~ | ✅ **done — all five build**, see [`spike-d.md`](spike-d.md) |

Spike D ran first, before anything depended on its answer, because it was the
one that could invalidate LiveKit. It did not: Windows, macOS, iOS, Linux and
Android all build with libwebrtc linked. The cost is ~20 MB on the binary and
~5 GB of `target/` per platform.

Run A next — it is the cheapest and closes the web target entirely.

## Sources

- [tauri-plugin-webrtc](https://github.com/crabnebula-dev/tauri-plugin-webrtc) · [qrtc](https://github.com/crabnebula-dev/qrtc) · [str0m](https://github.com/algesten/str0m)
- [livekit/rust-sdks](https://github.com/livekit/rust-sdks) · [livekit/livekit](https://github.com/livekit/livekit)
- [Functional WebRTC in WebKitGTK on Linux](https://github.com/tauri-apps/tauri/discussions/8426) · [tauri#13143](https://github.com/tauri-apps/tauri/issues/13143)
- [wry#1917 — Android onPermissionRequest](https://github.com/tauri-apps/wry/issues/1917) · [wry#1195 — getUserMedia/getDisplayMedia on macOS](https://github.com/tauri-apps/wry/issues/1195)
- [scap](https://github.com/CapSoftware/scap) · [Sivryn](https://github.com/RTBGG/Sivryn)
