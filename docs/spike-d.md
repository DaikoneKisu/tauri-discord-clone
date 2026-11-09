# Spike D — does the native RTC stack build everywhere?

Running record. The question: can `livekit` (and libwebrtc under it) be built
for all five native targets? This is the spike that can invalidate the LiveKit
decision in [`rtc-research.md`](rtc-research.md), so it runs before any work
that assumes the answer is yes.

## Setup

- `livekit 0.10.1` is an **optional** dependency behind the `native-rtc`
  feature, so the scaffold keeps building in ~2.5 min without it.
- `.cargo/config.toml` carries the rustflags the SDK requires. They are not
  feature-conditional — cargo has no such mechanism — so they apply to every
  build. The baseline (`cargo check`, no feature) was verified to still pass
  under them: **2m32s, clean**.
- `src/rtc/livekit_probe.rs` constructs an `AudioResampler`, which lives on the
  far side of the C++ FFI. Depending on a crate does not prove it links; the
  linker will happily drop a static library nothing references.

## Finding 1 — Windows MAX_PATH breaks the build, and it is not LiveKit's fault

First attempt failed after 399 s. `cl.exe` could not open four abseil headers:

```
absl/base/internal/iterator_traits.h
absl/functional/internal/any_invocable.h
absl/strings/internal/str_format/arg.h
absl/strings/internal/stringify_sink.h
```

The headers are present on disk. The problem is their path length:

| Header | Chars | Result |
|---|---:|---|
| `absl/strings/str_cat.h` | 246 | compiles |
| `absl/base/internal/iterator_traits.h` | **260** | fails |
| `absl/strings/internal/stringify_sink.h` | **262** | fails |
| `absl/strings/internal/str_format/arg.h` | **262** | fails |

The cutoff is exactly Windows' 260-character `MAX_PATH`, and
`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled` is `0x0`.
The repo's own prefix spends 80 characters before libwebrtc's extracted
artifact even starts:

```
C:\Users\<user>\orca\workspaces\tauri-discord-clone\Experimenting\src-tauri\target
  build\scratch-<hash>\out\livekit_webrtc\livekit\win-x64-release-webrtc-<hash>\
  win-x64-release\include\third_party\abseil-cpp\absl\...
```

**Fix:** build with a short target directory.

```bash
CARGO_TARGET_DIR=C:\lk cargo build --features native-rtc
```

That reclaims ~75 characters and brings the artifact's longest path (280) down
to ~205.

Two things worth knowing:

- Setting `LongPathsEnabled=1` would **not** have fixed this. `cl.exe` is not
  long-path aware even when the OS permits long paths.
- This is Windows-only. Linux and macOS runners would never have reproduced it,
  so CI alone would have left this landmine for whoever cloned the repo into a
  deep path. Worth the cost of running the spike locally first.

Everything before the C++ compile worked: the prebuilt artifact
(`win-x64-release-webrtc-a545de4`) downloaded, bindgen ran, and the cxx bridge
generated. The failure was narrow.

## Finding 2 — webrtc-sys and Tauri disagree on the NDK env var

The Android attempt failed after 512 s:

```
thread 'main' panicked at webrtc-sys-0.3.53/build.rs:379:
  called `Result::unwrap()` on an `Err` value: Failed to locate Android NDK toolchain
  Caused by: Android NDK not found, please set ANDROID_NDK_HOME to your NDK path
```

Tauri's CLI reads **`NDK_HOME`**; webrtc-sys's build script reads
**`ANDROID_NDK_HOME`**. They are not interchangeable, and setting only the one
Tauri documents gets you a panic that never mentions Tauri. Export both.

What this failure does *not* tell us: webrtc-sys never reached its C++ compile,
so cross-compiling libwebrtc to Android from a Windows host remains **unproven**.
The `livekit-*` crates visible in the log at that moment were pure-Rust
dependencies building in parallel — not evidence of progress on the C++ side.

The prebuilt Android artifact did download
(`android-arm64-release-webrtc-a545de4` appears in the emitted
`rustc-link-search`), so artifact resolution for the target works.

## Results

| Target | Status | Time | Notes |
|---|---|---|---|
| `x86_64-pc-windows-msvc` | ✅ builds and links | 481 s cold | with short `CARGO_TARGET_DIR` |
| `aarch64-linux-android` | ⚠️ blocked on env, not retried | 512 s to failure | needs `ANDROID_NDK_HOME`; C++ compile still unproven |
| `x86_64-unknown-linux-gnu` | not run | — | needs clang 21+; Ubuntu 24.04 in CI |
| `aarch64-apple-darwin` | not run | — | CI only |
| `aarch64-apple-ios` | not run | — | CI only |

### Size cost on Windows (dev profile)

| | Baseline | With `native-rtc` |
|---|---:|---:|
| `harmony.exe` | 14 MB | **34 MB** |
| cold build | 2m32s (`check`) / 2m14s (`build`) | **8m01s** |

The shipped artifact contributes `webrtc.lib` at 86 MB, and webrtc-sys's own
cxx bridge compiles to a 107 MB static lib. Those are intermediates; only
~20 MB reaches the binary, and release with LTO and `strip` will cut further.

## Open question — `panic = "abort"`

`Cargo.toml` sets `panic = "abort"` for the release profile. These builds use
the dev profile, so it is untested. `cxx` and libwebrtc may need unwinding;
a release build has to pass before Spike D can be called done.
