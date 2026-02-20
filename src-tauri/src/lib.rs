mod tracer;

use std::sync::{Arc, Mutex};

use tauri::State;
use tracer::{
    adb::AdbStatus,
    cert::CertificateSetupResult,
    mitm::{CaptureStore, CapturedExchange, ProxyRuntime, SharedCaptureStore},
    session::{TraceSession, TraceSessionSnapshot},
};

struct AppState {
    session: Mutex<TraceSession>,
    proxy_runtime: Mutex<Option<ProxyRuntime>>,
    capture_store: SharedCaptureStore,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            session: Mutex::new(TraceSession::default()),
            proxy_runtime: Mutex::new(None),
            capture_store: Arc::new(Mutex::new(CaptureStore::default())),
        }
    }
}

#[tauri::command]
fn get_adb_status() -> Result<AdbStatus, String> {
    tracer::adb::get_adb_status()
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
fn prepare_certificate_install(
    emulator_serial: String,
    state: State<'_, AppState>,
) -> Result<CertificateSetupResult, String> {
    if emulator_serial.trim().is_empty() {
        return Err("Select an emulator before preparing certificate install".to_string());
    }

    tracer::adb::ensure_adb_available()?;
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

    tracer::adb::ensure_adb_available()?;
    let ca_bundle = tracer::cert::ensure_ca_bundle()?;

    {
        let mut store = state
            .capture_store
            .lock()
            .map_err(|_| "Unable to access captured requests".to_string())?;
        store.clear();
    }

    let runtime = tracer::mitm::start_proxy(
        "0.0.0.0",
        proxy_port,
        &ca_bundle,
        state.capture_store.clone(),
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
    if let Err(err) = tracer::adb::set_emulator_proxy(&emulator_serial, &proxy_address) {
        let runtime_to_stop = state
            .proxy_runtime
            .lock()
            .ok()
            .and_then(|mut guard| guard.take());
        if let Some(runtime) = runtime_to_stop {
            runtime.stop().await;
        }
        return Err(err);
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

    let emulator_serial = {
        let session = state
            .session
            .lock()
            .map_err(|_| "Unable to access tracing state".to_string())?;
        session.emulator_serial.clone()
    };

    let mut clear_proxy_error = None;
    if let Some(emulator_serial) = emulator_serial {
        if let Err(err) = tracer::adb::clear_emulator_proxy(&emulator_serial) {
            clear_proxy_error = Some(err);
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
            prepare_certificate_install,
            start_tracing,
            stop_tracing
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
