use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct TraceSessionSnapshot {
    pub active: bool,
    pub emulator_serial: Option<String>,
    pub proxy_address: Option<String>,
    pub started_at_unix_ms: Option<u64>,
    pub ca_certificate_path: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Default)]
pub struct TraceSession {
    pub active: bool,
    pub emulator_serial: Option<String>,
    pub proxy_address: Option<String>,
    pub started_at_unix_ms: Option<u64>,
    pub ca_certificate_path: Option<String>,
    pub last_error: Option<String>,
}

impl TraceSession {
    pub fn start(
        &mut self,
        emulator_serial: String,
        proxy_address: String,
        ca_certificate_path: String,
    ) {
        self.active = true;
        self.emulator_serial = Some(emulator_serial);
        self.proxy_address = Some(proxy_address);
        self.started_at_unix_ms = Some(current_unix_ms());
        self.ca_certificate_path = Some(ca_certificate_path);
        self.last_error = None;
    }

    pub fn stop(&mut self) {
        self.active = false;
        self.emulator_serial = None;
        self.proxy_address = None;
        self.started_at_unix_ms = None;
        self.ca_certificate_path = None;
    }

    pub fn snapshot(&self) -> TraceSessionSnapshot {
        TraceSessionSnapshot {
            active: self.active,
            emulator_serial: self.emulator_serial.clone(),
            proxy_address: self.proxy_address.clone(),
            started_at_unix_ms: self.started_at_unix_ms,
            ca_certificate_path: self.ca_certificate_path.clone(),
            last_error: self.last_error.clone(),
        }
    }
}

fn current_unix_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}
