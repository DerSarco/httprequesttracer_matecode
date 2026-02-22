use std::{collections::HashSet, sync::atomic::Ordering, time::Duration};

use tauri::{Emitter, Manager};

use crate::{app::state::AppState, tracer};

const APP_EXIT_CLEANUP_TIMEOUT_MS: u64 = 8_000;

pub fn is_shutdown_in_progress<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) -> bool {
    let state = app_handle.state::<AppState>();
    state.shutdown_in_progress.load(Ordering::SeqCst)
}

pub fn request_app_exit_confirmation<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) {
    if is_shutdown_in_progress(app_handle) {
        return;
    }

    let _ = app_handle.emit("httptracer://exit-requested", ());
}

pub fn begin_shutdown(app_handle: tauri::AppHandle) {
    let should_cleanup = {
        let state = app_handle.state::<AppState>();
        !state.shutdown_in_progress.swap(true, Ordering::SeqCst)
    };
    if !should_cleanup {
        return;
    }

    tauri::async_runtime::spawn(async move {
        cleanup_on_app_exit(app_handle.clone()).await;
        app_handle.exit(0);
    });
}

async fn cleanup_on_app_exit(app_handle: tauri::AppHandle) {
    let runtime = {
        let state = app_handle.state::<AppState>();
        state
            .proxy_runtime
            .lock()
            .ok()
            .and_then(|mut guard| guard.take())
    };

    if let Some(runtime) = runtime {
        match tokio::time::timeout(Duration::from_millis(2_500), runtime.stop()).await {
            Ok(_) => eprintln!("[shutdown] Local proxy runtime stopped."),
            Err(_) => eprintln!("[shutdown] Timeout while stopping local proxy runtime."),
        }
    }

    let interception_controller = {
        let state = app_handle.state::<AppState>();
        state.interception_controller.clone()
    };
    {
        let mut controller = interception_controller.lock().await;
        controller.clear_pending();
    }

    let app_handle_for_cleanup = app_handle.clone();
    let blocking_cleanup = tauri::async_runtime::spawn_blocking(move || {
        cleanup_emulator_proxy_blocking(&app_handle_for_cleanup)
    });

    match tokio::time::timeout(
        Duration::from_millis(APP_EXIT_CLEANUP_TIMEOUT_MS),
        blocking_cleanup,
    )
    .await
    {
        Ok(Ok(log_lines)) => {
            for line in log_lines {
                eprintln!("{line}");
            }
        }
        Ok(Err(err)) => {
            eprintln!("[shutdown] Failed to join proxy cleanup worker: {err}");
        }
        Err(_) => {
            eprintln!(
                "[shutdown] Proxy cleanup timed out after {} ms.",
                APP_EXIT_CLEANUP_TIMEOUT_MS
            );
        }
    }

    {
        let state = app_handle.state::<AppState>();
        let session_guard = state.session.lock();
        if let Ok(mut session) = session_guard {
            session.stop();
            session.last_error = None;
        }
    }
}

fn cleanup_emulator_proxy_blocking(app_handle: &tauri::AppHandle) -> Vec<String> {
    let mut logs = Vec::new();
    let mut serials = Vec::new();

    let session_serial = {
        let state = app_handle.state::<AppState>();
        state
            .session
            .lock()
            .ok()
            .and_then(|session| session.emulator_serial.clone())
    };
    if let Some(serial) = session_serial {
        serials.push(serial);
    }

    match tracer::adb_controller::get_adb_status() {
        Ok(adb_status) => {
            for emulator in adb_status.emulators {
                serials.push(emulator.serial);
            }
        }
        Err(err) => logs.push(format!(
            "[shutdown] Unable to query ADB status for cleanup targets: {err}"
        )),
    }

    let mut dedup = HashSet::new();
    serials.retain(|serial| dedup.insert(serial.clone()));

    if serials.is_empty() {
        logs.push(
            "[shutdown] No emulator targets found. Skipping proxy cleanup (idempotent)."
                .to_string(),
        );
        return logs;
    }

    for serial in serials {
        match tracer::adb_controller::clear_emulator_proxy(&serial) {
            Ok(()) => logs.push(format!(
                "[shutdown] Emulator proxy cleaned successfully for {serial}."
            )),
            Err(err) => logs.push(format!(
                "[shutdown] Failed to clean emulator proxy for {serial}: {err}"
            )),
        }
    }

    logs
}
