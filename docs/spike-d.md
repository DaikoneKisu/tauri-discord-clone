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

## Finding 3 — a raw `cargo build --target` does not configure the Android toolchain

With `ANDROID_NDK_HOME` set, webrtc-sys got past the NDK lookup and failed
further in, inside cc-rs:

```
error occurred in cc-rs: failed to find tool "aarch64-linux-android-clang++"
```

cc-rs looks for an unsuffixed wrapper. The NDK only ships wrappers versioned
by API level (`aarch64-linux-android24-clang++`, matching our `minSdk`), and
its `bin` directory is not on `PATH`.

`tauri android build` wires all of this up itself, which is why the local runs
never hit it — only CI, which calls cargo directly for the `--lib` check. The
job now exports `CC_`, `CXX_`, `AR_` and
`CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER` for the target explicitly.

## Results — all five native targets build

| Target | Status | Where | Notes |
|---|---|---|---|
| `x86_64-pc-windows-msvc` | ✅ builds and links | local + CI | locally needs a short `CARGO_TARGET_DIR` |
| `aarch64-apple-darwin` | ✅ builds and links | CI | confirms the `-ObjC` rustflag |
| `aarch64-apple-ios` | ✅ builds | CI | staticlib for device |
| `x86_64-unknown-linux-gnu` | ✅ builds and links | CI | clang 21 from apt.llvm.org on Ubuntu 24.04 |
| `aarch64-linux-android` | ✅ builds | CI | needs the cross toolchain exported, see finding 3 |

**Verdict: LiveKit stands.** Nothing in the build story rules it out, and every
failure along the way was environment setup rather than the dependency itself.

### What it costs

| | Baseline | With `native-rtc` |
|---|---:|---:|
| `harmony.exe` (dev) | 14 MB | **34 MB** |
| cold build, Windows | 2m14s | **8m01s** |
| `target/` per platform | ~0.6 GB | **4.6–5.9 GB** |

The per-target disk figure is the one that bites: a machine building two
targets locally needs well over 10 GB free. CI caching via `Swatinem/rust-cache`
absorbs the rebuild cost but not the disk.

## Settled — the release profile is fine

`panic = "abort"` and `lto = true` build cleanly with the native stack linked.
libwebrtc ships compiled with `-D_HAS_EXCEPTIONS=0`, so there is no C++
unwinding to interfere with in the first place.

The stripped release binary is **3.5 MB** — against 34 MB unstripped in dev.
Linking libwebrtc costs far less than the dev-profile figure suggests.

One behavioural consequence to keep in mind rather than a build problem: under
`abort`, a panic in any tokio task takes the whole process down instead of
failing a single call. For a voice app that turns a malformed packet into a
closed window. If that trade stops being worth a few hundred KB, the flag is
ours to drop — Tauri does not require it.

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
