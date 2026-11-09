mod rtc;

/// Shared entrypoint for every target.
///
/// On desktop this is called from `main.rs`. On Android and iOS the
/// `mobile_entry_point` attribute generates the glue the platform runtime
/// calls instead — which is why the real setup must live here and not in
/// `main.rs`.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    // Mobile updates come from the store, so the plugin is desktop-only.
    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .invoke_handler(tauri::generate_handler![rtc::rtc_backend_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
