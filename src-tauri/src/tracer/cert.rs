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
    allow_adb_root: bool,
) -> Result<CertificateSetupResult, String> {
    let remote_path = "/sdcard/Download/http-request-tracer-ca.cer";
    let local_cert = paths.cert_der.to_string_lossy().to_string();

    adb::push_file_to_emulator(emulator_serial, paths.cert_der.as_path(), remote_path)?;

    let automation_error = if allow_adb_root {
        match try_install_certificate_with_adb_root(emulator_serial, paths) {
            Ok(system_path) => {
                return Ok(CertificateSetupResult {
                    cert_local_path: local_cert,
                    cert_emulator_path: system_path.clone(),
                    installer_launched: false,
                    installation_status: "installed".to_string(),
                    verification_note: format!("Certificado verificado en {system_path}."),
                    instructions: "Certificado instalado automaticamente en el store de sistema del emulador via ADB. Reinicia las apps del emulador si no toman el nuevo trust store de inmediato.".to_string(),
                });
            }
            Err(err) => Some(err),
        }
    } else {
        None
    };

    let launch_result = adb::launch_certificate_installer(emulator_serial, remote_path);
    if launch_result.is_ok() {
        let verification_note = match automation_error {
            Some(automation_err) => {
                format!("Instalacion automatica no disponible: {automation_err}")
            }
            None => "Instalacion automatica via `adb root` omitida por preferencia del usuario."
                .to_string(),
        };
        return Ok(CertificateSetupResult {
            cert_local_path: local_cert,
            cert_emulator_path: remote_path.to_string(),
            installer_launched: true,
            installation_status: "pendingUserAction".to_string(),
            verification_note,
            instructions: "Certificado copiado al emulador. Se intento abrir la pantalla de instalacion en Android; si no aparece, abre manualmente Settings > Security > Encryption & credentials > Install a certificate > CA certificate y selecciona el archivo en Download.".to_string(),
        });
    }

    let launch_error = launch_result
        .err()
        .unwrap_or_else(|| "No detail available".to_string());

    let verification_note = match automation_error {
        Some(automation_err) => format!(
            "Fallo instalacion automatica: {automation_err}. No fue posible abrir instalador de Android: {launch_error}"
        ),
        None => format!(
            "No se solicito `adb root` y no fue posible abrir el instalador de certificados en Android: {launch_error}"
        ),
    };

    let instructions = if allow_adb_root {
        "No se pudo completar la instalacion de certificado via ADB. Verifica que el emulador permita `adb root`/`adb remount` o instala manualmente desde Settings > Security > Encryption & credentials > Install a certificate > CA certificate.".to_string()
    } else {
        "No se pudo abrir el instalador de certificados en Android. Instala manualmente desde Settings > Security > Encryption & credentials > Install a certificate > CA certificate.".to_string()
    };

    Ok(CertificateSetupResult {
        cert_local_path: local_cert,
        cert_emulator_path: remote_path.to_string(),
        installer_launched: false,
        installation_status: "failed".to_string(),
        verification_note,
        instructions,
    })
}

fn try_install_certificate_with_adb_root(
    emulator_serial: &str,
    paths: &CaBundlePaths,
) -> Result<String, String> {
    let cert_hash = certificate_subject_hash_old(paths.cert_pem.as_path())?;
    let hashed_name = format!("{cert_hash}.0");
    let hashed_local_path = std::env::temp_dir().join(&hashed_name);
    let hashed_remote_path = format!("/system/etc/security/cacerts/{hashed_name}");

    fs::copy(&paths.cert_pem, &hashed_local_path)
        .map_err(|err| format!("Failed to prepare hashed certificate file: {err}"))?;

    let install_result = (|| -> Result<String, String> {
        adb::adb_root(emulator_serial)
            .map_err(|err| format!("adb root failed (emulator might not support root): {err}"))?;
        adb::adb_remount(emulator_serial)
            .map_err(|err| format!("adb remount failed (system partition not writable): {err}"))?;
        adb::push_file_to_emulator(
            emulator_serial,
            hashed_local_path.as_path(),
            &hashed_remote_path,
        )
        .map_err(|err| format!("Failed to push CA into system trust store: {err}"))?;
        adb::chown_remote_file(emulator_serial, &hashed_remote_path, "root:root")
            .map_err(|err| format!("Failed to set CA owner: {err}"))?;
        adb::chmod_remote_file(emulator_serial, &hashed_remote_path, "644")
            .map_err(|err| format!("Failed to set CA permissions: {err}"))?;

        let exists = adb::remote_file_exists(emulator_serial, &hashed_remote_path)
            .map_err(|err| format!("Failed to verify installed CA file: {err}"))?;
        if !exists {
            return Err("CA file was not found in system trust store after install.".to_string());
        }

        Ok(hashed_remote_path.clone())
    })();

    let _ = fs::remove_file(&hashed_local_path);
    install_result
}

fn certificate_subject_hash_old(cert_pem: &Path) -> Result<String, String> {
    let output = run_command_capture(
        "openssl",
        &[
            "x509",
            "-inform",
            "PEM",
            "-subject_hash_old",
            "-in",
            &path_as_str(cert_pem)?,
            "-noout",
        ],
    )?;

    let hash = output.lines().next().unwrap_or_default().trim();
    if hash.is_empty() {
        return Err("Unable to resolve certificate hash for Android trust store.".to_string());
    }

    Ok(hash.to_string())
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
