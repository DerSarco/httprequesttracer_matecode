use std::{
    net::SocketAddr,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use hudsucker::{
    certificate_authority::RcgenAuthority,
    hyper::{header::HeaderMap, Request, Response},
    rcgen::{Issuer, KeyPair},
    rustls::crypto::aws_lc_rs,
    Body, HttpContext, HttpHandler, Proxy, RequestOrResponse,
};
use serde::Serialize;
use tokio::sync::oneshot;

use super::cert::CaBundlePaths;

const DEFAULT_MAX_CAPTURED_REQUESTS: usize = 1_500;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HeaderEntry {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedExchange {
    pub id: u64,
    pub started_at_unix_ms: u64,
    pub duration_ms: u64,
    pub method: String,
    pub url: String,
    pub host: String,
    pub path: String,
    pub status_code: u16,
    pub request_headers: Vec<HeaderEntry>,
    pub response_headers: Vec<HeaderEntry>,
}

#[derive(Debug, Default)]
pub struct CaptureStore {
    entries: Vec<CapturedExchange>,
}

impl CaptureStore {
    pub fn snapshot(&self) -> Vec<CapturedExchange> {
        self.entries.clone()
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    fn push(&mut self, entry: CapturedExchange, max_entries: usize) {
        self.entries.push(entry);
        if self.entries.len() > max_entries {
            let overflow = self.entries.len() - max_entries;
            self.entries.drain(0..overflow);
        }
    }
}

pub type SharedCaptureStore = Arc<Mutex<CaptureStore>>;

pub struct ProxyRuntime {
    shutdown_tx: Option<oneshot::Sender<()>>,
    task: tauri::async_runtime::JoinHandle<()>,
}

impl ProxyRuntime {
    pub async fn stop(mut self) {
        if let Some(shutdown_tx) = self.shutdown_tx.take() {
            let _ = shutdown_tx.send(());
        }
        let _ = self.task.await;
    }
}

pub async fn start_proxy(
    bind_host: &str,
    bind_port: u16,
    ca_bundle: &CaBundlePaths,
    store: SharedCaptureStore,
) -> Result<ProxyRuntime, String> {
    let socket_addr = format!("{bind_host}:{bind_port}")
        .parse::<SocketAddr>()
        .map_err(|_| "Invalid proxy bind address".to_string())?;

    let listener = tokio::net::TcpListener::bind(socket_addr)
        .await
        .map_err(|err| format!("Failed to bind local proxy {socket_addr}: {err}"))?;

    let key_pem = std::fs::read_to_string(&ca_bundle.key_pem)
        .map_err(|err| format!("Failed to read CA key: {err}"))?;
    let cert_pem = std::fs::read_to_string(&ca_bundle.cert_pem)
        .map_err(|err| format!("Failed to read CA certificate: {err}"))?;

    let key_pair = KeyPair::from_pem(&key_pem).map_err(|err| format!("Invalid CA key: {err}"))?;
    let issuer = Issuer::from_ca_cert_pem(&cert_pem, key_pair)
        .map_err(|err| format!("Invalid CA certificate: {err}"))?;

    let ca = RcgenAuthority::new(issuer, 1_000, aws_lc_rs::default_provider());
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();

    let proxy = Proxy::builder()
        .with_listener(listener)
        .with_ca(ca)
        .with_rustls_connector(aws_lc_rs::default_provider())
        .with_http_handler(CaptureHandler::new(store))
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.await;
        })
        .build()
        .map_err(|err| format!("Failed to build MITM proxy: {err}"))?;

    let task = tauri::async_runtime::spawn(async move {
        let _ = proxy.start().await;
    });

    Ok(ProxyRuntime {
        shutdown_tx: Some(shutdown_tx),
        task,
    })
}

#[derive(Clone)]
struct CaptureHandler {
    store: SharedCaptureStore,
    sequence: Arc<AtomicU64>,
    pending: Option<PendingExchange>,
}

impl CaptureHandler {
    fn new(store: SharedCaptureStore) -> Self {
        Self {
            store,
            sequence: Arc::new(AtomicU64::new(0)),
            pending: None,
        }
    }
}

impl HttpHandler for CaptureHandler {
    async fn handle_request(
        &mut self,
        _ctx: &HttpContext,
        req: Request<Body>,
    ) -> RequestOrResponse {
        let id = self.sequence.fetch_add(1, Ordering::Relaxed) + 1;
        let uri = req.uri();
        let path = uri
            .path_and_query()
            .map(|value| value.as_str().to_string())
            .unwrap_or_else(|| uri.path().to_string());
        let pending = PendingExchange {
            id,
            started_at_unix_ms: now_unix_ms(),
            started_at_instant: Instant::now(),
            method: req.method().to_string(),
            url: uri.to_string(),
            host: uri.host().unwrap_or_default().to_string(),
            path,
            request_headers: collect_headers(req.headers()),
        };

        self.pending = Some(pending);
        req.into()
    }

    async fn handle_response(&mut self, _ctx: &HttpContext, res: Response<Body>) -> Response<Body> {
        if let Some(pending) = self.pending.take() {
            let captured = CapturedExchange {
                id: pending.id,
                started_at_unix_ms: pending.started_at_unix_ms,
                duration_ms: pending.started_at_instant.elapsed().as_millis() as u64,
                method: pending.method,
                url: pending.url,
                host: pending.host,
                path: pending.path,
                status_code: res.status().as_u16(),
                request_headers: pending.request_headers,
                response_headers: collect_headers(res.headers()),
            };

            if let Ok(mut store) = self.store.lock() {
                store.push(captured, DEFAULT_MAX_CAPTURED_REQUESTS);
            }
        }

        res
    }
}

#[derive(Clone)]
struct PendingExchange {
    id: u64,
    started_at_unix_ms: u64,
    started_at_instant: Instant,
    method: String,
    url: String,
    host: String,
    path: String,
    request_headers: Vec<HeaderEntry>,
}

fn collect_headers(headers: &HeaderMap) -> Vec<HeaderEntry> {
    headers
        .iter()
        .map(|(name, value)| HeaderEntry {
            name: name.as_str().to_string(),
            value: String::from_utf8_lossy(value.as_bytes()).to_string(),
        })
        .collect()
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}
