# Harmony

A Discord clone built on Tauri 2 — one React UI shipping to **six targets**: web,
Windows, macOS, Linux, Android and iOS.

Voice and video are the hard part, and the strategy for them is written up in
[`docs/rtc-research.md`](docs/rtc-research.md). The short version: the webview's
WebRTC cannot serve every target, so the media pipeline lives in Rust and the
frontend talks to it through one narrow domain interface rather than a
reimplemented `RTCPeerConnection`.

## Stack

| Layer | Choice |
|---|---|
| UI | React 19 + TypeScript + Vite 8 |
| Shell | Tauri 2.12 |
| RTC (web) | `livekit-client` over browser WebRTC |
| RTC (native) | Tauri IPC → Rust (LiveKit client crate — not built yet) |
| SFU | LiveKit server, self-hosted |

## Layout

```
src/
  rtc/            the JS↔Rust boundary
    types.ts      RtcClient — the only RTC surface the UI may touch
    web.ts        livekit-client implementation
    native.ts     Tauri IPC implementation (stub)
    index.ts      picks one at runtime via window.isTauri
  ui/             the app shell
src-tauri/
  src/rtc/        native backend (stub)
  Info.plist      microphone/camera usage descriptions (macOS + iOS)
  Info.ios.plist  iOS background audio modes
  Entitlements.plist  macOS hardened-runtime entitlements
  tauri.{linux,macos,windows}.conf.json  per-platform bundle targets
```

The two RTC backends are loaded with dynamic `import()`, so native builds never
download `livekit-client` and web builds never load the Tauri API.

## Running

```bash
pnpm install

pnpm dev            # web target, http://localhost:1420
pnpm build          # static SPA in dist/

pnpm tauri dev      # desktop (current platform)
pnpm tauri build    # desktop bundles

pnpm tauri android dev
pnpm tauri android build --apk

pnpm tauri ios dev     # macOS host only
```

The voice panel at the bottom-left reports what the active backend can do on
the current platform. It is the quickest way to confirm a target is wired up.

## Prerequisites

Desktop needs Rust 1.90+ and Node 20+. Beyond that:

**Android** — the command-line tools are enough; the full Android Studio
install is not required.

```bash
scoop install android-clt            # or Android Studio's SDK Manager

export SKIP_JDK_VERSION_CHECK=1      # see below
sdkmanager "platform-tools" "platforms;android-37.0" \
           "build-tools;37.0.0" "ndk;29.0.14206865"

export ANDROID_HOME=<sdk>
export NDK_HOME=$ANDROID_HOME/ndk/29.0.14206865
export JAVA_HOME=<a JDK 17+>

rustup target add aarch64-linux-android armv7-linux-androideabi \
                  i686-linux-android x86_64-linux-android
```

Three things that cost time if you hit them cold:

> **`JAVA_HOME` must be JDK 17 or newer.** Tauri 2.12's Android template uses
> Gradle 9 and Kotlin 2. An older JDK — a system-wide Java 8 via mise or asdf,
> say — fails during Gradle's configuration phase with an error that never
> mentions Java.

> **Platforms are minor-versioned now.** The package for API 37 is
> `platforms;android-37.0`, not `platforms;android-37`, even though
> `app/build.gradle.kts` says `compileSdk = 37`. Requesting the un-suffixed id
> makes `sdkmanager` abort the *entire* invocation, so nothing installs and the
> only clue is one `Failed to find package` line.

> **`sdkmanager` misreads newer JDK version strings.** On JDK 24 it refuses to
> run with "Java version 17 or higher is required". Set
> `SKIP_JDK_VERSION_CHECK=1`, which is what its own error message suggests.

**Linux** — `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`,
`librsvg2-dev`, `patchelf`. Building with `--features native-rtc` additionally
needs clang 21+, `libglib2.0-dev`, `libclang-dev` and `libjpeg-turbo8-dev`.

**Windows + `--features native-rtc`** — build into a short target directory:

```bash
CARGO_TARGET_DIR=C:\lk cargo build --features native-rtc
```

> libwebrtc's bundled abseil headers sit ~280 characters deep inside
> `target/`, past Windows' 260-character `MAX_PATH`. `cl.exe` then reports
> `Cannot open include file` for headers that are plainly on disk. Enabling
> `LongPathsEnabled` does **not** help — `cl.exe` is not long-path aware.
> See [`docs/spike-d.md`](docs/spike-d.md).

**macOS / iOS** — a macOS host with full Xcode and Cocoapods. These cannot be
cross-compiled from Windows or Linux; CI builds them on `macos-latest`
(see `.github/workflows/build.yml`).

## Permissions

The media permissions each platform needs are declared up front, because the
failure mode when they are missing is silent:

- **macOS** — `NSMicrophoneUsageDescription` in `Info.plist` *and*
  `com.apple.security.device.audio-input` in `Entitlements.plist`. Under the
  hardened runtime, missing either one makes `requestAccessForMediaType` fail
  with no prompt, and the app never appears in System Settings → Privacy.
- **Android** — after `tauri android init`, `gen/android`'s `AndroidManifest.xml`
  needs `RECORD_AUDIO`, `CAMERA`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE`
  and `FOREGROUND_SERVICE_MICROPHONE`. Without `MODIFY_AUDIO_SETTINGS` the
  audio subsystem refuses the microphone and capture fails with
  `NotReadableError` even after the user grants permission. Tauri has no
  mechanism to merge a manifest fragment from `src-tauri`
  ([tauri#16172](https://github.com/tauri-apps/tauri/issues/16172)), so
  `gen/android` is committed and edited directly.
- **iOS** — `UIBackgroundModes: audio` in `Info.ios.plist`, or iOS suspends the
  process and drops the call when the app is backgrounded.
