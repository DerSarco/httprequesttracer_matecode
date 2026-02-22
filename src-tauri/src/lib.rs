mod app;
mod tracer;

use app::{
    commands::{
        clear_captured_requests, configure_interception, confirm_app_exit,
        decide_intercept_request, get_adb_status, get_captured_requests, get_interception_state,
        get_session_state, prepare_certificate_install, start_tracing, stop_tracing,
    },
    shutdown::{is_shutdown_in_progress, request_app_exit_confirmation},
    state::AppState,
};
use tauri::{Manager, RunEvent, WindowEvent};

#[cfg(target_os = "macos")]
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};

#[cfg(target_os = "macos")]
const MENU_REQUEST_QUIT_ID: &str = "httptracer.request-quit";

#[cfg(target_os = "macos")]
fn build_macos_menu<R: tauri::Runtime>(app_handle: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    let pkg_info = app_handle.package_info();
    let config = app_handle.config();
    let about_metadata = AboutMetadata {
        name: Some(pkg_info.name.clone()),
        version: Some(pkg_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config.bundle.publisher.clone().map(|p| vec![p]),
        ..Default::default()
    };

    let app_submenu = Submenu::with_items(
        app_handle,
        pkg_info.name.clone(),
        true,
        &[
            &PredefinedMenuItem::about(app_handle, None, Some(about_metadata))?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::services(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::hide(app_handle, None)?,
            &PredefinedMenuItem::hide_others(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &MenuItem::with_id(
                app_handle,
                MENU_REQUEST_QUIT_ID,
                format!("Quit {}", pkg_info.name),
                true,
                Some("CmdOrCtrl+Q"),
            )?,
        ],
    )?;

    let file_submenu = Submenu::with_items(
        app_handle,
        "File",
        true,
        &[&PredefinedMenuItem::close_window(app_handle, None)?],
    )?;

    let edit_submenu = Submenu::with_items(
        app_handle,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app_handle, None)?,
            &PredefinedMenuItem::redo(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::cut(app_handle, None)?,
            &PredefinedMenuItem::copy(app_handle, None)?,
            &PredefinedMenuItem::paste(app_handle, None)?,
            &PredefinedMenuItem::select_all(app_handle, None)?,
        ],
    )?;

    let view_submenu = Submenu::with_items(
        app_handle,
        "View",
        true,
        &[&PredefinedMenuItem::fullscreen(app_handle, None)?],
    )?;

    let window_submenu = Submenu::with_items(
        app_handle,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app_handle, None)?,
            &PredefinedMenuItem::maximize(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::close_window(app_handle, None)?,
        ],
    )?;

    let help_submenu = Submenu::with_items(app_handle, "Help", true, &[])?;

    Menu::with_items(
        app_handle,
        &[
            &app_submenu,
            &file_submenu,
            &edit_submenu,
            &view_submenu,
            &window_submenu,
            &help_submenu,
        ],
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app_handle = window.app_handle();
                if is_shutdown_in_progress(&app_handle) {
                    return;
                }

                api.prevent_close();
                request_app_exit_confirmation(&app_handle);
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_adb_status,
            get_session_state,
            get_captured_requests,
            clear_captured_requests,
            get_interception_state,
            configure_interception,
            decide_intercept_request,
            prepare_certificate_install,
            start_tracing,
            stop_tracing,
            confirm_app_exit
        ]);

    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(|app_handle| build_macos_menu(app_handle))
        .on_menu_event(|app_handle, event| {
            if event.id() == MENU_REQUEST_QUIT_ID {
                request_app_exit_confirmation(app_handle);
            }
        });

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            if !is_shutdown_in_progress(app_handle) {
                api.prevent_exit();
                request_app_exit_confirmation(app_handle);
            }
        }
    });
}
