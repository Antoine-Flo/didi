// Files: the user's documents (any path, chosen in a dialog), and app data files
// (palettes, recovery…) in the app data folder, e.g. ~/.local/share/<identifier>/ on
// Linux. App data commands only accept plain file names, so they cannot reach anything
// outside that folder.
//
// Binary contents travel as raw IPC bodies (no JSON encoding), with the path or name in
// a header, percent-encoded since headers are ASCII.

use std::ffi::OsString;
use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

/// A file name made of letters, digits, `-` and `_`, with an extension: "palettes.json".
fn valid_name(name: &str) -> bool {
    let mut parts = name.splitn(2, '.');
    let stem = parts.next().unwrap_or("");
    let ext = parts.next().unwrap_or("");
    let ok = |s: &str| {
        !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    };
    ok(stem) && ok(ext)
}

fn data_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !valid_name(name) {
        return Err(format!("Invalid file name: {name}"));
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

/// Writes a file atomically: a crash never leaves a half-written file.
fn write_atomic(target: &Path, contents: &[u8]) -> Result<(), String> {
    if let Some(dir) = target.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut temp: OsString = target.as_os_str().to_owned();
    temp.push(".didi-tmp");
    let temp = PathBuf::from(temp);
    fs::write(&temp, contents).map_err(|e| e.to_string())?;
    fs::rename(&temp, target).map_err(|e| {
        let _ = fs::remove_file(&temp);
        e.to_string()
    })
}

/// Decodes `%XX` sequences (UTF-8), as written by JavaScript's encodeURIComponent.
fn percent_decode(text: &str) -> Result<String, String> {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = text.get(i + 1..i + 3).ok_or("Invalid percent-encoding")?;
            out.push(u8::from_str_radix(hex, 16).map_err(|_| "Invalid percent-encoding")?);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).map_err(|_| "Invalid UTF-8 in header".to_string())
}

/// A header and the raw body of a request.
fn header_and_body<'a>(request: &'a Request<'_>, header: &str) -> Result<(String, &'a [u8]), String> {
    let value = request
        .headers()
        .get(header)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| format!("Missing {header} header"))?;
    let InvokeBody::Raw(body) = request.body() else {
        return Err("Expected raw bytes".into());
    };
    Ok((percent_decode(value)?, body))
}

fn read_optional(path: &Path) -> Result<Option<Vec<u8>>, String> {
    match fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// The text of a data file, or None if it does not exist yet.
#[tauri::command]
pub fn data_read(app: AppHandle, name: String) -> Result<Option<String>, String> {
    read_optional(&data_path(&app, &name)?)?
        .map(|bytes| String::from_utf8(bytes).map_err(|e| e.to_string()))
        .transpose()
}

#[tauri::command]
pub fn data_write(app: AppHandle, name: String, contents: String) -> Result<(), String> {
    write_atomic(&data_path(&app, &name)?, contents.as_bytes())
}

/// The bytes of a data file. Fails with "NotFound" if it does not exist.
#[tauri::command]
pub fn data_read_bytes(app: AppHandle, name: String) -> Result<Response, String> {
    read_optional(&data_path(&app, &name)?)?
        .map(Response::new)
        .ok_or_else(|| "NotFound".to_string())
}

/// Writes the raw body to the data file named in the `name` header.
#[tauri::command]
pub fn data_write_bytes(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let (name, body) = header_and_body(&request, "name")?;
    write_atomic(&data_path(&app, &name)?, body)
}

/// Removes a data file. Nothing happens if it does not exist.
#[tauri::command]
pub fn data_remove(app: AppHandle, name: String) -> Result<(), String> {
    match fs::remove_file(data_path(&app, &name)?) {
        Err(e) if e.kind() != ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// The bytes of a user file (a path chosen in a dialog, or a recent file).
#[tauri::command]
pub fn file_read(path: String) -> Result<Response, String> {
    fs::read(&path).map(Response::new).map_err(|e| e.to_string())
}

/// Writes the raw body to the user file in the `path` header, atomically.
#[tauri::command]
pub fn file_write(request: Request<'_>) -> Result<(), String> {
    let (path, body) = header_and_body(&request, "path")?;
    write_atomic(Path::new(&path), body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_names_only() {
        assert!(valid_name("palettes.json"));
        assert!(valid_name("my-file_2.json"));
        for name in ["", "palettes", ".json", "../x.json", "a/b.json", "a.b.json", "x.", "é.json"] {
            assert!(!valid_name(name), "{name}");
        }
    }

    #[test]
    fn decodes_percent_encoding() {
        assert_eq!(percent_decode("/home/a%C3%A9/x%20y.didi").unwrap(), "/home/aé/x y.didi");
        assert!(percent_decode("%Z1").is_err());
        assert!(percent_decode("%4").is_err());
    }

    #[test]
    fn writes_atomically() {
        let dir = std::env::temp_dir().join(format!("didi-test-{}", std::process::id()));
        let target = dir.join("doc.didi");
        write_atomic(&target, b"one").unwrap();
        write_atomic(&target, b"two").unwrap();
        assert_eq!(fs::read(&target).unwrap(), b"two");
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 1, "no temporary file left");
        fs::remove_dir_all(&dir).unwrap();
    }
}
