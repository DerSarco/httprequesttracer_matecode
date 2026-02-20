use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
};

use serde::Serialize;

use super::adb;

const APP_DIR_NAME: &str = ".http-request-tracer";
const CA_DIR_NAME: &str = "ca";
const CA_CERT_PEM_FILE: &str = "http-request-tracer-ca.pem";
const CA_CERT_DER_FILE: &str = "http-request-tracer-ca.cer";
const CA_KEY_FILE: &str = "http-request-tracer-ca.key";

#[derive(Debug, Clone)]
pub struct CaBundlePaths {
    pub cert_pem: PathBuf,
    pub cert_der: PathBuf,
    pub key_pem: PathBuf,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateSetupResult {
    pub cert_local_path: String,
    pub cert_emulator_path: String,
    pub installer_launched: bool,
    pub instructions: String,
}

pub fn ensure_ca_bundle() -> Result<CaBundlePaths, String> {
    let home_dir = dirs::home_dir().ok_or("Unable to resolve home directory".to_string())?;
    let ca_dir = home_dir.join(APP_DIR_NAME).join(CA_DIR_NAME);
    fs::create_dir_all(&ca_dir).map_err(format_fs_error)?;

    let cert_pem = ca_dir.join(CA_CERT_PEM_FILE);
    let cert_der = ca_dir.join(CA_CERT_DER_FILE);
    let key_pem = ca_dir.join(CA_KEY_FILE);

    if !cert_pem.exists() || !cert_der.exists() || !key_pem.exists() {
        generate_ca_bundle(&cert_pem, &cert_der, &key_pem)?;
    }

    Ok(CaBundlePaths {
        cert_pem,
        cert_der,
        key_pem,
    })
}

pub fn prepare_certificate_install(
    emulator_serial: &str,
    paths: &CaBundlePaths,
) -> Result<CertificateSetupResult, String> {
    let remote_path = "/sdcard/Download/http-request-tracer-ca.cer";
    let local_cert = paths.cert_der.to_string_lossy().to_string();

    adb::push_file_to_emulator(emulator_serial, paths.cert_der.as_path(), remote_path)?;

    let launch_result = adb::launch_certificate_installer(emulator_serial, remote_path);
    let installer_launched = launch_result.is_ok();

    let instructions = if installer_launched {
        "Certificado copiado al emulador. Completa la instalacion desde la pantalla abierta (nombre sugerido: HTTP Request Tracer CA).".to_string()
    } else {
        "Certificado copiado al emulador. Abre Settings > Security > Encryption & credentials > Install a certificate > CA certificate y selecciona http-request-tracer-ca.cer en Downloads.".to_string()
    };

    Ok(CertificateSetupResult {
        cert_local_path: local_cert,
        cert_emulator_path: remote_path.to_string(),
        installer_launched,
        instructions,
    })
}

fn generate_ca_bundle(cert_pem: &Path, cert_der: &Path, key_pem: &Path) -> Result<(), String> {
    run_command(
        "openssl",
        &[
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-sha256",
            "-nodes",
            "-days",
            "3650",
            "-subj",
            "/CN=HTTP Request Tracer Local CA/O=HTTP Request Tracer",
            "-addext",
            "basicConstraints=critical,CA:TRUE",
            "-addext",
            "keyUsage=critical,keyCertSign,cRLSign,digitalSignature",
            "-addext",
            "subjectKeyIdentifier=hash",
            "-keyout",
            &path_as_str(key_pem)?,
            "-out",
            &path_as_str(cert_pem)?,
        ],
    )?;

    run_command(
        "openssl",
        &[
            "x509",
            "-in",
            &path_as_str(cert_pem)?,
            "-outform",
            "DER",
            "-out",
            &path_as_str(cert_der)?,
        ],
    )?;

    Ok(())
}

fn run_command(bin: &str, args: &[&str]) -> Result<(), String> {
    let output = Command::new(bin)
        .args(args)
        .output()
        .map_err(|_| format!("Failed to execute {bin}. Ensure it is installed."))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(format!("Command failed: {bin} {}", args.join(" ")))
    } else {
        Err(stderr)
    }
}

fn format_fs_error(err: std::io::Error) -> String {
    format!("File system error: {err}")
}

fn path_as_str(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(ToOwned::to_owned)
        .ok_or("Invalid non-UTF8 path".to_string())
}
