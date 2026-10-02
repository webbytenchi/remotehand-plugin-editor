use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::io::{self, ErrorKind, Read, Write};
use std::path::Path;

const PLUGIN_ID: &str = "remotehand.editor";
const PLUGIN_VERSION: &str = "0.3.1";
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

const MAX_BINARY_PREVIEW_BYTES: usize = 128 * 1024;
const MAX_BINARY_EDIT_BYTES: usize = 512 * 1024;

fn binary_dump(bytes: &[u8], limit: usize) -> String {
    let shown = bytes.len().min(limit);
    let mut output = String::new();

    for (row, chunk) in bytes[..shown].chunks(16).enumerate() {
        use std::fmt::Write as _;
        let offset = row * 16;
        let _ = write!(&mut output, "{offset:08X}  ");

        for index in 0..16 {
            if let Some(byte) = chunk.get(index) {
                let _ = write!(&mut output, "{byte:02X} ");
            } else {
                output.push_str("   ");
            }
            if index == 7 {
                output.push(' ');
            }
        }

        output.push_str(" |");
        for byte in chunk {
            let ch = if byte.is_ascii_graphic() || *byte == b' ' {
                char::from(*byte)
            } else {
                '.'
            };
            output.push(ch);
        }
        output.push_str("|\n");
    }

    if bytes.len() > shown {
        use std::fmt::Write as _;
        let _ = write!(
            &mut output,
            "\n... preview truncated: showing {} of {} bytes ...\n",
            shown,
            bytes.len()
        );
    }

    output
}

fn read_text_file(path: &Path, allow_binary: bool, edit_binary: bool) -> Result<Value, String> {
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

    const UTF8_BOM: &[u8; 3] = b"\xEF\xBB\xBF";
    let has_bom = bytes.starts_with(UTF8_BOM);
    let text_bytes = if has_bom { &bytes[UTF8_BOM.len()..] } else { &bytes[..] };

    let has_nul = text_bytes.iter().take(8192).any(|byte| *byte == 0);
    let decoded = if has_nul {
        None
    } else {
        std::str::from_utf8(text_bytes).ok()
    };

    if let Some(content) = decoded {
        return Ok(json!({
            "path": path_text(path),
            "name": display_name(path),
            "content": content,
            "encoding": "UTF-8",
            "bom": has_bom,
            "binary": false,
            "eol": detect_eol(content)
        }));
    }

    if !allow_binary {
        return Ok(json!({
            "path": path_text(path),
            "name": display_name(path),
            "binary": true,
            "size": bytes.len()
        }));
    }

    if edit_binary {
        if bytes.len() > MAX_BINARY_EDIT_BYTES {
            return Err(format!(
                "binary file exceeds the {} KiB editable hex limit; open the read-only preview instead",
                MAX_BINARY_EDIT_BYTES / 1024
            ));
        }

        return Ok(json!({
            "path": path_text(path),
            "name": display_name(path),
            "content": binary_dump(&bytes, bytes.len()),
            "encoding": "Binary",
            "bom": false,
            "binary": true,
            "readOnly": false,
            "hexEditable": true,
            "previewTruncated": false,
            "size": bytes.len(),
            "eol": "LF"
        }));
    }

    Ok(json!({
        "path": path_text(path),
        "name": display_name(path),
        "content": binary_dump(&bytes, MAX_BINARY_PREVIEW_BYTES),
        "encoding": "Binary",
        "bom": false,
        "binary": true,
        "readOnly": true,
        "hexEditable": false,
        "previewTruncated": bytes.len() > MAX_BINARY_PREVIEW_BYTES,
        "size": bytes.len(),
        "eol": "LF"
    }))
}

fn write_binary_file(path: &Path, hex: &str) -> Result<Value, String> {
    if path.as_os_str().is_empty() {
        return Err("file path is required".to_string());
    }
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("cannot inspect {}: {error}", path_text(path)))?;
    if !metadata.file_type().is_file() || metadata.file_type().is_symlink() {
        return Err("Editor only writes existing regular files".to_string());
    }

    let compact = hex.trim();
    if compact.len() % 2 != 0 {
        return Err("hex payload has an odd number of digits".to_string());
    }
    if compact.len() / 2 > MAX_FILE_BYTES as usize {
        return Err("binary content exceeds the Editor 8 MiB limit".to_string());
    }

    let mut bytes = Vec::with_capacity(compact.len() / 2);
    for index in (0..compact.len()).step_by(2) {
        let pair = &compact[index..index + 2];
        let byte = u8::from_str_radix(pair, 16)
            .map_err(|_| format!("invalid hexadecimal byte at offset {}", index / 2))?;
        bytes.push(byte);
    }

    fs::write(path, &bytes)
        .map_err(|error| format!("cannot save {}: {error}", path_text(path)))?;

    Ok(json!({
        "saved": true,
        "path": path_text(path),
        "name": display_name(path),
        "encoding": "Binary",
        "size": bytes.len()
    }))
}

fn write_text_file(path: &Path, content: &str, bom: bool) -> Result<Value, String> {
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

    let mut bytes = Vec::with_capacity(content.len() + if bom { 3 } else { 0 });
    if bom {
        bytes.extend_from_slice(b"\xEF\xBB\xBF");
    }
    bytes.extend_from_slice(content.as_bytes());

    fs::write(path, bytes)
        .map_err(|error| format!("cannot save {}: {error}", path_text(path)))?;

    Ok(json!({
        "saved": true,
        "path": path_text(path),
        "name": display_name(path),
        "encoding": "UTF-8",
        "bom": bom,
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
        "file.open" => {
            let result = host_call("file.open", json!({}))?;
            if result.get("opened") == Some(&Value::Bool(false)) {
                return Ok(json!({ "opened": false }));
            }
            let path = result
                .get("path")
                .and_then(Value::as_str)
                .ok_or_else(|| "host file.open did not return a path".to_string())?;
            read_text_file(Path::new(path), false, false)
        },
        "file.read" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Params {
                path: String,
                #[serde(default)]
                allow_binary: bool,
                #[serde(default)]
                edit_binary: bool,
            }
            let params: Params = serde_json::from_value(request.params.clone())
                .map_err(|error| format!("invalid file.read request: {error}"))?;
            read_text_file(Path::new(&params.path), params.allow_binary, params.edit_binary)
        }
        "file.write" => {
            #[derive(Deserialize)]
            struct Params {
                path: String,
                content: String,
                #[serde(default)]
                bom: bool,
            }
            let params: Params = serde_json::from_value(request.params.clone())
                .map_err(|error| format!("invalid file.write request: {error}"))?;
            write_text_file(Path::new(&params.path), &params.content, params.bom)
        }
        "file.write_binary" => {
            #[derive(Deserialize)]
            struct Params {
                path: String,
                hex: String,
            }
            let params: Params = serde_json::from_value(request.params.clone())
                .map_err(|error| format!("invalid file.write_binary request: {error}"))?;
            write_binary_file(Path::new(&params.path), &params.hex)
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
                    "content": params.content
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
        let source = Path::new(name);
        let stem = source
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("file");
        let filename = match source.extension().and_then(|value| value.to_str()) {
            Some(extension) => format!(
                "remotehand-editor-test-{stem}-{}.{}",
                std::process::id(),
                extension
            ),
            None => format!("remotehand-editor-test-{stem}-{}", std::process::id()),
        };
        path.push(filename);
        fs::write(&path, bytes).expect("write temp file");
        path
    }

    #[test]
    fn runtime_version_matches_manifest() {
        let manifest: serde_json::Value =
            serde_json::from_str(include_str!("../plugin.json")).expect("parse plugin.json");

        assert_eq!(manifest["version"], PLUGIN_VERSION);
    }

    #[test]
    fn detects_crlf_and_lf() {
        assert_eq!(detect_eol("one\r\ntwo\r\n"), "CRLF");
        assert_eq!(detect_eol("one\ntwo\n"), "LF");
    }

    #[test]
    fn reads_utf8_text() {
        let path = temp_file("utf8.txt", b"hello\nworld\n");
        let result = read_text_file(&path, false, false).unwrap();
        assert_eq!(result["content"], "hello\nworld\n");
        assert_eq!(result["encoding"], "UTF-8");
        assert_eq!(result["bom"], false);
        assert_eq!(result["eol"], "LF");
        let _ = fs::remove_file(path);
    }

    #[test]
    fn reads_utf8_bom_without_exposing_it_as_text() {
        let path = temp_file("utf8-bom.py", b"\xEF\xBB\xBFprint(\"hello\")\n");
        let result = read_text_file(&path, false, false).unwrap();
        assert_eq!(result["content"], "print(\"hello\")\n");
        assert_eq!(result["encoding"], "UTF-8");
        assert_eq!(result["bom"], true);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn reports_binary_content_without_exposing_bytes() {
        let path = temp_file("binary.txt", &[1, 2, 0, 4]);
        let result = read_text_file(&path, false, false).unwrap();
        assert_eq!(result["binary"], true);
        assert!(result.get("content").is_none());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn reads_text_regardless_of_extension() {
        let path = temp_file("notes.unknownext", b"plain text\n");
        let result = read_text_file(&path, false, false).unwrap();
        assert_eq!(result["content"], "plain text\n");
        assert_eq!(result["binary"], false);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn reports_binary_before_previewing_it() {
        let path = temp_file("sample.bin", &[0x00, 0x01, 0x41, 0x42, 0xFF]);
        let result = read_text_file(&path, false, false).unwrap();
        assert_eq!(result["binary"], true);
        assert!(result.get("content").is_none());
        let _ = fs::remove_file(path);
    }

    #[test]
    fn returns_read_only_hex_preview_for_binary() {
        let path = temp_file("sample.bin", &[0x00, 0x01, 0x41, 0x42, 0xFF]);
        let result = read_text_file(&path, true, false).unwrap();
        assert_eq!(result["binary"], true);
        assert_eq!(result["readOnly"], true);
        assert!(result["content"].as_str().unwrap().contains("00 01 41 42 FF"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn returns_editable_full_hex_for_small_binary() {
        let path = temp_file("editable.bin", &[0x00, 0x01, 0x41, 0x42, 0xFF]);
        let result = read_text_file(&path, true, true).unwrap();
        assert_eq!(result["binary"], true);
        assert_eq!(result["readOnly"], false);
        assert_eq!(result["hexEditable"], true);
        assert_eq!(result["previewTruncated"], false);
        assert!(result["content"].as_str().unwrap().contains("00 01 41 42 FF"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn writes_binary_from_hex_payload() {
        let path = temp_file("write-binary.bin", &[0x00]);
        write_binary_file(&path, "4D5A9000").unwrap();
        assert_eq!(fs::read(&path).unwrap(), &[0x4D, 0x5A, 0x90, 0x00]);
        let _ = fs::remove_file(path);
    }

    #[test]
    fn writes_existing_regular_file() {
        let path = temp_file("write.txt", b"old");
        write_text_file(&path, "new\r\n", false).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "new\r\n");
        let _ = fs::remove_file(path);
    }

    #[test]
    fn preserves_utf8_bom_when_requested() {
        let path = temp_file("write-bom.txt", b"old");
        write_text_file(&path, "new\n", true).unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"\xEF\xBB\xBFnew\n");
        let _ = fs::remove_file(path);
    }
}
