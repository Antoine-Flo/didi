// User data files (palettes, later settings…) in the app data folder, e.g.
// ~/.local/share/<identifier>/ on Linux. Only plain file names are accepted, so the
// front end cannot reach anything outside that folder.

use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;
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

fn path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !valid_name(name) {
        return Err(format!("Invalid file name: {name}"));
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(name))
}

/// The contents of a data file, or None if it does not exist yet.
#[tauri::command]
pub fn data_read(app: AppHandle, name: String) -> Result<Option<String>, String> {
    match fs::read_to_string(path(&app, &name)?) {
        Ok(text) => Ok(Some(text)),
        Err(e) if e.kind() == ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

/// Writes a data file atomically: a crash never leaves a half-written file.
#[tauri::command]
pub fn data_write(app: AppHandle, name: String, contents: String) -> Result<(), String> {
    let target = path(&app, &name)?;
    if let Some(dir) = target.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let temp = target.with_extension("tmp");
    fs::write(&temp, contents).map_err(|e| e.to_string())?;
    fs::rename(&temp, &target).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::valid_name;

    #[test]
    fn accepts_plain_names_only() {
        assert!(valid_name("palettes.json"));
        assert!(valid_name("my-file_2.json"));
        for name in ["", "palettes", ".json", "../x.json", "a/b.json", "a.b.json", "x.", "é.json"] {
            assert!(!valid_name(name), "{name}");
        }
    }
}
