use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::{self, ErrorKind, Read, Write};
use std::path::Path;

const PLUGIN_ID: &str = "remotehand.editor";
const PLUGIN_VERSION: &str = "0.1.0";
const API_VERSION: u32 = 1;
const MAX_FRAME_BYTES: usize = 16 * 1024 * 1024;
const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;
const MAX_SESSION_BYTES: usize = 12 * 1024 * 1024;
const SESSION_KEY: &str = "session-v1";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginHello<'a> {
    #[serde(rename = "type")]
    message_type: &'static str,
    plugin_id: &'a str,
    api_version: u32,
    plugin_version: &'a str,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostReady {
    #[serde(rename = "type")]
    message_type: String,
    plugin_id: String,
    api_version: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostRequest {
    #[serde(rename = "type")]
    message_type: String,
    request_id: u64,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginResponse {
    #[serde(rename = "type")]
    message_type: &'static str,
    request_id: u64,
    ok: bool,
    result: Value,
    error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PluginHostRequest<'a> {
    #[serde(rename = "type")]
    message_type: &'static str,
    request_id: u64,
    method: &'a str,
    params: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostResponse {
    #[serde(rename = "type")]
    message_type: String,
    request_id: u64,
    #[serde(default)]
    ok: bool,
    #[serde(default)]
    result: Value,
    #[serde(default)]
    error: String,
}

fn write_frame<W: Write, T: Serialize>(writer: &mut W, value: &T) -> Result<(), String> {
    let payload = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    if payload.is_empty() || payload.len() > MAX_FRAME_BYTES {
        return Err("frame exceeds Editor Plugin API limit".to_string());
    }
    writer
        .write_all(&(payload.len() as u32).to_le_bytes())
        .map_err(|error| error.to_string())?;
    writer.write_all(&payload).map_err(|error| error.to_string())?;
    writer.flush().map_err(|error| error.to_string())
}

fn read_frame<R: Read>(reader: &mut R) -> Result<Option<Vec<u8>>, String> {
    let mut length = [0u8; 4];
    match reader.read_exact(&mut length) {
        Ok(()) => {}
        Err(error) if error.kind() == ErrorKind::UnexpectedEof => return Ok(None),
        Err(error) => return Err(error.to_string()),
    }

    let length = u32::from_le_bytes(length) as usize;
    if length == 0 || length > MAX_FRAME_BYTES {
        return Err(format!("invalid frame length: {length}"));
    }

    let mut payload = vec![0u8; length];
    reader
        .read_exact(&mut payload)
        .map_err(|error| error.to_string())?;
    Ok(Some(payload))
}

fn call_host<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    next_request_id: &mut u64,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    *next_request_id = next_request_id.wrapping_add(1).max(1);
    let request_id = *next_request_id;

    write_frame(
        writer,
        &PluginHostRequest {
            message_type: "plugin.request",
            request_id,
            method,
            params,
        },
    )?;

    let payload = read_frame(reader)?
        .ok_or_else(|| "host closed stream while awaiting host.response".to_string())?;
    let response: HostResponse = serde_json::from_slice(&payload)
        .map_err(|error| format!("invalid host.response: {error}"))?;

    if response.message_type != "host.response" {
        return Err(format!(
            "unexpected Plugin API v1 message type while awaiting host.response: {}",
            response.message_type
        ));
    }
    if response.request_id != request_id {
        return Err(format!(
            "host.response requestId mismatch: expected {request_id}, got {}",
            response.request_id
        ));
    }

    if response.ok {
        Ok(response.result)
    } else if response.error.trim().is_empty() {
        Err(format!("host API method {method} failed"))
    } else {
        Err(response.error)
    }
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| path_text(path))
}

fn detect_eol(content: &str) -> &'static str {
    if content.contains("\r\n") {
        "CRLF"
    } else {
        "LF"
    }
}

fn read_text_file(path: &Path) -> Result<Value, String> {
    let metadata = fs::metadata(path)
        .map_err(|error| format!("cannot inspect {}: {error}", path_text(path)))?;
    if !metadata.is_file() {
        return Err("selected path is not a regular file".to_string());
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err("file exceeds the Editor 8 MiB limit".to_string());
    }

    let bytes = fs::read(path)
        .map_err(|error| format!("cannot read {}: {error}", path_text(path)))?;
    if bytes.iter().take(8192).any(|byte| *byte == 0) {
        return Err("binary files are not supported".to_string());
    }
    let content = String::from_utf8(bytes)
        .map_err(|_| "v0.1.0 currently supports UTF-8 text files only".to_string())?;

    Ok(json!({
        "path": path_text(path),
        "name": display_name(path),
        "content": content,
        "encoding": "UTF-8",
        "eol": detect_eol(&content)
    }))
}

fn open_text_file() -> Result<Value, String> {
    let picked = FileDialog::new()
        .add_filter(
            "Text and code",
            &[
                "txt", "md", "json", "yaml", "yml", "toml", "ini", "xml", "html",
                "htm", "css", "js", "ts", "jsx", "tsx", "py", "rs", "go", "c", "h",
                "cpp", "hpp", "cs", "java", "sh", "ps1", "log",
            ],
        )
        .add_filter("All files", &["*"])
        .pick_file();

    match picked {
        Some(path) => read_text_file(&path),
        None => Ok(json!({ "opened": false })),
    }
}

fn write_text_file(path: &Path, content: &str) -> Result<Value, String> {
    if path.as_os_str().is_empty() {
        return Err("file path is required".to_string());
    }
    if content.len() as u64 > MAX_FILE_BYTES {
        return Err("content exceeds the Editor 8 MiB limit".to_string());
    }
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("cannot inspect {}: {error}", path_text(path)))?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err("Editor only writes existing regular files".to_string());
    }

    fs::write(path, content.as_bytes())
        .map_err(|error| format!("cannot save {}: {error}", path_text(path)))?;

    Ok(json!({
        "saved": true,
        "path": path_text(path),
        "name": display_name(path),
        "encoding": "UTF-8",
        "eol": detect_eol(content)
    }))
}


fn validate_session(value: &Value) -> Result<(), String> {
    let bytes = serde_json::to_vec(value).map_err(|error| error.to_string())?;
    if bytes.len() > MAX_SESSION_BYTES {
        return Err("Editor recovery session exceeds 12 MiB".to_string());
    }
    Ok(())
}

fn dispatch(
    request: &HostRequest,
    host_call: &mut dyn FnMut(&str, Value) -> Result<Value, String>,
) -> Result<Value, String> {
    match request.method.as_str() {
        "runtime.ping" => Ok(json!({
            "pluginId": PLUGIN_ID,
            "pluginVersion": PLUGIN_VERSION,
            "apiVersion": API_VERSION,
            "status": "ok"
        })),
        "session.get" => {
            let result = host_call("storage.get", json!({ "key": SESSION_KEY }))?;
            Ok(result.get("value").cloned().unwrap_or(Value::Null))
        }
        "session.set" => {
            validate_session(&request.params)?;
            host_call(
                "storage.set",
                json!({ "key": SESSION_KEY, "value": request.params }),
            )?;
            Ok(json!({ "stored": true }))
        }
        "file.open" => open_text_file(),
        "file.read" => {
            #[derive(Deserialize)]
            struct Params {
                path: String,
            }
            let params: Params = serde_json::from_value(request.params.clone())
                .map_err(|error| format!("invalid file.read request: {error}"))?;
            read_text_file(Path::new(&params.path))
        }
        "file.write" => {
            #[derive(Deserialize)]
            struct Params {
                path: String,
                content: String,
            }
            let params: Params = serde_json::from_value(request.params.clone())
                .map_err(|error| format!("invalid file.write request: {error}"))?;
            write_text_file(Path::new(&params.path), &params.content)
        }
        "file.save_as" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Params {
                suggested_name: String,
                content: String,
            }
            let params: Params = serde_json::from_value(request.params.clone())
                .map_err(|error| format!("invalid file.save_as request: {error}"))?;
            if params.content.len() as u64 > MAX_FILE_BYTES {
                return Err("content exceeds the Editor 8 MiB limit".to_string());
            }
            host_call(
                "file.save",
                json!({
                    "suggestedName": params.suggested_name,
                    "content": params.content,
                    "filters": [
                        {
                            "name": "Text and code",
                            "extensions": ["txt", "md", "json", "yaml", "toml", "html", "css", "js"]
                        }
                    ]
                }),
            )
        }
        method => Err(format!("unsupported plugin method: {method}")),
    }
}

fn run() -> Result<(), String> {
    let mut stdin = io::stdin().lock();
    let mut stdout = io::stdout().lock();

    write_frame(
        &mut stdout,
        &PluginHello {
            message_type: "plugin.hello",
            plugin_id: PLUGIN_ID,
            api_version: API_VERSION,
            plugin_version: PLUGIN_VERSION,
        },
    )?;

    let payload = read_frame(&mut stdin)?
        .ok_or_else(|| "host closed stream before host.ready".to_string())?;
    let ready: HostReady =
        serde_json::from_slice(&payload).map_err(|error| format!("invalid host.ready: {error}"))?;

    if ready.message_type != "host.ready"
        || ready.plugin_id != PLUGIN_ID
        || ready.api_version != API_VERSION
    {
        return Err("RemoteHand rejected Plugin API v1 startup contract".to_string());
    }

    let mut next_host_request_id = 0u64;

    while let Some(payload) = read_frame(&mut stdin)? {
        let request: HostRequest = serde_json::from_slice(&payload)
            .map_err(|error| format!("invalid host request: {error}"))?;

        if request.message_type != "host.request" {
            return Err(format!(
                "unexpected Plugin API v1 message type: {}",
                request.message_type
            ));
        }

        let mut host_call = |method: &str, params: Value| {
            call_host(
                &mut stdin,
                &mut stdout,
                &mut next_host_request_id,
                method,
                params,
            )
        };

        let (ok, result, error) = match dispatch(&request, &mut host_call) {
            Ok(result) => (true, result, String::new()),
            Err(error) => (false, Value::Null, error),
        };

        write_frame(
            &mut stdout,
            &PluginResponse {
                message_type: "plugin.response",
                request_id: request.request_id,
                ok,
                result,
                error,
            },
        )?;
    }

    Ok(())
}

fn main() {
    if let Err(error) = run() {
        eprintln!("RemoteHand Editor plugin failed: {error}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn temp_file(name: &str, bytes: &[u8]) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("remotehand-editor-test-{name}-{}", std::process::id()));
        fs::write(&path, bytes).expect("write temp file");
        path
    }

    #[test]
    fn detects_crlf_and_lf() {
        assert_eq!(detect_eol("one\r\ntwo\r\n"), "CRLF");
        assert_eq!(detect_eol("one\ntwo\n"), "LF");
    }

    #[test]
    fn reads_utf8_text() {
        let path = temp_file("utf8.txt", b"hello\nworld\n");
        let result = read_text_file(&path).unwrap();
        assert_eq!(result["content"], "hello\nworld\n");
        assert_eq!(result["encoding"], "UTF-8");
        assert_eq!(result["eol"], "LF");
        let _ = fs::remove_file(path);
    }

    #[test]
    fn rejects_binary_content() {
        let path = temp_file("binary.bin", &[1, 2, 0, 4]);
        let error = read_text_file(&path).unwrap_err();
        assert!(error.contains("binary"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn writes_existing_regular_file() {
        let path = temp_file("write.txt", b"old");
        write_text_file(&path, "new\r\n").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new\r\n");
        let _ = fs::remove_file(path);
    }
}
