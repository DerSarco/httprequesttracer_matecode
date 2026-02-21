mod tracer;

use std::sync::{Arc, Mutex};

use tauri::State;
use tracer::{
    adb_controller::AdbStatus,
    cert::CertificateSetupResult,
    core_proxy::{
        CaptureStore, CapturedExchange, InterceptDecisionInput, InterceptionConfigInput,
        InterceptionController, InterceptionSnapshot, ProxyRuntime, SharedCaptureStore,
        SharedInterceptionController,
    },
    session::{TraceSession, TraceSessionSnapshot},
};

struct AppState {
    session: Mutex<TraceSession>,
    proxy_runtime: Mutex<Option<ProxyRuntime>>,
    capture_store: SharedCaptureStore,
    interception_controller: SharedInterceptionController,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            session: Mutex::new(TraceSession::default()),
            proxy_runtime: Mutex::new(None),
            capture_store: Arc::new(Mutex::new(CaptureStore::default())),
            interception_controller: Arc::new(tokio::sync::Mutex::new(
                InterceptionController::default(),
            )),
        }
    }
}

#[tauri::command]
fn get_adb_status() -> Result<AdbStatus, String> {
    tracer::adb_controller::get_adb_status()
}

#[tauri::command]
fn get_session_state(state: State<'_, AppState>) -> Result<TraceSessionSnapshot, String> {
    let session = state
        .session
        .lock()
        .map_err(|_| "Unable to access tracing state".to_string())?;

    Ok(session.snapshot())
}

#[tauri::command]
fn get_captured_requests(state: State<'_, AppState>) -> Result<Vec<CapturedExchange>, String> {
    let store = state
        .capture_store
        .lock()
        .map_err(|_| "Unable to access captured requests".to_string())?;
    Ok(store.snapshot())
}

#[tauri::command]
fn clear_captured_requests(state: State<'_, AppState>) -> Result<(), String> {
    let mut store = state
        .capture_store
        .lock()
        .map_err(|_| "Unable to access captured requests".to_string())?;
    store.clear();
    Ok(())
}

#[tauri::command]
async fn get_interception_state(
    state: State<'_, AppState>,
) -> Result<InterceptionSnapshot, String> {
    let controller = state.interception_controller.lock().await;
    Ok(controller.snapshot())
}

#[tauri::command]
async fn configure_interception(
    config: InterceptionConfigInput,
    state: State<'_, AppState>,
) -> Result<InterceptionSnapshot, String> {
    let mut controller = state.interception_controller.lock().await;
    Ok(controller.apply_config(config))
}

#[tauri::command]
async fn decide_intercept_request(
    decision: InterceptDecisionInput,
    state: State<'_, AppState>,
) -> Result<InterceptionSnapshot, String> {
    let mut controller = state.interception_controller.lock().await;
    controller.apply_decision(decision)?;
    Ok(controller.snapshot())
}

#[tauri::command]
fn prepare_certificate_install(
    emulator_serial: String,
    state: State<'_, AppState>,
) -> Result<CertificateSetupResult, String> {
    if emulator_serial.trim().is_empty() {
        return Err("Select an emulator before preparing certificate install".to_string());
    }

    tracer::adb_controller::ensure_adb_available()?;
    let ca_bundle = tracer::cert::ensure_ca_bundle()?;
    let setup_result = tracer::cert::prepare_certificate_install(&emulator_serial, &ca_bundle)?;

    let mut session = state
        .session
        .lock()
        .map_err(|_| "Unable to access tracing state".to_string())?;
    session.ca_certificate_path = Some(ca_bundle.cert_der.to_string_lossy().to_string());

    Ok(setup_result)
}

#[tauri::command]
async fn start_tracing(
    emulator_serial: String,
    proxy_host: String,
    proxy_port: u16,
    state: State<'_, AppState>,
) -> Result<TraceSessionSnapshot, String> {
    if emulator_serial.trim().is_empty() {
        return Err("Select an emulator before starting tracing".to_string());
    }
    if proxy_port == 0 {
        return Err("Proxy port must be between 1 and 65535".to_string());
    }

    let proxy_host = proxy_host.trim();
    if proxy_host.is_empty() {
        return Err("Proxy host cannot be empty".to_string());
    }

    {
        let runtime_guard = state
            .proxy_runtime
            .lock()
            .map_err(|_| "Unable to access proxy runtime".to_string())?;
        if runtime_guard.is_some() {
            return Err("Tracing is already active".to_string());
        }
    }

    tracer::adb_controller::ensure_adb_available()?;
    tracer::adb_controller::ensure_emulator_online(&emulator_serial)?;
    let ca_bundle = tracer::cert::ensure_ca_bundle()?;

    {
        let mut session = state
            .session
            .lock()
            .map_err(|_| "Unable to access tracing state".to_string())?;
        session.last_error = None;
    }

    {
        let mut store = state
            .capture_store
            .lock()
            .map_err(|_| "Unable to access captured requests".to_string())?;
        store.clear();
    }
    {
        let mut controller = state.interception_controller.lock().await;
        controller.clear_pending();
    }

    let runtime = tracer::core_proxy::start_proxy(
        "0.0.0.0",
        proxy_port,
        &ca_bundle,
        state.capture_store.clone(),
        state.interception_controller.clone(),
    )
    .await?;
    let mut runtime_to_register = Some(runtime);
    let already_active = {
        let mut runtime_guard = state
            .proxy_runtime
            .lock()
            .map_err(|_| "Unable to access proxy runtime".to_string())?;
        if runtime_guard.is_some() {
            true
        } else {
            *runtime_guard = runtime_to_register.take();
            false
        }
    };
    if already_active {
        if let Some(runtime) = runtime_to_register {
            runtime.stop().await;
        }
        return Err("Tracing is already active".to_string());
    }

    let proxy_address = format!("{proxy_host}:{proxy_port}");
    if let Err(err) = tracer::adb_controller::set_emulator_proxy(&emulator_serial, &proxy_address) {
        let mut rollback_notes = Vec::new();
        if let Err(clear_err) = tracer::adb_controller::clear_emulator_proxy(&emulator_serial) {
            rollback_notes.push(format!("proxy rollback warning: {clear_err}"));
        }

        let runtime_to_stop = state
            .proxy_runtime
            .lock()
            .ok()
            .and_then(|mut guard| guard.take());
        if let Some(runtime) = runtime_to_stop {
            runtime.stop().await;
        } else {
            rollback_notes.push("local proxy runtime was already stopped".to_string());
        }

        if let Ok(mut session) = state.session.lock() {
            session.stop();
            session.last_error = if rollback_notes.is_empty() {
                Some("Start failed and rollback was applied.".to_string())
            } else {
                Some(format!(
                    "Start failed and rollback completed with warnings: {}",
                    rollback_notes.join(" | ")
                ))
            };
        }

        if rollback_notes.is_empty() {
            return Err(format!(
                "Unable to apply emulator proxy: {err}. Tracing was not started."
            ));
        }
        return Err(format!(
            "Unable to apply emulator proxy: {err}. Rollback completed with warnings: {}",
            rollback_notes.join(" | ")
        ));
    }

    let mut session = state
        .session
        .lock()
        .map_err(|_| "Unable to access tracing state".to_string())?;
    session.start(
        emulator_serial,
        proxy_address,
        ca_bundle.cert_der.to_string_lossy().to_string(),
    );

    Ok(session.snapshot())
}

#[tauri::command]
async fn stop_tracing(state: State<'_, AppState>) -> Result<TraceSessionSnapshot, String> {
    let runtime = {
        let mut runtime_guard = state
            .proxy_runtime
            .lock()
            .map_err(|_| "Unable to access proxy runtime".to_string())?;
        runtime_guard.take()
    };

    if let Some(runtime) = runtime {
        runtime.stop().await;
    }
    {
        let mut controller = state.interception_controller.lock().await;
        controller.clear_pending();
    }

    let emulator_serial = {
        let session = state
            .session
            .lock()
            .map_err(|_| "Unable to access tracing state".to_string())?;
        session.emulator_serial.clone()
    };

    let mut clear_proxy_error = None;
    if let Some(emulator_serial) = emulator_serial {
        if let Err(err) = tracer::adb_controller::clear_emulator_proxy(&emulator_serial) {
            clear_proxy_error = Some(format!(
                "Tracing stopped locally, but failed to clear emulator proxy: {err}"
            ));
        }
    }

    let mut session = state
        .session
        .lock()
        .map_err(|_| "Unable to access tracing state".to_string())?;
    session.stop();
    session.last_error = clear_proxy_error;

    Ok(session.snapshot())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
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
            stop_tracing
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
