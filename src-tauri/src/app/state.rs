use std::sync::{atomic::AtomicBool, Arc, Mutex};

use crate::tracer::{
    core_proxy::{
        CaptureStore, InterceptionController, ProxyRuntime, SharedCaptureStore,
        SharedInterceptionController,
    },
    session::TraceSession,
};

pub struct AppState {
    pub session: Mutex<TraceSession>,
    pub proxy_runtime: Mutex<Option<ProxyRuntime>>,
    pub capture_store: SharedCaptureStore,
    pub interception_controller: SharedInterceptionController,
    pub shutdown_in_progress: AtomicBool,
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
            shutdown_in_progress: AtomicBool::new(false),
        }
    }
}
