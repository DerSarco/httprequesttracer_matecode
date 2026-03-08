use std::{
    collections::{HashMap, VecDeque},
    io::Read,
    net::SocketAddr,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use brotli::Decompressor;
use flate2::read::{GzDecoder, ZlibDecoder};
use http_body_util::{BodyExt, Full};
use hudsucker::{
    certificate_authority::RcgenAuthority,
    hyper::{
        header::{HeaderMap, HeaderName, HeaderValue},
        Method, Request, Response, StatusCode, Uri,
    },
    rcgen::{Issuer, KeyPair},
    rustls::crypto::aws_lc_rs,
    Body, HttpContext, HttpHandler, Proxy, RequestOrResponse,
};
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;

use super::cert::CaBundlePaths;

const DEFAULT_MAX_CAPTURED_REQUESTS: usize = 1_500;
const MAX_BODY_PREVIEW_CHARS: usize = 24_000;
const MAX_EDITABLE_BODY_BYTES: usize = 256 * 1024;
const DEFAULT_INTERCEPT_TIMEOUT_MS: u64 = 12_000;
const MIN_INTERCEPT_TIMEOUT_MS: u64 = 1_000;
const MAX_INTERCEPT_TIMEOUT_MS: u64 = 120_000;
const DEFAULT_MAX_PENDING_INTERCEPTS: usize = 300;

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub request_body: Option<String>,
    pub response_body: Option<String>,
    pub request_body_size: u64,
    pub response_body_size: u64,
    pub intercepted: bool,
    pub intercept_status: Option<String>,
    pub original_method: Option<String>,
    pub original_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingInterceptRequest {
    pub id: u64,
    pub started_at_unix_ms: u64,
    pub method: String,
    pub url: String,
    pub host: String,
    pub path: String,
    pub headers: Vec<HeaderEntry>,
    pub body: Option<String>,
    pub body_size: u64,
    pub status: String,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InterceptionSnapshot {
    pub enabled: bool,
    pub timeout_ms: u64,
    pub rules: Vec<InterceptionRule>,
    pub pending_count: usize,
    pub pending_requests: Vec<PendingInterceptRequest>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterceptionRule {
    pub id: String,
    pub enabled: bool,
    pub host_contains: String,
    pub path_contains: String,
    pub method: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterceptionConfigInput {
    pub enabled: bool,
    pub timeout_ms: Option<u64>,
    pub rules: Option<Vec<InterceptionRule>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InterceptDecisionInput {
    pub request_id: u64,
    pub action: String,
    pub method: Option<String>,
    pub url: Option<String>,
    pub headers: Option<Vec<HeaderEntry>>,
    pub body: Option<String>,
    pub query: Option<String>,
    pub cookies: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct InterceptPatch {
    method: Option<String>,
    url: Option<String>,
    headers: Option<Vec<HeaderEntry>>,
    body: Option<String>,
    query: Option<String>,
    cookies: Option<String>,
}

#[derive(Debug, Clone)]
enum InterceptAction {
    Forward,
    Drop,
}

#[derive(Debug, Clone)]
struct InterceptDecision {
    action: InterceptAction,
    patch: InterceptPatch,
}

struct PendingInterceptInternal {
    snapshot: PendingInterceptRequest,
    tx: oneshot::Sender<InterceptDecision>,
}

pub struct InterceptionController {
    enabled: bool,
    timeout_ms: u64,
    rules: Vec<InterceptionRule>,
    pending_order: VecDeque<u64>,
    pending: HashMap<u64, PendingInterceptInternal>,
}

impl Default for InterceptionController {
    fn default() -> Self {
        Self {
            enabled: false,
            timeout_ms: DEFAULT_INTERCEPT_TIMEOUT_MS,
            rules: Vec::new(),
            pending_order: VecDeque::new(),
            pending: HashMap::new(),
        }
    }
}

impl InterceptionController {
    pub fn snapshot(&self) -> InterceptionSnapshot {
        let pending_requests = self
            .pending_order
            .iter()
            .filter_map(|id| self.pending.get(id).map(|entry| entry.snapshot.clone()))
            .collect::<Vec<_>>();

        InterceptionSnapshot {
            enabled: self.enabled,
            timeout_ms: self.timeout_ms,
            rules: self.rules.clone(),
            pending_count: pending_requests.len(),
            pending_requests,
        }
    }

    pub fn apply_config(&mut self, input: InterceptionConfigInput) -> InterceptionSnapshot {
        self.enabled = input.enabled;
        if let Some(timeout_ms) = input.timeout_ms {
            self.timeout_ms = timeout_ms.clamp(MIN_INTERCEPT_TIMEOUT_MS, MAX_INTERCEPT_TIMEOUT_MS);
        }
        if let Some(rules) = input.rules {
            self.rules = rules
                .into_iter()
                .map(normalize_rule)
                .filter(|rule| !rule.id.trim().is_empty())
                .take(64)
                .collect();
        }
        self.snapshot()
    }

    pub fn clear_pending(&mut self) {
        self.pending.clear();
        self.pending_order.clear();
    }

    fn register_pending(
        &mut self,
        snapshot: PendingInterceptRequest,
        tx: oneshot::Sender<InterceptDecision>,
    ) {
        if self.pending.len() >= DEFAULT_MAX_PENDING_INTERCEPTS {
            if let Some(oldest_id) = self.pending_order.pop_front() {
                let _ = self.pending.remove(&oldest_id);
            }
        }

        self.pending_order.push_back(snapshot.id);
        self.pending
            .insert(snapshot.id, PendingInterceptInternal { snapshot, tx });
    }

    fn remove_pending(&mut self, request_id: u64) {
        self.pending.remove(&request_id);
        self.pending_order.retain(|id| *id != request_id);
    }

    fn should_intercept(&self, method: &str, host: &str, path: &str) -> bool {
        if !self.enabled {
            return false;
        }

        if self.rules.is_empty() {
            return true;
        }

        self.rules.iter().filter(|rule| rule.enabled).any(|rule| {
            if !rule.host_contains.is_empty()
                && !host
                    .to_ascii_lowercase()
                    .contains(&rule.host_contains.to_ascii_lowercase())
            {
                return false;
            }

            if !rule.path_contains.is_empty()
                && !path
                    .to_ascii_lowercase()
                    .contains(&rule.path_contains.to_ascii_lowercase())
            {
                return false;
            }

            if !rule.method.is_empty() && !method.eq_ignore_ascii_case(&rule.method) {
                return false;
            }

            true
        })
    }

    pub fn apply_decision(&mut self, input: InterceptDecisionInput) -> Result<(), String> {
        let action = match input.action.trim().to_ascii_lowercase().as_str() {
            "forward" | "resend" | "send" => InterceptAction::Forward,
            "drop" | "discard" => InterceptAction::Drop,
            _ => {
                return Err("Invalid interception action. Use 'forward' or 'drop'.".to_string());
            }
        };

        let pending = self
            .pending
            .remove(&input.request_id)
            .ok_or_else(|| "Pending intercepted request not found".to_string())?;
        self.pending_order.retain(|id| *id != input.request_id);

        let decision = InterceptDecision {
            action,
            patch: InterceptPatch {
                method: input.method,
                url: input.url,
                headers: input.headers,
                body: input.body,
                query: input.query,
                cookies: input.cookies,
            },
        };

        pending
            .tx
            .send(decision)
            .map_err(|_| "Failed to deliver intercept decision".to_string())
    }
}

pub type SharedInterceptionController = Arc<tokio::sync::Mutex<InterceptionController>>;

#[derive(Debug, Default)]
pub struct CaptureStore {
    entries: VecDeque<CapturedExchange>,
}

impl CaptureStore {
    pub fn snapshot(&self) -> Vec<CapturedExchange> {
        self.entries.iter().cloned().collect()
    }

    pub fn clear(&mut self) {
        self.entries.clear();
    }

    fn push(&mut self, entry: CapturedExchange, max_entries: usize) {
        if max_entries == 0 {
            return;
        }

        if self.entries.len() >= max_entries {
            let _ = self.entries.pop_front();
        }
        self.entries.push_back(entry);
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
    interception: SharedInterceptionController,
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
        .with_http_handler(CaptureHandler::new(store, interception))
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
    interception: SharedInterceptionController,
    sequence: Arc<AtomicU64>,
    pending: Option<PendingExchange>,
}

impl CaptureHandler {
    fn new(store: SharedCaptureStore, interception: SharedInterceptionController) -> Self {
        Self {
            store,
            interception,
            sequence: Arc::new(AtomicU64::new(0)),
            pending: None,
        }
    }

    async fn wait_intercept_decision(
        &self,
        method: &str,
        host: &str,
        path: &str,
        snapshot: PendingInterceptRequest,
    ) -> InterceptWaitResult {
        let request_id = snapshot.id;

        let (timeout_ms, rx) = {
            let mut controller = self.interception.lock().await;
            if !controller.should_intercept(method, host, path) {
                return InterceptWaitResult::Bypass;
            }

            let timeout_ms = controller.timeout_ms;
            let (tx, rx) = oneshot::channel();
            controller.register_pending(snapshot, tx);
            (timeout_ms, rx)
        };

        let timeout = Duration::from_millis(timeout_ms);
        match tokio::time::timeout(timeout, rx).await {
            Ok(Ok(decision)) => match decision.action {
                InterceptAction::Forward => InterceptWaitResult::Forwarded(decision.patch),
                InterceptAction::Drop => InterceptWaitResult::Dropped,
            },
            _ => {
                let mut controller = self.interception.lock().await;
                controller.remove_pending(request_id);
                InterceptWaitResult::Timeout
            }
        }
    }
}

enum InterceptWaitResult {
    Bypass,
    Forwarded(InterceptPatch),
    Dropped,
    Timeout,
}

impl HttpHandler for CaptureHandler {
    async fn handle_request(
        &mut self,
        _ctx: &HttpContext,
        req: Request<Body>,
    ) -> RequestOrResponse {
        let id = self.sequence.fetch_add(1, Ordering::Relaxed) + 1;
        let started_at_unix_ms = now_unix_ms();
        let started_at_instant = Instant::now();

        let (mut parts, body) = req.into_parts();

        let mut request_content_type = header_value(&parts.headers, "content-type");
        let mut request_content_encoding = header_value(&parts.headers, "content-encoding");

        let mut body_bytes = match body.collect().await {
            Ok(collected) => collected.to_bytes().to_vec(),
            Err(_) => Vec::new(),
        };

        if body_bytes.len() > MAX_EDITABLE_BODY_BYTES {
            body_bytes.truncate(MAX_EDITABLE_BODY_BYTES);
            refresh_content_length(&mut parts.headers, body_bytes.len());
        }

        let mut method = parts.method.to_string();
        let mut url = parts.uri.to_string();
        let mut host = parts.uri.host().unwrap_or_default().to_string();
        let mut path = uri_path_and_query(&parts.uri);

        let mut request_headers = collect_headers(&parts.headers);
        let mut request_body = render_body_preview(
            &body_bytes,
            request_content_type.as_deref(),
            request_content_encoding.as_deref(),
        );
        let mut request_body_size = body_bytes.len() as u64;

        let pending_snapshot = PendingInterceptRequest {
            id,
            started_at_unix_ms,
            method: method.clone(),
            url: url.clone(),
            host: host.clone(),
            path: path.clone(),
            headers: request_headers.clone(),
            body: request_body.clone(),
            body_size: request_body_size,
            status: "pending".to_string(),
            last_error: None,
        };

        let mut intercept_status = None;
        let mut original_method = None;
        let mut original_url = None;

        match self
            .wait_intercept_decision(&method, &host, &path, pending_snapshot)
            .await
        {
            InterceptWaitResult::Bypass => {}
            InterceptWaitResult::Timeout => {
                intercept_status = Some("timeout".to_string());
            }
            InterceptWaitResult::Dropped => {
                let captured = CapturedExchange {
                    id,
                    started_at_unix_ms,
                    duration_ms: started_at_instant.elapsed().as_millis() as u64,
                    method,
                    url,
                    host,
                    path,
                    status_code: 499,
                    request_headers,
                    response_headers: vec![HeaderEntry {
                        name: "x-http-request-tracer".to_string(),
                        value: "intercept-dropped".to_string(),
                    }],
                    request_body,
                    response_body: Some("Dropped by interceptor".to_string()),
                    request_body_size,
                    response_body_size: "Dropped by interceptor".len() as u64,
                    intercepted: true,
                    intercept_status: Some("dropped".to_string()),
                    original_method: None,
                    original_url: None,
                };

                if let Ok(mut store) = self.store.lock() {
                    store.push(captured, DEFAULT_MAX_CAPTURED_REQUESTS);
                }

                let dropped_response = Response::builder()
                    .status(StatusCode::from_u16(499).unwrap_or(StatusCode::BAD_REQUEST))
                    .header("x-http-request-tracer", "intercept-dropped")
                    .body(Body::from("Dropped by interceptor"))
                    .unwrap_or_else(|_| Response::new(Body::from("Dropped by interceptor")));

                return dropped_response.into();
            }
            InterceptWaitResult::Forwarded(patch) => {
                intercept_status = Some("forwarded".to_string());
                original_method = Some(method.clone());
                original_url = Some(url.clone());

                apply_intercept_patch(&mut parts, &mut body_bytes, patch);

                request_content_type = header_value(&parts.headers, "content-type");
                request_content_encoding = header_value(&parts.headers, "content-encoding");

                method = parts.method.to_string();
                url = parts.uri.to_string();
                host = parts.uri.host().unwrap_or_default().to_string();
                path = uri_path_and_query(&parts.uri);
                request_headers = collect_headers(&parts.headers);
                request_body = render_body_preview(
                    &body_bytes,
                    request_content_type.as_deref(),
                    request_content_encoding.as_deref(),
                );
                request_body_size = body_bytes.len() as u64;
            }
        }

        let pending = PendingExchange {
            id,
            started_at_unix_ms,
            started_at_instant,
            method,
            url,
            host,
            path,
            request_headers,
            request_body,
            request_body_size,
            intercepted: intercept_status.is_some(),
            intercept_status,
            original_method,
            original_url,
        };

        self.pending = Some(pending);
        Request::from_parts(parts, Body::from(Full::new(body_bytes.into()))).into()
    }

    async fn handle_response(&mut self, _ctx: &HttpContext, res: Response<Body>) -> Response<Body> {
        let (parts, body) = res.into_parts();
        let response_headers = collect_headers(&parts.headers);
        let response_content_type = header_value(&parts.headers, "content-type");
        let response_content_encoding = header_value(&parts.headers, "content-encoding");

        let response_body_bytes = match body.collect().await {
            Ok(collected) => collected.to_bytes(),
            Err(_) => Default::default(),
        };

        let response_body = render_body_preview(
            &response_body_bytes,
            response_content_type.as_deref(),
            response_content_encoding.as_deref(),
        );
        let response_body_size = response_body_bytes.len() as u64;
        let status_code = parts.status.as_u16();
        let response = Response::from_parts(parts, Body::from(Full::new(response_body_bytes)));

        if let Some(pending) = self.pending.take() {
            let captured = CapturedExchange {
                id: pending.id,
                started_at_unix_ms: pending.started_at_unix_ms,
                duration_ms: pending.started_at_instant.elapsed().as_millis() as u64,
                method: pending.method,
                url: pending.url,
                host: pending.host,
                path: pending.path,
                status_code,
                request_headers: pending.request_headers,
                response_headers,
                request_body: pending.request_body,
                response_body,
                request_body_size: pending.request_body_size,
                response_body_size,
                intercepted: pending.intercepted,
                intercept_status: pending.intercept_status,
                original_method: pending.original_method,
                original_url: pending.original_url,
            };

            if let Ok(mut store) = self.store.lock() {
                store.push(captured, DEFAULT_MAX_CAPTURED_REQUESTS);
            }
        }

        response
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
    request_body: Option<String>,
    request_body_size: u64,
    intercepted: bool,
    intercept_status: Option<String>,
    original_method: Option<String>,
    original_url: Option<String>,
}

fn apply_intercept_patch(
    parts: &mut hudsucker::hyper::http::request::Parts,
    body_bytes: &mut Vec<u8>,
    patch: InterceptPatch,
) {
    if let Some(method_raw) = patch.method {
        if let Ok(method) = method_raw.parse::<Method>() {
            parts.method = method;
        }
    }

    if let Some(url_raw) = patch.url {
        if let Ok(uri) = url_raw.parse::<Uri>() {
            parts.uri = uri;
        }
    }

    if let Some(query_raw) = patch.query {
        let base = parts
            .uri
            .to_string()
            .split('?')
            .next()
            .unwrap_or_default()
            .to_string();
        let query = query_raw.trim().trim_start_matches('?');
        let next_uri = if query.is_empty() {
            base
        } else {
            format!("{base}?{query}")
        };
        if let Ok(uri) = next_uri.parse::<Uri>() {
            parts.uri = uri;
        }
    }

    if let Some(next_headers) = patch.headers {
        parts.headers = header_entries_to_map(&next_headers);
    }

    if let Some(cookies) = patch.cookies {
        if let Ok(value) = HeaderValue::from_str(cookies.trim()) {
            parts
                .headers
                .insert(HeaderName::from_static("cookie"), value);
        }
    }

    if let Some(next_body) = patch.body {
        let mut next_body_bytes = next_body.into_bytes();
        if next_body_bytes.len() > MAX_EDITABLE_BODY_BYTES {
            next_body_bytes.truncate(MAX_EDITABLE_BODY_BYTES);
        }
        *body_bytes = next_body_bytes;
        refresh_content_length(&mut parts.headers, body_bytes.len());
    }
}

fn normalize_rule(mut rule: InterceptionRule) -> InterceptionRule {
    rule.host_contains = rule.host_contains.trim().to_ascii_lowercase();
    rule.path_contains = rule.path_contains.trim().to_ascii_lowercase();
    rule.method = rule.method.trim().to_ascii_uppercase();
    rule
}

fn refresh_content_length(headers: &mut HeaderMap, size: usize) {
    if let Ok(value) = HeaderValue::from_str(&size.to_string()) {
        headers.insert(HeaderName::from_static("content-length"), value);
    }
}

fn uri_path_and_query(uri: &Uri) -> String {
    uri.path_and_query()
        .map(|value| value.as_str().to_string())
        .unwrap_or_else(|| uri.path().to_string())
}

fn header_entries_to_map(entries: &[HeaderEntry]) -> HeaderMap {
    let mut headers = HeaderMap::new();
    for entry in entries {
        if let (Ok(name), Ok(value)) = (
            HeaderName::from_bytes(entry.name.as_bytes()),
            HeaderValue::from_str(&entry.value),
        ) {
            headers.append(name, value);
        }
    }
    headers
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

fn header_value(headers: &HeaderMap, key: &'static str) -> Option<String> {
    headers
        .get(key)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string())
}

fn render_body_preview(
    body: &[u8],
    content_type: Option<&str>,
    content_encoding: Option<&str>,
) -> Option<String> {
    if body.is_empty() {
        return None;
    }

    let mut decoded_body: Option<Vec<u8>> = None;
    if let Some(encoding) = normalized_content_encoding(content_encoding) {
        if encoding != "identity" {
            decoded_body = decode_content_encoding(body, &encoding);
            if decoded_body.is_none() {
                return Some(format!(
                    "Body capturado ({} bytes) con content-encoding '{}', no fue posible decodificarlo.",
                    body.len(),
                    encoding
                ));
            }
        }
    }

    let body_for_preview = decoded_body.as_deref().unwrap_or(body);

    if !is_textual_content_type(body_for_preview, content_type) {
        return Some(format!(
            "Payload no textual ({} bytes). Visualizacion de body omitida por seguridad.",
            body.len()
        ));
    }

    let body_text = String::from_utf8_lossy(body_for_preview);
    let mut preview = body_text
        .chars()
        .take(MAX_BODY_PREVIEW_CHARS)
        .collect::<String>();

    if body_text.chars().count() > MAX_BODY_PREVIEW_CHARS {
        preview.push_str("\n...[truncated]");
    }

    Some(preview)
}

fn is_textual_content_type(body: &[u8], content_type: Option<&str>) -> bool {
    match content_type.map(|value| value.to_ascii_lowercase()) {
        Some(value)
            if value.starts_with("text/")
                || value.contains("json")
                || value.contains("xml")
                || value.contains("javascript")
                || value.contains("x-www-form-urlencoded")
                || value.contains("graphql") =>
        {
            true
        }
        Some(_) => false,
        None => std::str::from_utf8(body).is_ok(),
    }
}

fn normalized_content_encoding(content_encoding: Option<&str>) -> Option<String> {
    Some(
        content_encoding?
            .split(',')
            .next()
            .map(str::trim)
            .unwrap_or_default()
            .to_ascii_lowercase(),
    )
}

fn decode_content_encoding(body: &[u8], encoding: &str) -> Option<Vec<u8>> {
    let mut decoded = Vec::new();
    let decode_result = match encoding {
        "gzip" | "x-gzip" => GzDecoder::new(body).read_to_end(&mut decoded),
        "deflate" => ZlibDecoder::new(body).read_to_end(&mut decoded),
        "br" => Decompressor::new(body, 4096).read_to_end(&mut decoded),
        _ => return None,
    };

    if decode_result.is_ok() {
        return Some(decoded);
    }

    None
}

fn now_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use tokio::sync::oneshot;

    use super::{
        apply_intercept_patch, render_body_preview, Body, CaptureHandler, CaptureStore,
        CapturedExchange, HeaderEntry, InterceptAction, InterceptDecisionInput,
        InterceptionConfigInput, InterceptionController, InterceptionRule,
        InterceptWaitResult, PendingInterceptRequest, Request, SharedCaptureStore,
        SharedInterceptionController, DEFAULT_MAX_PENDING_INTERCEPTS,
        MAX_EDITABLE_BODY_BYTES, MAX_INTERCEPT_TIMEOUT_MS, MIN_INTERCEPT_TIMEOUT_MS,
    };

    #[test]
    fn capture_store_behaves_as_circular_buffer() {
        let mut store = CaptureStore::default();
        store.push(sample_exchange(1), 3);
        store.push(sample_exchange(2), 3);
        store.push(sample_exchange(3), 3);
        store.push(sample_exchange(4), 3);

        let ids: Vec<u64> = store.snapshot().into_iter().map(|entry| entry.id).collect();
        assert_eq!(ids, vec![2, 3, 4]);
    }

    #[test]
    fn capture_store_clear_removes_entries() {
        let mut store = CaptureStore::default();
        store.push(sample_exchange(1), 10);
        store.push(sample_exchange(2), 10);
        store.clear();

        assert!(store.snapshot().is_empty());
    }

    #[test]
    fn interception_config_clamps_timeout_and_normalizes_rules() {
        let mut controller = InterceptionController::default();
        let snapshot = controller.apply_config(InterceptionConfigInput {
            enabled: true,
            timeout_ms: Some(MAX_INTERCEPT_TIMEOUT_MS + 10_000),
            rules: Some(vec![
                InterceptionRule {
                    id: "rule-1".to_string(),
                    enabled: true,
                    host_contains: " Api.Example.com ".to_string(),
                    path_contains: " /Login ".to_string(),
                    method: " post ".to_string(),
                },
                InterceptionRule {
                    id: "   ".to_string(),
                    enabled: true,
                    host_contains: "ignored".to_string(),
                    path_contains: String::new(),
                    method: String::new(),
                },
            ]),
        });

        assert!(snapshot.enabled);
        assert_eq!(snapshot.timeout_ms, MAX_INTERCEPT_TIMEOUT_MS);
        assert_eq!(snapshot.rules.len(), 1);
        assert_eq!(snapshot.rules[0].host_contains, "api.example.com");
        assert_eq!(snapshot.rules[0].path_contains, "/login");
        assert_eq!(snapshot.rules[0].method, "POST");
    }

    #[test]
    fn apply_decision_delivers_drop_and_clears_pending() {
        let mut controller = InterceptionController::default();
        let (tx, mut rx) = oneshot::channel();
        controller.register_pending(sample_pending_request(7), tx);

        controller
            .apply_decision(InterceptDecisionInput {
                request_id: 7,
                action: "drop".to_string(),
                method: None,
                url: None,
                headers: None,
                body: None,
                query: None,
                cookies: None,
            })
            .expect("drop decision should be accepted");

        let decision = rx.try_recv().expect("decision should be delivered");
        assert!(matches!(decision.action, InterceptAction::Drop));
        assert_eq!(controller.snapshot().pending_count, 0);
    }

    #[test]
    fn register_pending_evicts_oldest_entries_when_queue_reaches_limit() {
        let mut controller = InterceptionController::default();

        for id in 1..=(DEFAULT_MAX_PENDING_INTERCEPTS as u64 + 1) {
            let (tx, _rx) = oneshot::channel();
            controller.register_pending(sample_pending_request(id), tx);
        }

        let snapshot = controller.snapshot();
        assert_eq!(snapshot.pending_count, DEFAULT_MAX_PENDING_INTERCEPTS);
        assert_eq!(snapshot.pending_requests.first().map(|request| request.id), Some(2));
        assert_eq!(
            snapshot.pending_requests.last().map(|request| request.id),
            Some(DEFAULT_MAX_PENDING_INTERCEPTS as u64 + 1)
        );
    }

    #[tokio::test]
    async fn wait_intercept_decision_times_out_and_cleans_pending() {
        let mut controller = InterceptionController::default();
        controller.enabled = true;
        controller.timeout_ms = MIN_INTERCEPT_TIMEOUT_MS.min(5);

        let controller: SharedInterceptionController =
            std::sync::Arc::new(tokio::sync::Mutex::new(controller));
        let store: SharedCaptureStore =
            std::sync::Arc::new(std::sync::Mutex::new(CaptureStore::default()));
        let handler = CaptureHandler::new(store, controller.clone());

        let result = tokio::time::timeout(
            Duration::from_millis(100),
            handler.wait_intercept_decision(
                "POST",
                "api.example.com",
                "/login",
                sample_pending_request(9),
            ),
        )
        .await
        .expect("interception wait should complete");

        assert!(matches!(result, InterceptWaitResult::Timeout));

        let snapshot = controller.lock().await.snapshot();
        assert_eq!(snapshot.pending_count, 0);
    }

    #[test]
    fn apply_intercept_patch_updates_request_parts_and_truncates_large_body() {
        let request = Request::builder()
            .method("POST")
            .uri("https://example.com/login?before=1")
            .body(Body::empty())
            .expect("request should build");
        let (mut parts, _) = request.into_parts();
        let mut body_bytes = Vec::new();

        apply_intercept_patch(
            &mut parts,
            &mut body_bytes,
            super::InterceptPatch {
                method: Some("PATCH".to_string()),
                url: Some("https://example.com/session".to_string()),
                headers: Some(vec![HeaderEntry {
                    name: "x-test".to_string(),
                    value: "one".to_string(),
                }]),
                body: Some("x".repeat(MAX_EDITABLE_BODY_BYTES + 128)),
                query: Some("via=editor".to_string()),
                cookies: Some("session=updated".to_string()),
            },
        );

        assert_eq!(parts.method.as_str(), "PATCH");
        assert_eq!(parts.uri.to_string(), "https://example.com/session?via=editor");
        assert_eq!(body_bytes.len(), MAX_EDITABLE_BODY_BYTES);
        assert_eq!(parts.headers.get("x-test").unwrap(), "one");
        assert_eq!(parts.headers.get("cookie").unwrap(), "session=updated");
        assert_eq!(
            parts.headers.get("content-length").unwrap(),
            MAX_EDITABLE_BODY_BYTES.to_string().as_str()
        );
    }

    #[test]
    fn render_body_preview_uses_safe_fallbacks_for_binary_and_invalid_encoded_payloads() {
        let binary_preview = render_body_preview(&[0_u8, 159, 146, 150], Some("application/octet-stream"), None)
            .expect("binary preview should return fallback text");
        assert!(binary_preview.contains("Payload no textual"));

        let invalid_gzip_preview = render_body_preview(&[1_u8, 2, 3, 4], Some("text/plain"), Some("gzip"))
            .expect("invalid gzip preview should return fallback text");
        assert!(invalid_gzip_preview.contains("content-encoding 'gzip'"));
        assert!(invalid_gzip_preview.contains("no fue posible decodificarlo"));
    }

    fn sample_exchange(id: u64) -> CapturedExchange {
        CapturedExchange {
            id,
            started_at_unix_ms: 0,
            duration_ms: 0,
            method: "GET".to_string(),
            url: "https://example.com".to_string(),
            host: "example.com".to_string(),
            path: "/".to_string(),
            status_code: 200,
            request_headers: Vec::new(),
            response_headers: Vec::new(),
            request_body: None,
            response_body: None,
            request_body_size: 0,
            response_body_size: 0,
            intercepted: false,
            intercept_status: None,
            original_method: None,
            original_url: None,
        }
    }

    fn sample_pending_request(id: u64) -> PendingInterceptRequest {
        PendingInterceptRequest {
            id,
            started_at_unix_ms: 0,
            method: "POST".to_string(),
            url: "https://api.example.com/login".to_string(),
            host: "api.example.com".to_string(),
            path: "/login".to_string(),
            headers: vec![HeaderEntry {
                name: "content-type".to_string(),
                value: "application/json".to_string(),
            }],
            body: Some("{\"ok\":true}".to_string()),
            body_size: 11,
            status: "pending".to_string(),
            last_error: None,
        }
    }
}
