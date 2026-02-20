use std::{env, path::Path, process::Command};

use serde::Serialize;

const KNOWN_ADB_PATHS: [&str; 4] = [
    "/opt/homebrew/bin/adb",
    "/opt/local/bin/adb",
    "/usr/local/bin/adb",
    "/usr/bin/adb",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EmulatorDevice {
    pub serial: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdbStatus {
    pub adb_available: bool,
    pub adb_path: Option<String>,
    pub adb_version: Option<String>,
    pub emulators: Vec<EmulatorDevice>,
    pub message: Option<String>,
}

pub fn get_adb_status() -> Result<AdbStatus, String> {
    let adb_binary = match resolve_adb_binary() {
        Ok(path) => path,
        Err(err) => {
            return Ok(AdbStatus {
                adb_available: false,
                adb_path: None,
                adb_version: None,
                emulators: Vec::new(),
                message: Some(err),
            });
        }
    };

    let adb_version = match adb_version(&adb_binary) {
        Ok(version) => Some(version),
        Err(err) => {
            return Ok(AdbStatus {
                adb_available: false,
                adb_path: Some(adb_binary),
                adb_version: None,
                emulators: Vec::new(),
                message: Some(err),
            });
        }
    };

    let start_server_err = run_adb_with_binary(&adb_binary, &["start-server"]).err();
    let (emulators, offline_emulator_count) = list_emulators(&adb_binary)?;

    let mut message_parts = Vec::new();
    if let Some(err) = start_server_err {
        message_parts.push(format!("adb start-server warning: {err}"));
    }
    if offline_emulator_count > 0 {
        message_parts.push(format!(
            "{offline_emulator_count} emulator(s) are offline. Reconnect or cold boot the emulator."
        ));
    }

    Ok(AdbStatus {
        adb_available: true,
        adb_path: Some(adb_binary),
        adb_version,
        emulators,
        message: if message_parts.is_empty() {
            None
        } else {
            Some(message_parts.join(" "))
        },
    })
}

pub fn ensure_adb_available() -> Result<(), String> {
    let adb_binary = resolve_adb_binary()?;
    adb_version(&adb_binary)?;
    Ok(())
}

pub fn set_emulator_proxy(serial: &str, proxy_address: &str) -> Result<(), String> {
    run_adb(&[
        "-s",
        serial,
        "shell",
        "settings",
        "put",
        "global",
        "http_proxy",
        proxy_address,
    ])?;
    Ok(())
}

pub fn clear_emulator_proxy(serial: &str) -> Result<(), String> {
    run_adb(&[
        "-s",
        serial,
        "shell",
        "settings",
        "put",
        "global",
        "http_proxy",
        ":0",
    ])?;

    let _ = run_adb(&[
        "-s",
        serial,
        "shell",
        "settings",
        "put",
        "global",
        "global_http_proxy_host",
        "",
    ]);
    let _ = run_adb(&[
        "-s",
        serial,
        "shell",
        "settings",
        "put",
        "global",
        "global_http_proxy_port",
        "0",
    ]);

    Ok(())
}

pub fn push_file_to_emulator(serial: &str, local: &Path, remote: &str) -> Result<(), String> {
    let local_path = local
        .to_str()
        .ok_or("Invalid certificate path".to_string())?;

    run_adb(&["-s", serial, "push", local_path, remote])?;
    Ok(())
}

pub fn launch_certificate_installer(serial: &str, remote_path: &str) -> Result<(), String> {
    let data_uri = format!("file://{remote_path}");
    run_adb(&[
        "-s",
        serial,
        "shell",
        "am",
        "start",
        "-a",
        "android.credentials.INSTALL",
        "-d",
        &data_uri,
        "-t",
        "application/x-x509-ca-cert",
    ])?;
    Ok(())
}

fn list_emulators(adb_binary: &str) -> Result<(Vec<EmulatorDevice>, usize), String> {
    let output = run_adb_with_binary(adb_binary, &["devices"])?;
    let mut online_emulators = Vec::new();
    let mut offline_emulator_count = 0usize;

    for line in output.lines().skip(1) {
        if let Some(entry) = parse_device_line(line) {
            if !entry.serial.starts_with("emulator-") {
                continue;
            }
            if entry.status == "device" {
                online_emulators.push(EmulatorDevice {
                    serial: entry.serial,
                });
            } else if entry.status == "offline" {
                offline_emulator_count += 1;
            }
        }
    }

    Ok((online_emulators, offline_emulator_count))
}

fn run_adb(args: &[&str]) -> Result<String, String> {
    let adb_binary = resolve_adb_binary()?;
    run_adb_with_binary(&adb_binary, args)
}

fn run_adb_with_binary(adb_binary: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(adb_binary)
        .args(args)
        .output()
        .map_err(|_| format!("Failed to execute adb at {adb_binary}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err(format!(
                "adb command failed: {adb_binary} {}",
                args.join(" ")
            ))
        } else {
            Err(stderr)
        }
    }
}

fn adb_version(adb_binary: &str) -> Result<String, String> {
    let output = Command::new(adb_binary)
        .arg("version")
        .output()
        .map_err(|_| format!("Failed to execute adb at {adb_binary}"))?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout)
            .lines()
            .next()
            .unwrap_or_default()
            .to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            Err("adb is installed but not responding correctly".to_string())
        } else {
            Err(format!("adb error: {stderr}"))
        }
    }
}

fn resolve_adb_binary() -> Result<String, String> {
    if let Ok(adb_path) = env::var("ADB_PATH") {
        if adb_version(&adb_path).is_ok() {
            return Ok(adb_path);
        }
    }

    for path in KNOWN_ADB_PATHS {
        if adb_version(path).is_ok() {
            return Ok(path.to_string());
        }
    }

    if adb_version("adb").is_ok() {
        return Ok("adb".to_string());
    }

    Err("adb not found. Install Android platform-tools and ensure adb is in PATH, or place it in /opt/homebrew/bin or /opt/local/bin.".to_string())
}

struct DeviceEntry {
    serial: String,
    status: String,
}

fn parse_device_line(line: &str) -> Option<DeviceEntry> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    let mut parts = trimmed.split_whitespace();
    let serial = parts.next()?.to_string();
    let status = parts.next().unwrap_or_default().to_string();
    if status.is_empty() {
        return None;
    }

    Some(DeviceEntry { serial, status })
}
