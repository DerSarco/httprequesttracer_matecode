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
    pub installation_status: String,
    pub verification_note: String,
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
    let open_security_result = adb::open_security_settings(emulator_serial);
    let (installer_launched, verification_note, instructions) = match open_security_result {
        Ok(_) => (
            true,
            "Se abrio una pantalla de Encryption/Credentials en el emulador.".to_string(),
            "Certificado copiado al emulador. Completa la instalacion en Android y selecciona el archivo desde Download si corresponde.".to_string(),
        ),
        Err(err) => (
            false,
            format!("No se pudo abrir Encryption/Credentials automaticamente: {err}"),
            "Certificado copiado al emulador. Abre manualmente Settings > Security > Encryption & credentials > Install a certificate > CA certificate y selecciona el archivo en Download.".to_string(),
        ),
    };

    Ok(CertificateSetupResult {
        cert_local_path: local_cert,
        cert_emulator_path: remote_path.to_string(),
        installer_launched,
        installation_status: "pendingUserAction".to_string(),
        verification_note,
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
    let _ = run_command_capture(bin, args)?;
    Ok(())
}

fn run_command_capture(bin: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(bin)
        .args(args)
        .output()
        .map_err(|_| format!("Failed to execute {bin}. Ensure it is installed."))?;

    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).to_string());
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
